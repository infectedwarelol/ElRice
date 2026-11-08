#!/usr/bin/env bash
set -euo pipefail

RICE="$HOME/rices/gnome-macos"
STATE="$RICE/.installed"
EXT_DIR="$HOME/.local/share/gnome-shell/extensions"
EXTENSIONS=(
  user-theme@gnome-shell-extensions.gcampax.github.com
  dash-to-dock@micxgx.gmail.com
  blur-my-shell@aunetx
  search-light@icedman.github.com
  logomenu@aryan_k
  openweather-extension@penguin-teal.github.io
  mediacontrols@cliffniff.github.com
  compiz-alike-magic-lamp-effect@hermes83.github.com
  rounded-window-corners@fxgn
  quick-settings-tweaks@qwreey
)
PACMAN_PKGS=(
  gnome-shell gnome-session gnome-control-center gnome-settings-daemon
  gnome-keyring nautilus xdg-desktop-portal-gnome gnome-backgrounds
  gnome-tweaks extension-manager gnome-browser-connector
  inter-font ghostty unzip curl git
)
AUR_PKGS=(whitesur-gtk-theme whitesur-icon-theme whitesur-cursor-theme-git)

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }

[[ $EUID -eq 0 ]] && { echo "run as your user, not root"; exit 1; }
[[ "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)" == "$RICE" ]] || { echo "clone this repo to $RICE first"; exit 1; }
mkdir -p "$STATE"

step "Pointing rice files at $HOME"
grep -rlI --exclude-dir=.git '@HOME@' "$RICE" | while read -r file; do
  sed -i "s|@HOME@|$HOME|g" "$file"
done

step "Installing GNOME core (no gdm, display manager untouched)"
pacman -Qq "${PACMAN_PKGS[@]}" 2>/dev/null | sort > "$STATE/pacman-preexisting" || true
sudo pacman -S --needed "${PACMAN_PKGS[@]}"
printf '%s\n' "${PACMAN_PKGS[@]}" > "$STATE/pacman-requested"

step "Installing WhiteSur themes (AUR)"
pacman -Qq "${AUR_PKGS[@]}" 2>/dev/null | sort > "$STATE/aur-preexisting" || true
yay -S --needed "${AUR_PKGS[@]}"
printf '%s\n' "${AUR_PKGS[@]}" > "$STATE/aur-requested"

SHELL_VERSION="$(gnome-shell --version | grep -oE '[0-9]+' | head -1)"
step "GNOME Shell major version: $SHELL_VERSION"

step "Installing extensions compatible with Shell $SHELL_VERSION"
mkdir -p "$EXT_DIR"
: > "$STATE/extensions"
for uuid in "${EXTENSIONS[@]}"; do
  if [[ -d "$EXT_DIR/$uuid" ]] && ! grep -qx "$uuid" "$STATE/extensions-preexisting" 2>/dev/null; then
    echo "$uuid" >> "$STATE/extensions-preexisting"
  fi
  if [[ -d "/usr/share/gnome-shell/extensions/$uuid" ]]; then
    echo "  $uuid: provided by system package"
    continue
  fi
  info="$(curl -fsSL "https://extensions.gnome.org/extension-info/?uuid=$uuid&shell_version=$SHELL_VERSION")" || {
    echo "  $uuid: NOT compatible with Shell $SHELL_VERSION, skipped"; continue; }
  version="$(python -c 'import sys,json;print(json.load(sys.stdin)["version"])' <<<"$info")"
  zip="$(mktemp --suffix=.zip)"
  curl -fsSL -o "$zip" "https://extensions.gnome.org/download-extension/$uuid.shell-extension.zip?version_tag=$(python -c 'import sys,json;print(json.load(sys.stdin)["version_tag"])' <<<"$info")"
  gnome-extensions install --force "$zip"
  rm -f "$zip"
  glib-compile-schemas "$EXT_DIR/$uuid/schemas" 2>/dev/null || true
  echo "$uuid $version" >> "$STATE/extensions"
  echo "  $uuid: v$version"
done

ln -sfn "$RICE/extensions/standby-glass@gnome-macos" "$EXT_DIR/standby-glass@gnome-macos"

step "Wallpaper"
if [[ ! -f "$RICE/wallpaper/wallpaper.jpg" ]]; then
  tmp="$(mktemp -d)"
  git clone --depth 1 https://github.com/vinceliuice/WhiteSur-wallpapers.git "$tmp/w"
  pick="$(find "$tmp/w" -iname '*monterey*dark*' \( -name '*.jpg' -o -name '*.png' \) | sort | tail -1)"
  [[ -z "$pick" ]] && pick="$(find "$tmp/w" \( -name '*.jpg' -o -name '*.png' \) | sort | head -1)"
  magick "$pick" "$RICE/wallpaper/wallpaper.jpg" 2>/dev/null || cp "$pick" "$RICE/wallpaper/wallpaper.jpg"
  rm -rf "$tmp"
fi

step "Loading isolated dconf database (~/.config/dconf/gnomemacos)"
DCONF_PROFILE="$RICE/dconf/profile" dconf load / < "$RICE/dconf/gnome-macos.ini"

[[ -f "$HOME/.config/monitors.xml" ]] || install -Dm644 "$RICE/monitors.xml" "$HOME/.config/monitors.xml"

step "Session cleanup unit"
mkdir -p "$HOME/.config/systemd/user"
ln -sf "$RICE/systemd/gnome-macos-env-cleanup.service" "$HOME/.config/systemd/user/gnome-macos-env-cleanup.service"
systemctl --user daemon-reload
systemctl --user enable gnome-macos-env-cleanup.service

step "Login screen theme (SDDM)"
if [[ -d /usr/share/sddm/themes ]]; then
  read -rp "Install the macOS Glass SDDM theme and make it active? [y/N] " answer
  if [[ "${answer,,}" == y* ]]; then
    sudo cp -r "$RICE/sddm/macos-glass" /usr/share/sddm/themes/
    printf '[Theme]\nCurrent=macos-glass\n' | sudo tee /etc/sddm.conf.d/40-macos-glass.conf >/dev/null
  fi
else
  echo "  SDDM not found, skipped"
fi

step "Session entry for the display manager"
sudo install -Dm644 "$RICE/session/gnome-macos.desktop" /usr/share/wayland-sessions/gnome-macos.desktop

step "Done. Log out, pick 'GNOME (macOS rice)' in SDDM. Avoid plain 'GNOME': it uses the shared dconf db."
