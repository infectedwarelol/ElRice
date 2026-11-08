import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const SMALL_CARD = 170;
const WIDE_CARD = 360;
const CARD_SPACING = 20;
const MPRIS_PREFIX = 'org.mpris.MediaPlayer2.';
const MPRIS_PATH = '/org/mpris/MediaPlayer2';
const MPRIS_PLAYER_INTERFACE = 'org.mpris.MediaPlayer2.Player';
const UPOWER_NAME = 'org.freedesktop.UPower';
const UPOWER_DISPLAY_DEVICE = '/org/freedesktop/UPower/devices/DisplayDevice';
const UPOWER_DEVICE_INTERFACE = 'org.freedesktop.UPower.Device';
const UPOWER_STATE_CHARGING = 1;
const UPOWER_STATE_FULLY_CHARGED = 4;

function createCard(width, height) {
    const card = new St.Widget({
        style_class: 'standby-card',
        layout_manager: new Clutter.BinLayout(),
        width,
        height,
    });
    const glass = new St.Widget({style_class: 'standby-glass', x_expand: true, y_expand: true});
    const sheen = new St.Widget({style_class: 'standby-sheen', x_expand: true, y_expand: true});
    const content = new St.BoxLayout({
        style_class: 'standby-widget-content',
        orientation: Clutter.Orientation.VERTICAL,
        x_expand: true,
        y_expand: true,
    });
    card.add_child(glass);
    card.add_child(sheen);
    card.add_child(content);
    return {card, glass, content, width};
}

function unpackString(variant) {
    if (!variant)
        return '';
    const value = variant.recursiveUnpack();
    if (Array.isArray(value))
        return value.join(', ');
    return typeof value === 'string' ? value : '';
}

class CalendarCard {
    constructor() {
        this.parts = createCard(SMALL_CARD, SMALL_CARD);
        this._weekday = new St.Label({style_class: 'standby-widget-accent'});
        this._day = new St.Label({style_class: 'standby-widget-big'});
        this._month = new St.Label({style_class: 'standby-widget-caption'});
        this.parts.content.add_child(this._weekday);
        this.parts.content.add_child(this._day);
        this.parts.content.add_child(this._month);
        this.refresh();
    }

    refresh() {
        const now = GLib.DateTime.new_now_local();
        this._weekday.text = now.format('%A').toUpperCase();
        this._day.text = String(now.get_day_of_month());
        this._month.text = now.format('%B %Y');
    }

    destroy() {
        this.parts.card.destroy();
    }
}

class BatteryCard {
    constructor(onPresenceChanged) {
        this.parts = createCard(SMALL_CARD, SMALL_CARD);
        this._onPresenceChanged = onPresenceChanged;
        this._icon = new St.Icon({style_class: 'standby-widget-icon', icon_name: 'battery-full-symbolic'});
        this._percent = new St.Label({style_class: 'standby-widget-big'});
        this._state = new St.Label({style_class: 'standby-widget-caption'});
        this.parts.content.add_child(this._icon);
        this.parts.content.add_child(this._percent);
        this.parts.content.add_child(this._state);
        this.present = false;
        this._proxy = null;
        this._cancellable = new Gio.Cancellable();

        Gio.DBusProxy.new_for_bus(Gio.BusType.SYSTEM, Gio.DBusProxyFlags.NONE, null,
            UPOWER_NAME, UPOWER_DISPLAY_DEVICE, UPOWER_DEVICE_INTERFACE, this._cancellable,
            (source, result) => {
                try {
                    this._proxy = Gio.DBusProxy.new_for_bus_finish(result);
                } catch (error) {
                    if (!error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                        console.warn(`standby-glass: battery unavailable: ${error.message}`);
                    return;
                }
                this._propertiesChangedId = this._proxy.connect('g-properties-changed', () => this._sync());
                this._sync();
            });
    }

    _sync() {
        const isPresent = this._proxy?.get_cached_property('IsPresent')?.unpack() ?? false;
        const percentage = this._proxy?.get_cached_property('Percentage')?.unpack() ?? 0;
        const state = this._proxy?.get_cached_property('State')?.unpack() ?? 0;
        const iconName = this._proxy?.get_cached_property('IconName')?.unpack();

        this._percent.text = `${Math.round(percentage)}%`;
        this._icon.icon_name = iconName || 'battery-full-symbolic';
        if (state === UPOWER_STATE_CHARGING)
            this._state.text = 'Charging';
        else if (state === UPOWER_STATE_FULLY_CHARGED)
            this._state.text = 'Fully Charged';
        else
            this._state.text = 'Battery';

        if (isPresent !== this.present) {
            this.present = isPresent;
            this._onPresenceChanged();
        }
    }

    destroy() {
        this._cancellable.cancel();
        if (this._proxy && this._propertiesChangedId)
            this._proxy.disconnect(this._propertiesChangedId);
        this._proxy = null;
        this.parts.card.destroy();
    }
}

class NowPlayingCard {
    constructor() {
        this.parts = createCard(WIDE_CARD, SMALL_CARD);
        this._cancellable = new Gio.Cancellable();
        this._players = new Map();
        this._activeName = null;

        const header = new St.Label({style_class: 'standby-widget-accent', text: 'NOW PLAYING'});
        this._title = new St.Label({style_class: 'standby-widget-title', text: 'Not Playing'});
        this._artist = new St.Label({style_class: 'standby-widget-caption', text: ''});
        this._title.clutter_text.ellipsize = 3;
        this._artist.clutter_text.ellipsize = 3;

        const controls = new St.BoxLayout({style_class: 'standby-widget-controls', x_align: Clutter.ActorAlign.CENTER});
        this._previousButton = this._createButton('media-skip-backward-symbolic', 'Previous');
        this._playButton = this._createButton('media-playback-start-symbolic', 'PlayPause');
        this._nextButton = this._createButton('media-skip-forward-symbolic', 'Next');
        controls.add_child(this._previousButton);
        controls.add_child(this._playButton);
        controls.add_child(this._nextButton);

        this.parts.content.add_child(header);
        this.parts.content.add_child(this._title);
        this.parts.content.add_child(this._artist);
        this.parts.content.add_child(controls);

        this._nameOwnerChangedId = Gio.DBus.session.signal_subscribe(
            'org.freedesktop.DBus', 'org.freedesktop.DBus', 'NameOwnerChanged', '/org/freedesktop/DBus',
            null, Gio.DBusSignalFlags.NONE,
            (connection, sender, path, iface, signal, parameters) => {
                const [name, , newOwner] = parameters.deepUnpack();
                if (!name.startsWith(MPRIS_PREFIX))
                    return;
                if (newOwner)
                    this._addPlayer(name);
                else
                    this._removePlayer(name);
            });

        Gio.DBus.session.call('org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus',
            'ListNames', null, null, Gio.DBusCallFlags.NONE, -1, this._cancellable,
            (connection, result) => {
                try {
                    const [names] = connection.call_finish(result).deepUnpack();
                    for (const name of names) {
                        if (name.startsWith(MPRIS_PREFIX))
                            this._addPlayer(name);
                    }
                } catch (error) {
                    if (!error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                        console.warn(`standby-glass: media players unavailable: ${error.message}`);
                }
            });
        this._sync();
    }

    _createButton(iconName, method) {
        const button = new St.Button({
            style_class: 'standby-widget-button',
            reactive: true,
            can_focus: true,
            child: new St.Icon({icon_name: iconName, style_class: 'standby-widget-button-icon'}),
        });
        button.connect('clicked', () => {
            const proxy = this._players.get(this._activeName);
            if (!proxy)
                return;
            proxy.call(method, null, Gio.DBusCallFlags.NONE, -1, null, null);
        });
        return button;
    }

    _addPlayer(name) {
        if (this._players.has(name))
            return;
        Gio.DBusProxy.new_for_bus(Gio.BusType.SESSION, Gio.DBusProxyFlags.NONE, null,
            name, MPRIS_PATH, MPRIS_PLAYER_INTERFACE, this._cancellable,
            (source, result) => {
                let proxy;
                try {
                    proxy = Gio.DBusProxy.new_for_bus_finish(result);
                } catch (error) {
                    if (!error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                        console.warn(`standby-glass: player ${name} unavailable: ${error.message}`);
                    return;
                }
                if (!this._players)
                    return;
                proxy._standbyChangedId = proxy.connect('g-properties-changed', () => this._sync());
                this._players.set(name, proxy);
                this._sync();
            });
    }

    _removePlayer(name) {
        const proxy = this._players.get(name);
        if (!proxy)
            return;
        proxy.disconnect(proxy._standbyChangedId);
        this._players.delete(name);
        this._sync();
    }

    _pickActivePlayer() {
        let fallback = null;
        for (const [name, proxy] of this._players) {
            const status = proxy.get_cached_property('PlaybackStatus')?.unpack();
            if (status === 'Playing')
                return name;
            if (status === 'Paused' && !fallback)
                fallback = name;
        }
        return fallback;
    }

    _sync() {
        this._activeName = this._pickActivePlayer();
        const proxy = this._players.get(this._activeName);
        const metadata = proxy?.get_cached_property('Metadata');
        const status = proxy?.get_cached_property('PlaybackStatus')?.unpack();

        if (!proxy || !metadata) {
            this._title.text = 'Not Playing';
            this._artist.text = '';
            this._playButton.child.icon_name = 'media-playback-start-symbolic';
            return;
        }

        const title = unpackString(metadata.lookup_value('xesam:title', null));
        const artist = unpackString(metadata.lookup_value('xesam:artist', null));
        this._title.text = title || 'Unknown Title';
        this._artist.text = artist;
        this._playButton.child.icon_name = status === 'Playing'
            ? 'media-playback-pause-symbolic'
            : 'media-playback-start-symbolic';
    }

    destroy() {
        this._cancellable.cancel();
        Gio.DBus.session.signal_unsubscribe(this._nameOwnerChangedId);
        for (const proxy of this._players.values())
            proxy.disconnect(proxy._standbyChangedId);
        this._players.clear();
        this._players = null;
        this.parts.card.destroy();
    }
}

export class DesktopWidgets {
    constructor() {
        this.actor = new St.Widget({layout_manager: new Clutter.FixedLayout(), reactive: false});
        this._calendar = new CalendarCard();
        this._nowPlaying = new NowPlayingCard();
        this._battery = new BatteryCard(() => this._layout());
        this.actor.add_child(this._calendar.parts.card);
        this.actor.add_child(this._nowPlaying.parts.card);
        this.actor.add_child(this._battery.parts.card);
        this._blurPath = null;
        this._monitor = null;
        this._originX = 0;
        this._originY = 0;

        this._dayTimeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 60, () => {
            this._calendar.refresh();
            return GLib.SOURCE_CONTINUE;
        });
        this._layout();
    }

    place(blurPath, monitor, originX, originY) {
        this._blurPath = blurPath;
        this._monitor = monitor;
        this._originX = originX;
        this._originY = originY;
        this.actor.set_position(monitor.x + originX, monitor.y + originY);
        this._layout();
    }

    _layout() {
        const cards = [this._calendar.parts, this._nowPlaying.parts];
        this._battery.parts.card.visible = this._battery.present;
        if (this._battery.present)
            cards.push(this._battery.parts);

        let cursor = 0;
        for (const parts of cards) {
            parts.card.set_position(cursor, 0);
            if (this._monitor && this._blurPath) {
                parts.glass.style = `background-image: url("file://${this._blurPath}"); ` +
                    `background-size: ${this._monitor.width}px ${this._monitor.height}px; ` +
                    `background-position: ${-(this._originX + cursor)}px ${-this._originY}px;`;
            } else {
                parts.glass.style = 'background-color: rgba(30, 30, 40, 0.55);';
            }
            cursor += parts.width + CARD_SPACING;
        }
        this.actor.set_size(Math.max(0, cursor - CARD_SPACING), SMALL_CARD);
    }

    destroy() {
        GLib.source_remove(this._dayTimeoutId);
        this._calendar.destroy();
        this._nowPlaying.destroy();
        this._battery.destroy();
        this.actor.destroy();
    }
}

export class FocusedAppLabel {
    constructor() {
        this._tracker = Shell.WindowTracker.get_default();
        this.actor = new St.Label({
            style_class: 'standby-focused-app',
            y_align: Clutter.ActorAlign.CENTER,
        });
        Main.panel._leftBox.insert_child_at_index(this.actor, 1);
        this._focusAppChangedId = this._tracker.connect('notify::focus-app', () => this._sync());
        this._sync();
    }

    _sync() {
        const app = this._tracker.focus_app;
        this.actor.text = app ? app.get_name() : 'Finder';
    }

    destroy() {
        this._tracker.disconnect(this._focusAppChangedId);
        this.actor.destroy();
        this._tracker = null;
    }
}
