[CmdletBinding()]
param(
    [switch]$CheckOnly,
    [switch]$AllowMissingSidebery
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$ZenfoxRepo = if ($env:ZENFOX_REPO) { $env:ZENFOX_REPO } else { 'sanhua1/zenfox' }
$ZenfoxRef = if ($env:ZENFOX_REF) { $env:ZENFOX_REF } else { 'main' }
$SideberyId = '{3c078156-979c-498b-8990-85f7987dd929}'
$SideberyUrl = 'https://addons.mozilla.org/firefox/addon/sidebery/'
$script:TempRoot = $null

function Write-Zenfox([string]$Message) {
    Write-Host "[zenfox] $Message"
}

function Stop-Zenfox([string]$Message) {
    throw "[zenfox] $Message"
}

function Get-FirefoxInstall {
    $candidates = New-Object System.Collections.Generic.List[string]
    if ($env:ZENFOX_FIREFOX_ROOT) { $candidates.Add($env:ZENFOX_FIREFOX_ROOT) }
    if ($env:ProgramFiles) { $candidates.Add((Join-Path $env:ProgramFiles 'Mozilla Firefox')) }
    $programFilesX86 = [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
    if ($programFilesX86) { $candidates.Add((Join-Path $programFilesX86 'Mozilla Firefox')) }
    if ($env:LOCALAPPDATA) { $candidates.Add((Join-Path $env:LOCALAPPDATA 'Mozilla Firefox')) }

    $appPathKeys = @(
        'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\firefox.exe',
        'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\firefox.exe',
        'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\firefox.exe'
    )
    foreach ($key in $appPathKeys) {
        if (Test-Path $key) {
            $value = (Get-Item $key).GetValue('')
            if ($value) { $candidates.Add((Split-Path -Parent $value)) }
        }
    }

    foreach ($root in ($candidates | Select-Object -Unique)) {
        $exe = Join-Path $root 'firefox.exe'
        if ((Test-Path $exe) -and (Test-Path (Join-Path $root 'defaults\pref'))) {
            return [pscustomobject]@{ Root = $root; Exe = $exe }
        }
    }
    return $null
}

function Get-IniDefault([string]$Path) {
    if (-not (Test-Path $Path)) { return $null }
    foreach ($line in Get-Content -LiteralPath $Path) {
        if ($line -match '^Default=(.+)$') { return $Matches[1].Trim() }
    }
    return $null
}

function Get-ProfileDefault([string]$Path) {
    if (-not (Test-Path $Path)) { return $null }
    $currentPath = $null
    $isDefault = $false
    foreach ($line in (Get-Content -LiteralPath $Path) + '[End]') {
        if ($line -match '^\[') {
            if ($isDefault -and $currentPath) { return $currentPath }
            $currentPath = $null
            $isDefault = $false
        } elseif ($line -match '^Path=(.+)$') {
            $currentPath = $Matches[1].Trim()
        } elseif ($line -eq 'Default=1') {
            $isDefault = $true
        }
    }
    return $null
}

function Get-FirefoxProfile {
    if ($env:ZENFOX_PROFILE) {
        if (-not (Test-Path $env:ZENFOX_PROFILE -PathType Container)) {
            Stop-Zenfox "ZENFOX_PROFILE does not exist: $env:ZENFOX_PROFILE"
        }
        return (Resolve-Path $env:ZENFOX_PROFILE).Path
    }

    $base = Join-Path $env:APPDATA 'Mozilla\Firefox'
    if (-not (Test-Path (Join-Path $base 'profiles.ini'))) { return $null }
    $relative = Get-IniDefault (Join-Path $base 'installs.ini')
    if (-not $relative) { $relative = Get-ProfileDefault (Join-Path $base 'profiles.ini') }
    if ($relative) {
        $candidate = if ([IO.Path]::IsPathRooted($relative)) { $relative } else { Join-Path $base $relative }
        if (Test-Path $candidate -PathType Container) { return (Resolve-Path $candidate).Path }
    }

    $profilesDir = Join-Path $base 'Profiles'
    $fallback = Get-ChildItem $profilesDir -Directory -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($fallback) { return $fallback.FullName }
    return $null
}

function Get-SideberyStatus([string]$Profile) {
    $manifest = Join-Path $Profile 'extensions.json'
    if (-not (Test-Path $manifest)) { return [pscustomobject]@{ Installed = $false; Active = $false; Version = $null } }
    try {
        $data = Get-Content -Raw -LiteralPath $manifest | ConvertFrom-Json
        $addon = @($data.addons) | Where-Object { $_.id -eq $SideberyId } | Select-Object -First 1
        if ($addon) {
            return [pscustomobject]@{
                Installed = $true
                Active = [bool]$addon.active
                Version = [string]$addon.version
            }
        }
    } catch {
        Stop-Zenfox "Could not parse $manifest"
    }
    return [pscustomobject]@{ Installed = $false; Active = $false; Version = $null }
}

function Get-SourceRoot {
    if ($PSScriptRoot) {
        $localPayload = Join-Path $PSScriptRoot 'payload\profile\chrome\userChrome.css'
        if (Test-Path $localPayload) { return $PSScriptRoot }
    }

    $script:TempRoot = Join-Path $env:TEMP ("zenfox-" + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $script:TempRoot | Out-Null
    $archive = Join-Path $script:TempRoot 'zenfox.zip'
    Write-Zenfox "Downloading Zenfox $ZenfoxRef from GitHub..."
    Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/$ZenfoxRepo/archive/$ZenfoxRef.zip" -OutFile $archive
    Expand-Archive -LiteralPath $archive -DestinationPath $script:TempRoot -Force
    $payload = Get-ChildItem $script:TempRoot -Directory -Recurse -Filter payload | Select-Object -First 1
    if (-not $payload) { Stop-Zenfox 'Downloaded archive does not contain payload/.' }
    return $payload.Parent.FullName
}

function Install-ProgramPayload([string]$Payload, [string]$FirefoxRoot) {
    $configDestination = Join-Path $FirefoxRoot 'config.js'
    $prefsDestination = Join-Path $FirefoxRoot 'defaults\pref\config-prefs.js'
    try {
        New-Item -ItemType Directory -Path (Split-Path $prefsDestination -Parent) -Force | Out-Null
        Copy-Item (Join-Path $Payload 'firefox\config.js') $configDestination -Force
        Copy-Item (Join-Path $Payload 'firefox\defaults\pref\config-prefs.js') $prefsDestination -Force
        return
    } catch {
        Write-Zenfox 'Administrator permission is required for the Firefox program directory.'
    }

    $helper = Join-Path $env:TEMP ("zenfox-elevated-" + [guid]::NewGuid().ToString('N') + '.ps1')
    @'
param([string]$Payload, [string]$FirefoxRoot)
$ErrorActionPreference = 'Stop'
$prefs = Join-Path $FirefoxRoot 'defaults\pref\config-prefs.js'
New-Item -ItemType Directory -Path (Split-Path $prefs -Parent) -Force | Out-Null
Copy-Item (Join-Path $Payload 'firefox\config.js') (Join-Path $FirefoxRoot 'config.js') -Force
Copy-Item (Join-Path $Payload 'firefox\defaults\pref\config-prefs.js') $prefs -Force
'@ | Set-Content -LiteralPath $helper -Encoding UTF8

    $quote = { param($Value) '"' + $Value + '"' }
    $arguments = @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (& $quote $helper),
        '-Payload', (& $quote $Payload), '-FirefoxRoot', (& $quote $FirefoxRoot)
    ) -join ' '
    $process = Start-Process powershell.exe -Verb RunAs -Wait -PassThru -ArgumentList $arguments
    Remove-Item -LiteralPath $helper -Force -ErrorAction SilentlyContinue
    if ($process.ExitCode -ne 0) { Stop-Zenfox 'Elevated installation failed or was cancelled.' }
}

try {
    $firefox = Get-FirefoxInstall
    if (-not $firefox) {
        if (-not $CheckOnly) { Start-Process 'https://www.mozilla.org/firefox/new/' }
        Stop-Zenfox 'Firefox was not found. Install it, launch it once, then rerun Zenfox.'
    }
    $profile = Get-FirefoxProfile
    if (-not $profile) { Stop-Zenfox 'No Firefox profile found. Launch Firefox once, close it, then rerun Zenfox.' }

    Write-Zenfox "Firefox: $($firefox.Exe)"
    Write-Zenfox "Profile: $profile"

    $sidebery = Get-SideberyStatus $profile
    if ($sidebery.Installed -and $sidebery.Active) {
        Write-Zenfox "Sidebery: installed and active (v$($sidebery.Version))"
    } elseif ($sidebery.Installed) {
        Write-Zenfox "Sidebery: installed but disabled (v$($sidebery.Version))"
        if (-not $AllowMissingSidebery) {
            if (-not $CheckOnly) { Start-Process $firefox.Exe -ArgumentList 'about:addons' }
            Stop-Zenfox 'Enable Sidebery, then rerun Zenfox.'
        }
    } else {
        Write-Zenfox 'Sidebery: not installed'
        if (-not $AllowMissingSidebery) {
            if (-not $CheckOnly) { Start-Process $SideberyUrl }
            Stop-Zenfox "Install Sidebery from $SideberyUrl, then rerun Zenfox."
        }
    }

    if ($CheckOnly) {
        Write-Zenfox 'Check complete; no files were changed.'
        exit 0
    }

    $running = @(Get-Process firefox -ErrorAction SilentlyContinue)
    if ($running.Count -gt 0) {
        $answer = Read-Host 'Firefox is running. Close it gracefully and continue? [y/N]'
        if ($answer -notmatch '^[Yy]$') { Stop-Zenfox 'Close Firefox and rerun Zenfox.' }
        foreach ($process in $running) { [void]$process.CloseMainWindow() }
        for ($i = 0; $i -lt 40; $i++) {
            if (-not (Get-Process firefox -ErrorAction SilentlyContinue)) { break }
            Start-Sleep -Milliseconds 250
        }
        if (Get-Process firefox -ErrorAction SilentlyContinue) { Stop-Zenfox 'Firefox did not exit. Close it manually and rerun Zenfox.' }
    }

    $sourceRoot = Get-SourceRoot
    $payload = Join-Path $sourceRoot 'payload'
    if (-not (Test-Path (Join-Path $payload 'firefox\config.js'))) { Stop-Zenfox 'Zenfox payload is incomplete.' }

    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $backup = Join-Path $profile "zenfox-backups\$stamp"
    New-Item -ItemType Directory -Path (Join-Path $backup 'profile\chrome\JS') -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $backup 'firefox\defaults\pref') -Force | Out-Null

    $backupMap = @(
        @{ Source = (Join-Path $profile 'chrome\userChrome.css'); Destination = (Join-Path $backup 'profile\chrome\userChrome.css') },
        @{ Source = (Join-Path $profile 'chrome\JS\LeftChrome.uc.js'); Destination = (Join-Path $backup 'profile\chrome\JS\LeftChrome.uc.js') },
        @{ Source = (Join-Path $profile 'user.js'); Destination = (Join-Path $backup 'profile\user.js') },
        @{ Source = (Join-Path $firefox.Root 'config.js'); Destination = (Join-Path $backup 'firefox\config.js') },
        @{ Source = (Join-Path $firefox.Root 'defaults\pref\config-prefs.js'); Destination = (Join-Path $backup 'firefox\defaults\pref\config-prefs.js') }
    )
    foreach ($item in $backupMap) {
        if (Test-Path $item.Source) { Copy-Item $item.Source $item.Destination -Force }
    }
    $existingUtils = Join-Path $profile 'chrome\utils'
    if (Test-Path $existingUtils) { Copy-Item $existingUtils (Join-Path $backup 'profile\chrome\utils') -Recurse -Force }

    Install-ProgramPayload $payload $firefox.Root

    $chrome = Join-Path $profile 'chrome'
    New-Item -ItemType Directory -Path (Join-Path $chrome 'JS') -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $chrome 'utils') -Force | Out-Null
    Copy-Item (Join-Path $payload 'profile\chrome\userChrome.css') (Join-Path $chrome 'userChrome.css') -Force
    Copy-Item (Join-Path $payload 'profile\chrome\JS\LeftChrome.uc.js') (Join-Path $chrome 'JS\LeftChrome.uc.js') -Force
    Copy-Item (Join-Path $payload 'profile\chrome\utils\*') (Join-Path $chrome 'utils') -Recurse -Force
    Copy-Item (Join-Path $payload 'profile\chrome\sidebery-companion.css') (Join-Path $chrome 'sidebery-companion.css') -Force

    $userJs = Join-Path $profile 'user.js'
    $userJsContent = if (Test-Path $userJs) { Get-Content -Raw $userJs } else { '' }
    if ($userJsContent -notmatch 'user_pref\("toolkit\.legacyUserProfileCustomizations\.stylesheets",\s*true\);') {
        Add-Content -LiteralPath $userJs -Value "`r`n// Zenfox`r`nuser_pref(`"toolkit.legacyUserProfileCustomizations.stylesheets`", true);"
    }
    if ($userJsContent -notmatch 'user_pref\("userChromeJS\.enabled",\s*true\);') {
        Add-Content -LiteralPath $userJs -Value 'user_pref("userChromeJS.enabled", true);'
    }

    $cache = Join-Path $env:LOCALAPPDATA ("Mozilla\Firefox\Profiles\" + (Split-Path $profile -Leaf) + '\startupCache')
    if (Test-Path $cache) { Move-Item $cache ($cache + ".pre-zenfox-$stamp") }

    Write-Zenfox "Installed successfully. Backup: $backup"
    Write-Zenfox "Optional Sidebery CSS: $(Join-Path $chrome 'sidebery-companion.css')"
    Start-Process $firefox.Exe
} finally {
    if ($script:TempRoot -and (Test-Path $script:TempRoot)) {
        Remove-Item $script:TempRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
