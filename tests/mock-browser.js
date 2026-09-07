'use strict';

/**
 * A stand-in for the WebExtension API, faithful enough to exercise the parts of
 * Safari's behaviour this extension depends on:
 *
 *  - windows.onRemoved fires when the window is already gone,
 *  - removing a window's last tab closes the window,
 *  - tabs carry no `url` at all until the user grants access (Safari's
 *    permission model), which `accessBlocked` simulates.
 */

const clone = (value) => (value === undefined ? undefined : structuredClone(value));

class Emitter {
  constructor() {
    this.listeners = [];
  }
  addListener(fn) {
    this.listeners.push(fn);
  }
  removeListener(fn) {
    this.listeners = this.listeners.filter((l) => l !== fn);
  }
  hasListener(fn) {
    return this.listeners.includes(fn);
  }
  emit(...args) {
    for (const fn of [...this.listeners]) fn(...args);
  }
}

class MockBrowser {
  constructor() {
    this.nextWindowId = 1;
    this.nextTabId = 1;
    /** When true, tabs come back without a url — Safari before access is granted. */
    this.accessBlocked = false;
    this.badge = '';
    this.openedUrls = [];

    this._windows = new Map();
    this._tabs = new Map();
    this._storage = new Map();

    this.windows = {
      onCreated: new Emitter(),
      onRemoved: new Emitter(),
      onFocusChanged: new Emitter(),
      getAll: async (opts) => this._allWindows(opts),
      get: async (id, opts) => {
        const win = this._windows.get(id);
        if (!win) throw new Error(`No window with id ${id}`);
        return this._describeWindow(win, opts);
      },
      create: async (opts) => this._createWindow(opts),
      update: async (id, props) => {
        const win = this._windows.get(id);
        if (!win) throw new Error(`No window with id ${id}`);
        Object.assign(win, props);
        return this._describeWindow(win, {});
      },
      remove: async (id) => this._removeWindow(id),
    };

    this.tabs = {
      onCreated: new Emitter(),
      onRemoved: new Emitter(),
      onUpdated: new Emitter(),
      onMoved: new Emitter(),
      onActivated: new Emitter(),
      onAttached: new Emitter(),
      onDetached: new Emitter(),
      create: async (opts) => this._createTab(opts),
      update: async (id, props) => {
        const tab = this._tabs.get(id);
        if (!tab) throw new Error(`No tab with id ${id}`);
        if (props.active) {
          for (const other of this._windowTabs(tab.windowId)) other.active = other.id === id;
        }
        if (props.pinned !== undefined) tab.pinned = props.pinned;
        if (props.url !== undefined) tab.url = props.url;
        return this._describeTab(tab);
      },
      remove: async (ids) => this._removeTabs(Array.isArray(ids) ? ids : [ids]),
      query: async () => [...this._tabs.values()].map((tab) => this._describeTab(tab)),
    };

    this.storage = {
      local: {
        get: async (keys) => {
          if (keys === undefined || keys === null) {
            return Object.fromEntries([...this._storage].map(([k, v]) => [k, clone(v)]));
          }
          const list = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
          const out = {};
          for (const key of list) {
            if (this._storage.has(key)) out[key] = clone(this._storage.get(key));
          }
          return out;
        },
        set: async (items) => {
          for (const [key, value] of Object.entries(items)) this._storage.set(key, clone(value));
        },
        remove: async (keys) => {
          for (const key of typeof keys === 'string' ? [keys] : keys) this._storage.delete(key);
        },
        clear: async () => this._storage.clear(),
      },
    };

    this.alarms = {
      onAlarm: new Emitter(),
      created: [],
      create: (name, info) => this.alarms.created.push({ name, info }),
      clear: async () => true,
    };

    this.action = {
      setBadgeText: async ({ text }) => {
        this.badge = text;
      },
    };

    this.runtime = {
      onMessage: new Emitter(),
      onInstalled: new Emitter(),
      onStartup: new Emitter(),
      getURL: (path) => `safari-web-extension://test/${path}`,
      openOptionsPage: async () => {},
    };

    this.i18n = { getMessage: (key) => key };
  }

  // ---- helpers for tests -------------------------------------------------

  /** Open a window the way Safari would, and announce it. */
  openWindow({ tabs = [], incognito = false, type = 'normal', bounds = {} } = {}) {
    const win = {
      id: this.nextWindowId++,
      incognito,
      type,
      top: bounds.top,
      left: bounds.left,
      width: bounds.width,
      height: bounds.height,
    };
    this._windows.set(win.id, win);
    const created = tabs.map((tab, index) => this._addTab(win.id, tab, index, index === 0));
    this.windows.onCreated.emit(this._describeWindow(win, {}));
    created.forEach((tab) => this.tabs.onCreated.emit(this._describeTab(tab)));
    return win.id;
  }

  /** Close a window the way the red button would. */
  closeWindow(id) {
    return this._removeWindow(id);
  }

  /**
   * Quit Safari: every window disappears without a windows.onRemoved event,
   * which is what the extension actually sees when the app terminates.
   */
  quitBrowser() {
    this._windows.clear();
    this._tabs.clear();
  }

  /** Add a tab without going through the extension-facing API. */
  addTab(windowId, tab) {
    const created = this._addTab(windowId, tab, this._windowTabs(windowId).length, false);
    this.tabs.onCreated.emit(this._describeTab(created));
    return created.id;
  }

  tabUrls(windowId) {
    return this._windowTabs(windowId).map((tab) => tab.url);
  }

  windowIds() {
    return [...this._windows.keys()];
  }

  // ---- internals ---------------------------------------------------------

  _addTab(windowId, tab, index, active) {
    const record = {
      id: this.nextTabId++,
      windowId,
      url: tab.url,
      title: tab.title || tab.url,
      pinned: !!tab.pinned,
      active: tab.active !== undefined ? tab.active : active,
      index,
    };
    this._tabs.set(record.id, record);
    this._reindex(windowId);
    return record;
  }

  _windowTabs(windowId) {
    return [...this._tabs.values()]
      .filter((tab) => tab.windowId === windowId)
      .sort((a, b) => a.index - b.index);
  }

  _reindex(windowId) {
    this._windowTabs(windowId).forEach((tab, i) => {
      tab.index = i;
    });
  }

  _describeTab(tab) {
    const described = { ...tab };
    if (this.accessBlocked) {
      delete described.url;
      delete described.title;
    }
    return described;
  }

  _describeWindow(win, opts) {
    const described = { ...win };
    if (opts && opts.populate) {
      described.tabs = this._windowTabs(win.id).map((tab) => this._describeTab(tab));
    }
    return described;
  }

  _allWindows(opts) {
    return [...this._windows.values()].map((win) => this._describeWindow(win, opts));
  }

  _createWindow(opts = {}) {
    const urls = opts.url === undefined ? [] : Array.isArray(opts.url) ? opts.url : [opts.url];
    urls.forEach((url) => this.openedUrls.push(url));
    const win = {
      id: this.nextWindowId++,
      incognito: !!opts.incognito,
      type: 'normal',
      top: opts.top,
      left: opts.left,
      width: opts.width,
      height: opts.height,
    };
    this._windows.set(win.id, win);
    (urls.length ? urls : [undefined]).forEach((url, index) =>
      this._addTab(win.id, { url }, index, index === 0)
    );
    this.windows.onCreated.emit(this._describeWindow(win, {}));
    return this._describeWindow(win, { populate: true });
  }

  _createTab(opts = {}) {
    const windowId = opts.windowId ?? [...this._windows.keys()][0];
    if (!this._windows.has(windowId)) throw new Error(`No window with id ${windowId}`);
    this.openedUrls.push(opts.url);

    const existing = this._windowTabs(windowId);
    const at = opts.index === undefined ? existing.length : Math.min(opts.index, existing.length);
    existing.slice(at).forEach((tab) => {
      tab.index += 1;
    });

    const record = this._addTab(windowId, { url: opts.url, active: !!opts.active }, at, false);
    record.index = at;
    if (opts.active) {
      for (const tab of this._windowTabs(windowId)) tab.active = tab.id === record.id;
    }
    this._reindex(windowId);
    this.tabs.onCreated.emit(this._describeTab(record));
    return this._describeTab(record);
  }

  _removeTabs(ids) {
    const touched = new Set();
    for (const id of ids) {
      const tab = this._tabs.get(id);
      if (!tab) continue;
      this._tabs.delete(id);
      touched.add(tab.windowId);
      this.tabs.onRemoved.emit(id, { windowId: tab.windowId, isWindowClosing: false });
    }
    for (const windowId of touched) {
      this._reindex(windowId);
      // Safari closes a window once its last tab is gone.
      if (!this._windowTabs(windowId).length) this._removeWindow(windowId);
    }
  }

  _removeWindow(id) {
    if (!this._windows.has(id)) return;
    for (const tab of this._windowTabs(id)) this._tabs.delete(tab.id);
    this._windows.delete(id);
    this.windows.onRemoved.emit(id);
  }
}

/** Install a fresh mock and clear anything the modules cached about the old one. */
function installMockBrowser() {
  const mock = new MockBrowser();
  globalThis.browser = mock;
  return mock;
}

const flush = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = { MockBrowser, Emitter, installMockBrowser, flush };
