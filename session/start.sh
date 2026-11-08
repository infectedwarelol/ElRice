#!/bin/sh
RICE="$HOME/rices/gnome-macos"
SHARED_CONFIG="$HOME/.config"
GNOME_CONFIG="$HOME/.config-gnome-macos"

mkdir -p "$GNOME_CONFIG/gtk-3.0" "$GNOME_CONFIG/gtk-4.0"
for entry in "$SHARED_CONFIG"/* "$SHARED_CONFIG"/.[!.]*; do
    [ -e "$entry" ] || continue
    name="${entry##*/}"
    case "$name" in
        gtk-3.0|gtk-4.0) continue ;;
    esac
    [ -e "$GNOME_CONFIG/$name" ] || [ -L "$GNOME_CONFIG/$name" ] || ln -s "$entry" "$GNOME_CONFIG/$name"
done
for gtk_dir in gtk-3.0 gtk-4.0; do
    ln -sfn "$RICE/gtk/$gtk_dir/gtk.css" "$GNOME_CONFIG/$gtk_dir/gtk.css"
    ln -sfn "$RICE/gtk/$gtk_dir/liquidglass.css" "$GNOME_CONFIG/$gtk_dir/liquidglass.css"
    [ -e "$SHARED_CONFIG/$gtk_dir/bookmarks" ] && [ ! -e "$GNOME_CONFIG/$gtk_dir/bookmarks" ] && \
        ln -s "$SHARED_CONFIG/$gtk_dir/bookmarks" "$GNOME_CONFIG/$gtk_dir/bookmarks"
done

export XDG_CONFIG_HOME="$GNOME_CONFIG"
export DCONF_PROFILE="$RICE/dconf/profile"
export XDG_DATA_DIRS="$RICE/share:${XDG_DATA_DIRS:-/usr/local/share:/usr/share}"
export GNOME_MACOS_RICE=1
exec gnome-session "$@"
