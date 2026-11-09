import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const BLUR_MY_SHELL_UUID = 'blur-my-shell@aunetx';
const BLUR_MY_SHELL_APPLICATIONS_SCHEMA = 'org.gnome.shell.extensions.blur-my-shell.applications';
const MEDIA_TITLE_PATTERN = /\b(YouTube|Netflix|Twitch|Prime Video|Disney\+|Crunchyroll|Vimeo|HBO|Hulu|Plex|Jellyfin|Kick)\b/i;
const SYNC_DELAY_MILLISECONDS = 600;

function loadApplicationsSettings() {
    const blurExtension = Main.extensionManager.lookup(BLUR_MY_SHELL_UUID);
    const schemaDirectory = blurExtension?.dir?.get_child('schemas')?.get_path();
    if (!schemaDirectory)
        return null;
    try {
        const source = Gio.SettingsSchemaSource.new_from_directory(
            schemaDirectory, Gio.SettingsSchemaSource.get_default(), false);
        const schema = source.lookup(BLUR_MY_SHELL_APPLICATIONS_SCHEMA, false);
        return schema ? new Gio.Settings({settings_schema: schema}) : null;
    } catch (error) {
        console.warn(`standby-glass: media guard unavailable: ${error.message}`);
        return null;
    }
}

export class MediaGlassGuard {
    constructor() {
        this._settings = loadApplicationsSettings();
        this._addedClasses = new Set();
        this._windowSignals = new Map();
        this._syncSourceId = 0;
        if (!this._settings)
            return;

        for (const actor of global.get_window_actors())
            this._track(actor.meta_window);
        this._windowCreatedId = global.display.connect('window-created', (display, window) => {
            this._track(window);
            this._scheduleSync();
        });
        this._scheduleSync();
    }

    _track(window) {
        if (!window || this._windowSignals.has(window))
            return;
        const titleId = window.connect('notify::title', () => this._scheduleSync());
        const classId = window.connect('notify::wm-class', () => this._scheduleSync());
        const unmanagedId = window.connect('unmanaged', () => {
            this._untrack(window);
            this._scheduleSync();
        });
        this._windowSignals.set(window, [titleId, classId, unmanagedId]);
    }

    _untrack(window) {
        const signalIds = this._windowSignals.get(window);
        if (!signalIds)
            return;
        for (const signalId of signalIds)
            window.disconnect(signalId);
        this._windowSignals.delete(window);
    }

    _scheduleSync() {
        if (this._syncSourceId)
            return;
        this._syncSourceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SYNC_DELAY_MILLISECONDS, () => {
            this._syncSourceId = 0;
            this._sync();
            return GLib.SOURCE_REMOVE;
        });
    }

    _mediaClasses() {
        const classes = new Set();
        for (const window of this._windowSignals.keys()) {
            const wmClass = window.get_wm_class();
            const title = window.get_title() ?? '';
            if (wmClass && MEDIA_TITLE_PATTERN.test(title))
                classes.add(wmClass);
        }
        return classes;
    }

    _sync() {
        if (!this._settings)
            return;
        const wanted = this._mediaClasses();
        const current = this._settings.get_strv('blacklist');
        const userEntries = current.filter(entry => !this._addedClasses.has(entry));
        const additions = [...wanted].filter(wmClass => !userEntries.includes(wmClass));
        const next = [...userEntries, ...additions];
        this._addedClasses = new Set(additions);
        if (next.length !== current.length || next.some((entry, index) => entry !== current[index]))
            this._settings.set_strv('blacklist', next);
    }

    destroy() {
        if (this._syncSourceId)
            GLib.source_remove(this._syncSourceId);
        this._syncSourceId = 0;
        if (this._windowCreatedId)
            global.display.disconnect(this._windowCreatedId);
        for (const window of [...this._windowSignals.keys()])
            this._untrack(window);
        if (this._settings && this._addedClasses.size) {
            const remaining = this._settings.get_strv('blacklist').filter(entry => !this._addedClasses.has(entry));
            this._settings.set_strv('blacklist', remaining);
        }
        this._addedClasses.clear();
        this._settings = null;
    }
}
