#!/usr/bin/env bash
set -euo pipefail

ZENFOX_REPO="${ZENFOX_REPO:-sanhua1/zenfox}"
ZENFOX_REF="${ZENFOX_REF:-main}"
SIDEBERY_ID="{3c078156-979c-498b-8990-85f7987dd929}"
SIDEBERY_URL="https://addons.mozilla.org/firefox/addon/sidebery/"
CHECK_ONLY=0
ALLOW_MISSING_SIDEBERY=0
TMP_ROOT=""

for arg in "$@"; do
  case "$arg" in
    --check) CHECK_ONLY=1 ;;
    --allow-missing-sidebery) ALLOW_MISSING_SIDEBERY=1 ;;
    -h|--help)
      printf '%s\n' "Usage: $0 [--check] [--allow-missing-sidebery]"
      exit 0
      ;;
    *) printf 'Unknown option: %s\n' "$arg" >&2; exit 2 ;;
  esac
done

log() { printf '[zenfox] %s\n' "$*"; }
die() { printf '[zenfox] ERROR: %s\n' "$*" >&2; exit 1; }
cleanup() {
  if [[ -n "$TMP_ROOT" && -d "$TMP_ROOT" ]]; then
    rm -rf -- "$TMP_ROOT"
  fi
}
trap cleanup EXIT

command -v curl >/dev/null 2>&1 || die "curl is required."
command -v tar >/dev/null 2>&1 || die "tar is required."

find_firefox() {
  local cmd=""
  local resolved=""
  local root=""
  local binary=""
  if [[ -n "${ZENFOX_FIREFOX_ROOT:-}" ]]; then
    root="$ZENFOX_FIREFOX_ROOT"
    [[ -x "$root/firefox" ]] || die "ZENFOX_FIREFOX_ROOT does not contain a Firefox binary: $root"
    printf '%s|%s\n' "$root" "$root/firefox"
    return
  fi

  cmd=$(command -v firefox 2>/dev/null || command -v firefox-esr 2>/dev/null || true)
  [[ -n "$cmd" ]] || return 1
  resolved=$(readlink -f "$cmd" 2>/dev/null || printf '%s' "$cmd")
  case "$resolved" in
    /snap/*|*/flatpak/*) die "Snap/Flatpak Firefox is sandboxed and not supported by fx-autoconfig. Install Mozilla's tarball or a native package." ;;
  esac

  for root in \
    "$(dirname "$resolved")" \
    "/usr/lib/firefox" \
    "/usr/lib/firefox-esr" \
    "/usr/lib64/firefox" \
    "/opt/firefox"; do
    binary=""
    if [[ -x "$root/firefox" ]]; then binary="$root/firefox"; fi
    if [[ -z "$binary" && -x "$root/firefox-esr" ]]; then binary="$root/firefox-esr"; fi
    if [[ -n "$binary" && -d "$root/defaults/pref" ]]; then
      printf '%s|%s\n' "$root" "$binary"
      return
    fi
  done
  return 1
}

resolve_profile() {
  local base="$HOME/.mozilla/firefox"
  local rel=""
  local candidate=""
  if [[ -n "${ZENFOX_PROFILE:-}" ]]; then
    [[ -d "$ZENFOX_PROFILE" ]] || die "ZENFOX_PROFILE does not exist: $ZENFOX_PROFILE"
    printf '%s\n' "$ZENFOX_PROFILE"
    return
  fi
  [[ -f "$base/profiles.ini" ]] || return 1
  if [[ -f "$base/installs.ini" ]]; then
    rel=$(awk -F= '$1 == "Default" { print substr($0, index($0, "=") + 1); exit }' "$base/installs.ini")
  fi
  if [[ -z "$rel" ]]; then
    rel=$(awk -F= '
      /^\[Profile[0-9]+\]$/ {
        if (def == "1" && path != "") { print path; exit }
        path=""; def=""; next
      }
      $1 == "Path" { path=substr($0, index($0, "=") + 1) }
      $1 == "Default" { def=substr($0, index($0, "=") + 1) }
      END { if (def == "1" && path != "") print path }
    ' "$base/profiles.ini")
  fi
  if [[ -n "$rel" ]]; then
    if [[ "$rel" = /* ]]; then candidate="$rel"; else candidate="$base/$rel"; fi
    if [[ -d "$candidate" ]]; then printf '%s\n' "$candidate"; return; fi
  fi
  candidate=$(ls -td "$base"/* 2>/dev/null | head -n 1 || true)
  [[ -n "$candidate" && -d "$candidate" ]] || return 1
  printf '%s\n' "$candidate"
}

prepare_source() {
  local script_dir=""
  local payload_dir=""
  if [[ -n "${BASH_SOURCE[0]:-}" ]]; then
    script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || true)
  fi
  if [[ -n "$script_dir" && -f "$script_dir/payload/profile/chrome/userChrome.css" ]]; then
    SOURCE_ROOT="$script_dir"
    return
  fi
  TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/zenfox.XXXXXX")
  log "Downloading Zenfox $ZENFOX_REF from GitHub..." >&2
  curl -fsSL -H 'Cache-Control: no-cache' "https://github.com/$ZENFOX_REPO/archive/$ZENFOX_REF.tar.gz?cb=$(date +%s)-$$" -o "$TMP_ROOT/zenfox.tar.gz"
  tar -xzf "$TMP_ROOT/zenfox.tar.gz" -C "$TMP_ROOT"
  payload_dir=$(find "$TMP_ROOT" -mindepth 2 -maxdepth 3 -type d -name payload -print -quit)
  [[ -n "$payload_dir" ]] || die "Downloaded archive does not contain payload/."
  SOURCE_ROOT=$(dirname "$payload_dir")
}

sidebery_installed() {
  local manifest="$1/extensions.json"
  [[ -f "$manifest" ]] && grep -Fq "$SIDEBERY_ID" "$manifest"
}

confirm() {
  local prompt="$1"
  local answer=""
  [[ -r /dev/tty ]] || return 1
  printf '%s [y/N] ' "$prompt" >/dev/tty
  IFS= read -r answer </dev/tty || true
  [[ "$answer" = "y" || "$answer" = "Y" ]]
}

install_program_file() {
  local src="$1"
  local dst="$2"
  local parent
  parent=$(dirname "$dst")
  if [[ -w "$parent" && ( ! -e "$dst" || -w "$dst" ) ]]; then
    mkdir -p "$parent"
    cp -p "$src" "$dst"
  else
    command -v sudo >/dev/null 2>&1 || die "sudo is required to write $dst"
    log "Administrator permission is required for $dst"
    sudo mkdir -p "$parent"
    sudo cp -p "$src" "$dst"
    sudo chmod 0644 "$dst"
  fi
}

FIREFOX_INFO=$(find_firefox) || die "Firefox was not found. Install a native Firefox package, launch it once, then rerun Zenfox."
FIREFOX_ROOT=${FIREFOX_INFO%%|*}
FIREFOX_BIN=${FIREFOX_INFO#*|}
PROFILE=$(resolve_profile) || die "No Firefox profile found. Launch Firefox once, close it, then rerun Zenfox."

log "Firefox: $FIREFOX_BIN"
log "Program root: $FIREFOX_ROOT"
log "Profile: $PROFILE"

if sidebery_installed "$PROFILE"; then
  log "Sidebery: installed"
else
  log "Sidebery: not installed"
  if [[ "$ALLOW_MISSING_SIDEBERY" -ne 1 ]]; then
    if [[ "$CHECK_ONLY" -ne 1 ]]; then
      command -v xdg-open >/dev/null 2>&1 && xdg-open "$SIDEBERY_URL" >/dev/null 2>&1 || true
    fi
    die "Install Sidebery from $SIDEBERY_URL, then rerun Zenfox."
  fi
  log "Continuing because --allow-missing-sidebery was supplied."
fi

if [[ "$CHECK_ONLY" -eq 1 ]]; then
  log "Check complete; no files were changed."
  exit 0
fi

if pgrep -x firefox >/dev/null 2>&1 || pgrep -x firefox-esr >/dev/null 2>&1; then
  confirm "Firefox is running. Ask it to close and continue?" || die "Close Firefox and rerun Zenfox."
  pkill -TERM -x firefox >/dev/null 2>&1 || true
  pkill -TERM -x firefox-esr >/dev/null 2>&1 || true
  for _ in $(seq 1 40); do
    if ! pgrep -x firefox >/dev/null 2>&1 && ! pgrep -x firefox-esr >/dev/null 2>&1; then break; fi
    sleep 0.25
  done
  if pgrep -x firefox >/dev/null 2>&1 || pgrep -x firefox-esr >/dev/null 2>&1; then
    die "Firefox did not exit."
  fi
fi

SOURCE_ROOT=""
prepare_source
PAYLOAD="$SOURCE_ROOT/payload"
[[ -f "$PAYLOAD/firefox/config.js" ]] || die "Zenfox payload is incomplete."

STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP="$PROFILE/zenfox-backups/$STAMP"
mkdir -p "$BACKUP/profile/chrome/JS" "$BACKUP/profile/chrome" "$BACKUP/firefox/defaults/pref"
[[ -f "$PROFILE/chrome/userChrome.css" ]] && cp -p "$PROFILE/chrome/userChrome.css" "$BACKUP/profile/chrome/userChrome.css"
[[ -f "$PROFILE/chrome/platform-windows-linux.css" ]] && cp -p "$PROFILE/chrome/platform-windows-linux.css" "$BACKUP/profile/chrome/platform-windows-linux.css"
[[ -f "$PROFILE/chrome/JS/LeftChrome.uc.js" ]] && cp -p "$PROFILE/chrome/JS/LeftChrome.uc.js" "$BACKUP/profile/chrome/JS/LeftChrome.uc.js"
[[ -d "$PROFILE/chrome/utils" ]] && cp -R "$PROFILE/chrome/utils" "$BACKUP/profile/chrome/utils"
[[ -f "$PROFILE/user.js" ]] && cp -p "$PROFILE/user.js" "$BACKUP/profile/user.js"
[[ -f "$FIREFOX_ROOT/config.js" ]] && cp -p "$FIREFOX_ROOT/config.js" "$BACKUP/firefox/config.js"
[[ -f "$FIREFOX_ROOT/defaults/pref/config-prefs.js" ]] && cp -p "$FIREFOX_ROOT/defaults/pref/config-prefs.js" "$BACKUP/firefox/defaults/pref/config-prefs.js"

mkdir -p "$PROFILE/chrome/JS" "$PROFILE/chrome/utils"
cp -p "$PAYLOAD/profile/chrome/userChrome.css" "$PROFILE/chrome/userChrome.css"
cp -p "$PAYLOAD/profile/chrome/platform-windows-linux.css" "$PROFILE/chrome/platform-windows-linux.css"
cp -p "$PAYLOAD/profile/chrome/JS/LeftChrome.uc.js" "$PROFILE/chrome/JS/LeftChrome.uc.js"
cp -R "$PAYLOAD/profile/chrome/utils/." "$PROFILE/chrome/utils/"
cp -p "$PAYLOAD/profile/chrome/sidebery-companion.css" "$PROFILE/chrome/sidebery-companion.css"

USER_JS="$PROFILE/user.js"
grep -Fq 'user_pref("toolkit.legacyUserProfileCustomizations.stylesheets", true);' "$USER_JS" 2>/dev/null || \
  printf '\n// Zenfox\nuser_pref("toolkit.legacyUserProfileCustomizations.stylesheets", true);\n' >> "$USER_JS"
grep -Fq 'user_pref("userChromeJS.enabled", true);' "$USER_JS" 2>/dev/null || \
  printf 'user_pref("userChromeJS.enabled", true);\n' >> "$USER_JS"

install_program_file "$PAYLOAD/firefox/config.js" "$FIREFOX_ROOT/config.js"
install_program_file "$PAYLOAD/firefox/defaults/pref/config-prefs.js" "$FIREFOX_ROOT/defaults/pref/config-prefs.js"

CACHE="$HOME/.cache/mozilla/firefox/$(basename "$PROFILE")/startupCache"
if [[ -d "$CACHE" ]]; then mv "$CACHE" "${CACHE}.pre-zenfox-$STAMP"; fi

log "Installed successfully. Backup: $BACKUP"
log "Optional Sidebery CSS: $PROFILE/chrome/sidebery-companion.css"
"$FIREFOX_BIN" >/dev/null 2>&1 &
