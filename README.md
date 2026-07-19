# Zenfox

[English](README.md) | [简体中文](README.zh-CN.md)

A Zen-inspired Firefox UI with Sidebery tree tabs and native browser controls.

## Why Zenfox?

Zen Browser inspired the idea of placing browser controls in the upper-left corner instead of reserving a full-width toolbar. With no permanent UI across the top or bottom of the window, more of the screen belongs to the page itself.

I previously used a custom Firefox setup that automatically hid and revealed the top toolbar through `userChrome.css`. It worked, but the reveal delay and constant show/hide interaction were never as convenient as keeping every control in one compact corner.

Moving to Zen Browser was not a good fit either: I rely heavily on Sidebery and its tree-style tabs, while Zen's own sidebar does not integrate with Sidebery and does not provide the same native tree workflow.

Zenfox keeps Firefox and Sidebery, but rearranges Firefox's native UI instead. It moves navigation, the URL bar, downloads, and extension controls into a compact upper-left block above the Sidebery tree—preserving native browser behavior while removing the full-width top chrome.

![Zenfox interface with native controls above Sidebery tree tabs](images/1.png)

Zenfox is an independent customization project and is not affiliated with Zen Browser, Mozilla, or Sidebery.

## Before installing

1. Install Firefox and launch it once so that it creates a Profile.
2. Install [Sidebery](https://addons.mozilla.org/firefox/addon/sidebery/).
3. Close Firefox when the installer asks.

The installers detect Firefox, the active Profile, and Sidebery before changing anything. Existing Zenfox/userChrome files are copied to `<Profile>/zenfox-backups/<timestamp>/` before installation.

> Compatibility status: the current UI is tested on macOS with Firefox 152. Windows and Linux installation/detection are implemented but their native window controls and final layout still require platform-specific visual QA.

## One-line install

### Windows 10/11

Open the built-in **PowerShell** or **Windows Terminal** and run:

```powershell
$p=Join-Path $env:TEMP 'zenfox-install.ps1'; $u='https://raw.githubusercontent.com/sanhua1/zenfox/main/install-windows.ps1?cb='+[guid]::NewGuid().ToString('N'); Invoke-WebRequest -UseBasicParsing -Headers @{'Cache-Control'='no-cache'} -Uri $u -OutFile $p; powershell.exe -NoProfile -ExecutionPolicy Bypass -File $p
```

PowerShell 7, Git, Python, and Node.js are not required. Windows may show one UAC prompt when Zenfox writes the two fx-autoconfig bootstrap files into the Firefox program directory.

### macOS

```bash
curl -fsSL -H 'Cache-Control: no-cache' "https://raw.githubusercontent.com/sanhua1/zenfox/main/install-macos.sh?cb=$(date +%s)-$$" | bash
```

### Linux

```bash
curl -fsSL -H 'Cache-Control: no-cache' "https://raw.githubusercontent.com/sanhua1/zenfox/main/install-linux.sh?cb=$(date +%s)-$$" | bash
```

Native/tarball Firefox installations are supported. Snap and Flatpak Firefox are not supported because their program directories are sandboxed or read-only.

The installer can detect Sidebery but cannot modify Sidebery's private extension settings. Its optional companion CSS must be pasted into Sidebery's Styles editor manually.

On browser launch, Zenfox disables Firefox's separate native sidebar launcher and selects Sidebery as the active sidebar. This prevents new Firefox profiles from showing both the native launcher and the Sidebery panel.

## Detection only

From a cloned repository, check prerequisites without writing files:

```bash
./install-macos.sh --check
./install-linux.sh --check
```

```powershell
.\install-windows.ps1 -CheckOnly
```

If Sidebery is intentionally not installed, pass `--allow-missing-sidebery` on macOS/Linux or `-AllowMissingSidebery` on Windows.

## What gets installed

```text
Firefox program directory
├── config.js
└── defaults/pref/config-prefs.js

Firefox Profile
├── user.js                         # enables userChrome + userChromeJS
└── chrome/
    ├── userChrome.css
    ├── platform-windows-linux.css   # compact native window controls
    ├── sidebery-companion.css      # optional; paste into Sidebery styles
    ├── JS/LeftChrome.uc.js
    └── utils/                      # fx-autoconfig runtime
```

Firefox updates can overwrite the two program-directory bootstrap files. Running the installer again repairs them and creates a fresh backup first.

## Updating and repair

Run the same one-line install command again to update or repair Zenfox. Every run re-detects Firefox, the active Profile, and Sidebery; creates a new timestamped backup; and then installs the current payload.

For maintainers:

- Shared UI changes belong in `payload/profile/chrome/userChrome.css` and `payload/profile/chrome/JS/LeftChrome.uc.js`; Windows/Linux window-control geometry lives in `payload/profile/chrome/platform-windows-linux.css`.
- fx-autoconfig runtime updates belong in `payload/profile/chrome/utils/` and `payload/firefox/`.
- Installer behavior is maintained in the three platform scripts.
- Update `VERSION` whenever publishing a new Zenfox release.

The default commands track the `main` branch. Stable releases can instead pin `ZENFOX_REF` to a tested tag, allowing development and release channels to be maintained separately.

## Advanced overrides

The scripts prefer the currently running Firefox Profile when exactly one is active, then fall back to Firefox's install-default Profile. These environment variables override automatic detection:

```text
ZENFOX_PROFILE
ZENFOX_REF
ZENFOX_REPO
ZENFOX_FIREFOX_APP     # macOS
ZENFOX_FIREFOX_ROOT   # Windows/Linux
```

## Security

`fx-autoconfig` executes privileged browser UI code. Review scripts before running them and install Zenfox only from a source you trust. The Windows `-ExecutionPolicy Bypass` flag applies only to that PowerShell process and does not change the machine's permanent execution policy.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for bundled third-party code.
