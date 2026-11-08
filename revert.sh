#!/usr/bin/env bash
set -euo pipefail

RICE="$HOME/rices/gnome-macos"
STATE="$RICE/.installed"
EXT_DIR="$HOME/.local/share/gnome-shell/extensions"

sudo rm -f /usr/share/wayland-sessions/gnome-macos.desktop

systemctl --user disable gnome-macos-env-cleanup.service 2>/dev/null || true
rm -f "$HOME/.config/systemd/user/gnome-macos-env-cleanup.service"
systemctl --user daemon-reload

rm -f "$HOME/.config/dconf/gnomemacos"
rm -f "$HOME/.local/share/gnome-shell/extensions/standby-glass@gnome-macos"
rm -rf "$HOME/.config-gnome-macos"

if [[ -f "$STATE/extensions" ]]; then
  while read -r uuid _; do
    [[ -z "$uuid" ]] && continue
    grep -qx "$uuid" "$STATE/extensions-preexisting" 2>/dev/null && continue
    rm -rf "${EXT_DIR:?}/$uuid"
  done < "$STATE/extensions"
fi

added=()
for list in pacman aur; do
  [[ -f "$STATE/$list-requested" ]] || continue
  while read -r pkg; do
    grep -qx "$pkg" "$STATE/$list-preexisting" 2>/dev/null || added+=("$pkg")
  done < "$STATE/$list-requested"
done
sudo rm -f /etc/sddm.conf.d/40-macos-glass.conf
sudo rm -rf /usr/share/sddm/themes/macos-glass
rm -rf "$STATE"

echo "Rice config removed. Hyprland files were never touched."
if (( ${#added[@]} )); then
  echo "Packages added by install.sh (not removed automatically). To remove:"
  echo "  sudo pacman -Rns ${added[*]}"
fi
