import Cairo from 'cairo';
import Clutter from 'gi://Clutter';
import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import Soup from 'gi://Soup?version=3.0';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {DesktopWidgets, FocusedAppLabel} from './widgets.js';

const CONFIG_PATH = GLib.build_filenamev([GLib.get_home_dir(), 'rices', 'gnome-macos', 'standby.json']);
const CACHE_DIR = GLib.build_filenamev([GLib.get_user_cache_dir(), 'standby-glass']);
const CLOCK_SIZE = 170;
const WEATHER_REFRESH_SECONDS = 900;
const BLUR_DOWNSCALE = 40;
const ORANGE = [1.0, 0.584, 0.0];
const DESKTOP_INSET = 40;
const WIDGET_GAP = 20;
const BLUR_MY_SHELL_UUID = 'blur-my-shell@aunetx';
const BLUR_MY_SHELL_OVERVIEW_SCHEMA = 'org.gnome.shell.extensions.blur-my-shell.overview';
const BLUR_CACHE_VERSION = 3;

const DEFAULT_CONFIG = {city: 'Bucharest', unit: 'celsius'};

const WEATHER_ICONS = [
    {codes: [113], day: 'weather-clear', night: 'weather-clear-night'},
    {codes: [116], day: 'weather-few-clouds', night: 'weather-few-clouds-night'},
    {codes: [119, 122], day: 'weather-overcast', night: 'weather-overcast'},
    {codes: [143, 248, 260], day: 'weather-fog', night: 'weather-fog'},
    {codes: [176, 263, 266, 281, 284, 293, 296, 353], day: 'weather-showers-scattered', night: 'weather-showers-scattered'},
    {codes: [299, 302, 305, 308, 311, 314, 356, 359], day: 'weather-showers', night: 'weather-showers'},
    {codes: [179, 182, 185, 227, 230, 317, 320, 323, 326, 329, 332, 335, 338, 350, 362, 365, 368, 371, 374, 377], day: 'weather-snow', night: 'weather-snow'},
    {codes: [200, 386, 389, 392, 395], day: 'weather-storm', night: 'weather-storm'},
];

function loadConfig() {
    try {
        const [, contents] = GLib.file_get_contents(CONFIG_PATH);
        const parsed = JSON.parse(new TextDecoder().decode(contents));
        return {...DEFAULT_CONFIG, ...parsed};
    } catch {
        return {...DEFAULT_CONFIG};
    }
}

function weatherIcon(code, isDay) {
    const entry = WEATHER_ICONS.find(candidate => candidate.codes.includes(code));
    if (!entry)
        return 'weather-severe-alert';
    return isDay ? entry.day : entry.night;
}

function roundedRectangle(cr, x, y, width, height, radius) {
    cr.newSubPath();
    cr.arc(x + width - radius, y + radius, radius, -Math.PI / 2, 0);
    cr.arc(x + width - radius, y + height - radius, radius, 0, Math.PI / 2);
    cr.arc(x + radius, y + height - radius, radius, Math.PI / 2, Math.PI);
    cr.arc(x + radius, y + radius, radius, Math.PI, 1.5 * Math.PI);
    cr.closePath();
}

function drawHand(cr, center, angle, length, tail, width, rgb) {
    cr.setSourceRGB(...rgb);
    cr.setLineWidth(width);
    cr.setLineCap(1);
    cr.moveTo(center - Math.sin(angle) * tail, center + Math.cos(angle) * tail);
    cr.lineTo(center + Math.sin(angle) * length, center - Math.cos(angle) * length);
    cr.stroke();
}

function drawClock(area) {
    const cr = area.get_context();
    const size = CLOCK_SIZE;
    const center = size / 2;
    const radius = center - 12;

    const glassFill = new Cairo.LinearGradient(0, 0, 0, size);
    glassFill.addColorStopRGBA(0, 1, 1, 1, 0.22);
    glassFill.addColorStopRGBA(0.5, 1, 1, 1, 0.10);
    glassFill.addColorStopRGBA(1, 1, 1, 1, 0.16);
    roundedRectangle(cr, 0.5, 0.5, size - 1, size - 1, 30);
    cr.setSource(glassFill);
    cr.fillPreserve();
    cr.setSourceRGBA(1, 1, 1, 0.45);
    cr.setLineWidth(1);
    cr.stroke();

    for (let tick = 0; tick < 60; tick++) {
        const major = tick % 5 === 0;
        const angle = tick * Math.PI / 30;
        const inner = radius - (major ? 11 : 6);
        cr.setSourceRGBA(1, 1, 1, major ? 0.95 : 0.45);
        cr.setLineWidth(major ? 2.6 : 1.3);
        cr.moveTo(center + Math.sin(angle) * inner, center - Math.cos(angle) * inner);
        cr.lineTo(center + Math.sin(angle) * radius, center - Math.cos(angle) * radius);
        cr.stroke();
    }

    const layout = PangoCairo.create_layout(cr);
    layout.set_font_description(Pango.FontDescription.from_string('Inter Semi-Bold 17px'));
    cr.setSourceRGB(1, 1, 1);
    const numeralRadius = radius - 24;
    for (const numeral of [12, 3, 6, 9]) {
        const angle = (numeral % 12) * Math.PI / 6;
        layout.set_text(String(numeral), -1);
        const [, logical] = layout.get_pixel_extents();
        cr.moveTo(
            center + Math.sin(angle) * numeralRadius - logical.width / 2,
            center - Math.cos(angle) * numeralRadius - logical.height / 2);
        PangoCairo.show_layout(cr, layout);
    }

    const now = GLib.DateTime.new_now_local();
    const seconds = now.get_second();
    const minutes = now.get_minute() + seconds / 60;
    const hours = (now.get_hour() % 12) + minutes / 60;

    drawHand(cr, center, hours * Math.PI / 6, radius * 0.5, 0, 6, [1, 1, 1]);
    drawHand(cr, center, minutes * Math.PI / 30, radius * 0.8, 0, 4, [1, 1, 1]);

    cr.setSourceRGB(1, 1, 1);
    cr.arc(center, center, 6, 0, 2 * Math.PI);
    cr.fill();

    drawHand(cr, center, seconds * Math.PI / 30, radius * 0.9, radius * 0.16, 2, ORANGE);
    cr.setSourceRGB(...ORANGE);
    cr.arc(center, center, 3.5, 0, 2 * Math.PI);
    cr.fill();
    cr.setSourceRGB(0, 0, 0);
    cr.arc(center, center, 1.4, 0, 2 * Math.PI);
    cr.fill();

    cr.$dispose();
}

function blurredWallpaperFor(uri, monitor) {
    const file = Gio.File.new_for_uri(uri);
    const path = file.get_path();
    if (!path || !GLib.file_test(path, GLib.FileTest.EXISTS))
        return null;

    const info = file.query_info('time::modified', Gio.FileQueryInfoFlags.NONE, null);
    const key = GLib.compute_checksum_for_string(GLib.ChecksumType.SHA1,
        `v${BLUR_CACHE_VERSION}:${path}:${info.get_modification_date_time()?.to_unix() ?? 0}:${monitor.width}x${monitor.height}`, -1);
    const cachePath = GLib.build_filenamev([CACHE_DIR, `${key}.png`]);
    if (GLib.file_test(cachePath, GLib.FileTest.EXISTS))
        return cachePath;

    const source = GdkPixbuf.Pixbuf.new_from_file(path);
    const scale = Math.max(monitor.width / source.get_width(), monitor.height / source.get_height());
    const coverWidth = Math.ceil(source.get_width() * scale);
    const coverHeight = Math.ceil(source.get_height() * scale);

    let reduced = source;
    let reducedWidth = source.get_width();
    let reducedHeight = source.get_height();
    const targetWidth = Math.max(1, Math.round(coverWidth / BLUR_DOWNSCALE));
    const targetHeight = Math.max(1, Math.round(coverHeight / BLUR_DOWNSCALE));
    while (reducedWidth > targetWidth * 2 && reducedHeight > targetHeight * 2) {
        reducedWidth = Math.max(targetWidth, Math.round(reducedWidth / 2));
        reducedHeight = Math.max(targetHeight, Math.round(reducedHeight / 2));
        reduced = reduced.scale_simple(reducedWidth, reducedHeight, GdkPixbuf.InterpType.HYPER);
    }
    reduced = reduced.scale_simple(targetWidth, targetHeight, GdkPixbuf.InterpType.HYPER);

    let enlarged = reduced;
    let enlargedWidth = targetWidth;
    let enlargedHeight = targetHeight;
    while (enlargedWidth < coverWidth || enlargedHeight < coverHeight) {
        enlargedWidth = Math.min(coverWidth, enlargedWidth * 2);
        enlargedHeight = Math.min(coverHeight, enlargedHeight * 2);
        enlarged = enlarged.scale_simple(enlargedWidth, enlargedHeight, GdkPixbuf.InterpType.BILINEAR);
    }

    const cropped = enlarged.new_subpixbuf(
        Math.floor((coverWidth - monitor.width) / 2),
        Math.floor((coverHeight - monitor.height) / 2),
        monitor.width, monitor.height);

    GLib.mkdir_with_parents(CACHE_DIR, 0o755);
    cropped.savev(cachePath, 'png', [], []);
    return cachePath;
}

export default class StandbyGlassExtension extends Extension {
    enable() {
        this._config = loadConfig();
        this._backgroundSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.background'});
        this._interfaceSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        this._session = new Soup.Session({timeout: 20});
        this._cancellable = new Gio.Cancellable();
        this._blurPath = null;

        this._buildCard();

        this._backgroundGroup = Main.layoutManager._backgroundGroup;
        this._widgets = new DesktopWidgets();
        this._focusedApp = new FocusedAppLabel();
        this._backgroundGroup.add_child(this._card);
        this._backgroundGroup.add_child(this._widgets.actor);
        this._backgroundChildAddedId = this._backgroundGroup.connect('child-added', (group, child) => {
            if (child !== this._card && child !== this._widgets?.actor)
                this._raiseAboveWallpaper();
        });

        this._clockTimeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
            this._clockArea.queue_repaint();
            return GLib.SOURCE_CONTINUE;
        });
        this._weatherTimeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, WEATHER_REFRESH_SECONDS, () => {
            this._refreshWeather();
            return GLib.SOURCE_CONTINUE;
        });

        this._monitorsChangedId = Main.layoutManager.connect('monitors-changed', () => this._updateGlass());
        this._backgroundChangedId = this._backgroundSettings.connect('changed', () => this._updateGlass());
        this._colorSchemeChangedId = this._interfaceSettings.connect('changed::color-scheme', () => this._updateGlass());

        this._overviewBlurSettings = this._loadOverviewBlurSettings();
        this._overviewShowingId = Main.overview.connect('showing', () => this._syncOverviewBlur());
        this._screenshotClosedId = Main.screenshotUI?.connect('closed', () => Main.screenshotUI._areaSelector?.resetArea?.()) ?? null;

        this._updateGlass();
        this._refreshWeather();
    }

    _loadOverviewBlurSettings() {
        const blurExtension = Main.extensionManager.lookup(BLUR_MY_SHELL_UUID);
        const schemaDirectory = blurExtension?.dir?.get_child('schemas')?.get_path();
        if (!schemaDirectory)
            return null;
        try {
            const source = Gio.SettingsSchemaSource.new_from_directory(
                schemaDirectory, Gio.SettingsSchemaSource.get_default(), false);
            const schema = source.lookup(BLUR_MY_SHELL_OVERVIEW_SCHEMA, false);
            return schema ? new Gio.Settings({settings_schema: schema}) : null;
        } catch (error) {
            console.warn(`standby-glass: overview blur control unavailable: ${error.message}`);
            return null;
        }
    }

    _syncOverviewBlur() {
        if (!this._overviewBlurSettings)
            return;
        const hasApplications = global.get_window_actors().some(actor => {
            const window = actor.meta_window;
            return window.get_window_type() === Meta.WindowType.NORMAL && !window.is_skip_taskbar();
        });
        if (this._overviewBlurSettings.get_boolean('blur') !== hasApplications)
            this._overviewBlurSettings.set_boolean('blur', hasApplications);
    }

    disable() {
        this._cancellable.cancel();
        this._session.abort();

        GLib.source_remove(this._clockTimeoutId);
        GLib.source_remove(this._weatherTimeoutId);
        Main.layoutManager.disconnect(this._monitorsChangedId);
        this._backgroundSettings.disconnect(this._backgroundChangedId);
        this._interfaceSettings.disconnect(this._colorSchemeChangedId);
        this._backgroundGroup.disconnect(this._backgroundChildAddedId);
        Main.overview.disconnect(this._overviewShowingId);
        if (this._screenshotClosedId)
            Main.screenshotUI.disconnect(this._screenshotClosedId);
        this._screenshotClosedId = null;
        this._overviewBlurSettings = null;

        this._focusedApp.destroy();
        this._focusedApp = null;
        this._widgets.destroy();
        this._widgets = null;
        this._card.destroy();
        this._backgroundGroup = null;

        this._card = null;
        this._glass = null;
        this._clockArea = null;
        this._cityLabel = null;
        this._temperatureLabel = null;
        this._conditionIcon = null;
        this._conditionLabel = null;
        this._rangeLabel = null;
        this._session = null;
        this._cancellable = null;
        this._backgroundSettings = null;
        this._interfaceSettings = null;
        this._config = null;
    }

    _buildCard() {
        this._card = new St.Widget({
            style_class: 'standby-card',
            layout_manager: new Clutter.BinLayout(),
            reactive: false,
        });

        this._glass = new St.Widget({style_class: 'standby-glass', x_expand: true, y_expand: true});
        const sheen = new St.Widget({style_class: 'standby-sheen', x_expand: true, y_expand: true});

        const content = new St.BoxLayout({style_class: 'standby-content', y_align: Clutter.ActorAlign.CENTER});

        this._clockArea = new St.DrawingArea({width: CLOCK_SIZE, height: CLOCK_SIZE});
        this._clockArea.connect('repaint', drawClock);

        const weather = new St.BoxLayout({
            style_class: 'standby-weather',
            orientation: Clutter.Orientation.VERTICAL,
            y_align: Clutter.ActorAlign.CENTER,
        });

        const cityRow = new St.BoxLayout({style_class: 'standby-city-row'});
        this._cityLabel = new St.Label({style_class: 'standby-city', text: this._config.city, y_align: Clutter.ActorAlign.CENTER});
        const arrow = new St.Icon({style_class: 'standby-arrow', icon_name: 'find-location-symbolic', y_align: Clutter.ActorAlign.CENTER});
        cityRow.add_child(this._cityLabel);
        cityRow.add_child(arrow);

        this._temperatureLabel = new St.Label({style_class: 'standby-temp', text: '--°'});

        const conditionRow = new St.BoxLayout({style_class: 'standby-condition-row'});
        this._conditionIcon = new St.Icon({style_class: 'standby-condition-icon', icon_name: 'weather-few-clouds', y_align: Clutter.ActorAlign.CENTER});
        this._conditionLabel = new St.Label({style_class: 'standby-condition', text: 'Loading…', y_align: Clutter.ActorAlign.CENTER});
        conditionRow.add_child(this._conditionIcon);
        conditionRow.add_child(this._conditionLabel);

        this._rangeLabel = new St.Label({style_class: 'standby-range', text: 'H:--° L:--°'});

        weather.add_child(cityRow);
        weather.add_child(this._temperatureLabel);
        weather.add_child(conditionRow);
        weather.add_child(this._rangeLabel);

        content.add_child(this._clockArea);
        content.add_child(weather);

        this._card.add_child(this._glass);
        this._card.add_child(sheen);
        this._card.add_child(content);
    }

    _wallpaperUri() {
        const prefersDark = this._interfaceSettings.get_string('color-scheme') === 'prefer-dark';
        return this._backgroundSettings.get_string(prefersDark ? 'picture-uri-dark' : 'picture-uri');
    }

    _updateGlass() {
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor || !this._card)
            return;

        try {
            this._blurPath = blurredWallpaperFor(this._wallpaperUri(), monitor);
        } catch (error) {
            console.error(`standby-glass: blur failed: ${error.message}`);
            this._blurPath = null;
        }

        this._reposition();
    }

    _raiseAboveWallpaper() {
        this._backgroundGroup.set_child_above_sibling(this._card, null);
        this._backgroundGroup.set_child_above_sibling(this._widgets.actor, this._card);
    }

    _reposition() {
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor || !this._card)
            return;

        const [, naturalWidth] = this._card.get_preferred_width(-1);
        const [, naturalHeight] = this._card.get_preferred_height(naturalWidth);
        const offsetX = DESKTOP_INSET;
        const offsetY = Main.panel.height + DESKTOP_INSET;

        this._card.set_size(naturalWidth, naturalHeight);
        this._card.set_position(monitor.x + offsetX, monitor.y + offsetY);
        this._widgets.place(this._blurPath, monitor, offsetX, offsetY + naturalHeight + WIDGET_GAP);
        this._raiseAboveWallpaper();

        this._glass.style = this._blurPath
            ? `background-image: url("file://${this._blurPath}"); background-size: ${monitor.width}px ${monitor.height}px; background-position: ${-offsetX}px ${-offsetY}px;`
            : 'background-color: rgba(30, 30, 40, 0.55);';
    }

    _fetchJson(url, onResult) {
        const message = Soup.Message.new('GET', url);
        if (!message)
            return;
        this._session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, this._cancellable, (session, result) => {
            try {
                const bytes = session.send_and_read_finish(result);
                if (message.get_status() !== Soup.Status.OK)
                    throw new Error(`HTTP ${message.get_status()}`);
                onResult(JSON.parse(new TextDecoder().decode(bytes.get_data())));
            } catch (error) {
                if (!error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                    this._showWeatherError(error);
            }
        });
    }

    _showWeatherError(error) {
        console.warn(`standby-glass: weather unavailable: ${error.message}`);
        if (this._conditionLabel)
            this._conditionLabel.text = 'Weather unavailable';
    }

    _refreshWeather() {
        const city = encodeURIComponent(String(this._config.city ?? DEFAULT_CONFIG.city));
        this._fetchJson(`https://wttr.in/${city}?format=j1`, response => this._applyForecast(response));
    }

    _applyForecast(response) {
        const current = response?.current_condition?.[0];
        const today = response?.weather?.[0];
        if (!current || !this._card) {
            this._showWeatherError(new Error('malformed forecast'));
            return;
        }
        const fahrenheit = this._config.unit === 'fahrenheit';
        const temperature = Number(fahrenheit ? current.temp_F : current.temp_C);
        const high = Number(fahrenheit ? today?.maxtempF : today?.maxtempC);
        const low = Number(fahrenheit ? today?.mintempF : today?.mintempC);
        const hour = GLib.DateTime.new_now_local().get_hour();
        const isDay = hour >= 6 && hour < 20;
        const area = response?.nearest_area?.[0]?.areaName?.[0]?.value;
        const formatDegrees = value => (Number.isFinite(value) ? `${Math.round(value)}°` : '--°');

        this._cityLabel.text = String(this._config.city ?? area ?? DEFAULT_CONFIG.city);
        this._temperatureLabel.text = formatDegrees(temperature);
        this._conditionIcon.icon_name = weatherIcon(Number(current.weatherCode), isDay);
        this._conditionLabel.text = current.weatherDesc?.[0]?.value?.trim() || 'Unknown';
        this._rangeLabel.text = `H:${formatDegrees(high)} L:${formatDegrees(low)}`;

        this._reposition();
    }
}
