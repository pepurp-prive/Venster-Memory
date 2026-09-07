/** Keeping track of what is open, so a closed window can be handed back. */
(function (root, factory) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const mod = factory(
    isNode ? require('./api.js') : root.VM.api,
    isNode ? require('./memory.js') : root.VM.memory
  );
  root.VM = Object.assign(root.VM || {}, { track: mod });
  if (isNode) module.exports = mod;
})(typeof globalThis !== 'undefined' ? globalThis : self, function (api, memory) {
  'use strict';

  /** Schemes worth remembering. Safari's start page, blank tabs and the
   *  extension's own pages are deliberately not among them. */
  const TRACKABLE_SCHEMES = ['http:', 'https:', 'file:'];

  function isTrackableUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const scheme = url.slice(0, url.indexOf(':') + 1).toLowerCase();
    return TRACKABLE_SCHEMES.includes(scheme);
  }

  /**
   * A window Safari has just opened and not filled itself: exactly one tab,
   * showing nothing worth remembering. A window that already holds real tabs
   * was populated by Safari (a tab group, or a link from another app) and must
   * be left alone.
   */
  function isBlankWindow(win) {
    if (!win || win.incognito) return false;
    if (win.type && win.type !== 'normal') return false;
    const tabs = win.tabs || [];
    return tabs.length === 1 && !isTrackableUrl(tabs[0].url);
  }

  /**
   * Turn a live window into the shape we store, or null when there is nothing
   * worth storing (private window, popup, or no trackable tabs).
   */
  function normalizeWindow(win) {
    if (!win || win.incognito) return null;
    if (win.type && win.type !== 'normal') return null;

    const source = (win.tabs || []).filter((tab) => isTrackableUrl(tab.url));
    if (!source.length) return null;

    let activeIndex = source.findIndex((tab) => tab.active);
    if (activeIndex < 0) activeIndex = 0;

    return {
      tabs: source.map((tab, index) => ({
        url: tab.url,
        title: tab.title || tab.url,
        pinned: !!tab.pinned,
        index,
      })),
      activeIndex,
      bounds: {
        top: win.top,
        left: win.left,
        width: win.width,
        height: win.height,
      },
      updatedAt: Date.now(),
    };
  }

  /**
   * Refresh the mirror of every open window.
   *
   * Entries are updated and added, never dropped: a window that vanished
   * without a windows.onRemoved event — which is what quitting Safari looks
   * like — has to survive here until harvestAll() collects it. Ordinary closes
   * remove their own entry through handleWindowRemoved().
   */
  async function snapshotAll() {
    const windows = await api.windowsGetAll({ populate: true });
    const live = await memory.getLiveWindows();
    for (const win of windows) {
      const entry = normalizeWindow(win);
      if (entry) live[String(win.id)] = entry;
    }
    await memory.setLiveWindows(live);
    return live;
  }

  /**
   * A window is gone. Move what we last knew about it into the closed list.
   * Returns the stored entry, or null when there was nothing to remember.
   */
  async function handleWindowRemoved(windowId, maxRemembered, sessionId) {
    const live = await memory.getLiveWindows();
    const key = String(windowId);
    const entry = live[key];
    delete live[key];
    await memory.setLiveWindows(live);

    if (!entry || !entry.tabs || !entry.tabs.length) return null;
    return memory.rememberClosed(
      {
        tabs: entry.tabs,
        activeIndex: entry.activeIndex,
        bounds: entry.bounds,
        sessionId,
      },
      maxRemembered
    );
  }

  /**
   * Empty the mirror into the memory. Called when Safari has just started, so
   * everything still listed there belongs to the session that ended — which is
   * how windows that were open at the moment you quit are recovered.
   */
  async function harvestAll(sessionId, maxRemembered) {
    const live = await memory.getLiveWindows();
    const entries = Object.values(live);
    await memory.setLiveWindows({});

    const stored = [];
    for (const entry of entries) {
      if (!entry.tabs || !entry.tabs.length) continue;
      stored.push(
        await memory.rememberClosed(
          {
            tabs: entry.tabs,
            activeIndex: entry.activeIndex,
            bounds: entry.bounds,
            sessionId,
          },
          maxRemembered
        )
      );
    }
    return stored;
  }

  return {
    TRACKABLE_SCHEMES,
    isTrackableUrl,
    isBlankWindow,
    normalizeWindow,
    snapshotAll,
    handleWindowRemoved,
    harvestAll,
  };
});
