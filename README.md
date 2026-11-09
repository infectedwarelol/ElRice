# ElRice

A liquid glass, macOS-flavoured GNOME rice for Arch Linux. White frosted panels, a StandBy-style clock with live weather, glass desktop widgets, a glass login screen and a matching terminal, all running in its own isolated GNOME session so the rest of your setup stays untouched.

![Desktop](screenshots/desktop.png)

| Quick Settings | Overview | Terminal |
| --- | --- | --- |
| ![Quick Settings](screenshots/quick-settings.png) | ![Overview](screenshots/overview.png) | ![Terminal](screenshots/terminal.png) |

## What you get

- **StandBy Glass extension**: analog clock and weather card on the desktop, plus Calendar, Now Playing (any MPRIS player, with controls) and Battery widgets. Hidden behind windows, only visible on the bare desktop.
- **Focused app name** in the top bar next to the Apple logo.
- **Liquid glass everywhere**: top bar, dock, Quick Settings, menus, notifications, OSDs and GTK apps get a white translucent fill over a blur.
- **Smart overview blur**: pressing Super blurs the wallpaper only when you have apps open.
- **Spotlight-style search** on Super+Space.
- **Magic Lamp minimise** and **rounded window corners**.
- **macOS Glass sound theme** for login, logout, screenshots and notifications.
- **Ghostty** with a smoky glass background and a fastfetch Apple logo in the rice colours.
- **macOS Glass SDDM theme** for the login screen.

## Requirements

- Arch Linux (or a derivative) with `yay`
- SDDM as display manager (GDM is not used or required)
- A GNOME Shell version supported by the extensions listed below (tested on GNOME 51)

## Installation

1. Clone the repo into the exact path the rice expects:

   ```bash
   git clone https://github.com/infectedwarelol/ElRice.git ~/rices/gnome-macos
   ```

2. Run the installer as your normal user (it asks for sudo when needed):

   ```bash
   ~/rices/gnome-macos/install.sh
   ```

   It installs GNOME, the WhiteSur GTK, icon and cursor themes, Ghostty, Inter, and these extensions from extensions.gnome.org:

   | Extension | Purpose |
   | --- | --- |
   | User Themes | WhiteSur shell theme |
   | Dash to Dock | macOS-style dock |
   | Blur my Shell | All the glass blur |
   | Search Light | Spotlight-style search |
   | Logo Menu | Apple menu |
   | OpenWeather Refined | Weather in the top bar |
   | Media Controls | Player controls in the top bar |
   | Quick Settings Tweaks | Extra Quick Settings options |
   | Compiz alike Magic Lamp Effect | Minimise animation |
   | Rounded Window Corners Reborn | Rounded corners on every window |

   It also offers to install the SDDM login theme.

3. Log out, pick **GNOME (macOS rice)** in SDDM and log in.

> Pick the rice session, not plain "GNOME". The rice keeps its own dconf database and config folder (`~/.config-gnome-macos`), so your other desktops keep their settings.

## Customising

| What | Where |
| --- | --- |
| Weather city and unit | `standby.json` (`"city"`, `"unit": "celsius"` or `"fahrenheit"`) |
| Glass strength of shell UI | `extensions/standby-glass@gnome-macos/stylesheet.css` |
| Glass strength of GTK apps | `gtk/gtk-4.0/liquidglass.css`, `gtk/gtk-3.0/liquidglass.css` |
| Blur amount and tint | Blur my Shell preferences, pipelines "Classic Light Background" and "Overview Soft" |
| Terminal transparency | `ghostty/config` (`background-opacity`) |
| Terminal logo and colours | `fastfetch/config.jsonc` |
| Wallpaper | replace `wallpaper/wallpaper.jpg` |

After editing the extension files, log out and back in. GNOME on Wayland only reloads extension code on a new session.

## Uninstalling

```bash
~/rices/gnome-macos/revert.sh
```

This removes the session entry, the rice dconf database, the rice config folder, the extensions it installed, and the SDDM theme. It prints the packages it added so you can remove them yourself.

## Troubleshooting

- **Clock shows "Weather unavailable"**: the card uses wttr.in. Check that `curl https://wttr.in` works on your network.
- **Glass looks grey**: make sure Blur my Shell is enabled and the session is the rice session.
- **Changes do not show up**: log out and back in.

## Credits

- [WhiteSur GTK, icon and cursor themes](https://github.com/vinceliuice) by vinceliuice
- [Blur my Shell](https://github.com/aunetx/blur-my-shell), [Search Light](https://github.com/icedman/search-light) and the other extensions listed above
- [Ghostty](https://ghostty.org) and [fastfetch](https://github.com/fastfetch-cli/fastfetch)
- Weather by [wttr.in](https://wttr.in)
