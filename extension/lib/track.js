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
   * A window Safari opened and did not fill itself: nothing in it is worth
   * remembering. A window that already holds a real tab was populated by
   * Safari — a tab group, or a link from another app — and is left alone.
   *
   * Deliberately not "exactly one tab": Safari's start page is reported in
   * more than one shape, and a window can come up with a second blank tab.
   * Anything with no real tab in it is fair game.
   */
  function isBlankWindow(win) {
    if (!win || win.incognito) return false;
    if (win.type && win.type !== 'normal') return false;
    return !(win.tabs || []).some((tab) => isTrackableUrl(tab.url));
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
   * like, and what a background page torn down mid-close looks like — has to
   * survive here until it is collected.
   *
   * Every entry keeps a uid for as long as its window lives, so the same closed
   * window cannot end up in the memory twice.
   */
  async function snapshotAll() {
    const windows = await api.windowsGetAll({ populate: true });
    const live = await memory.getLiveWindows();
    for (const win of windows) {
      const entry = normalizeWindow(win);
      if (!entry) continue;
      const key = String(win.id);
      entry.uid = (live[key] && live[key].uid) || memory.newId();
      live[key] = entry;
    }
    await memory.setLiveWindows(live);
    return live;
  }

  function toClosed(entry, sessionId) {
    return {
      uid: entry.uid,
      tabs: entry.tabs,
      activeIndex: entry.activeIndex,
      bounds: entry.bounds,
      sessionId,
    };
  }

  /**
   * A window is gone. Move what we last knew about it into the memory.
   *
   * The memory is written before the mirror is trimmed: if Safari suspends the
   * background page halfway — which it readily does when the last window of a
   * profile closes — the tabs are already safe, and the leftover mirror entry
   * is picked up by reconcileClosed() and deduplicated on its uid.
   */
  async function handleWindowRemoved(windowId, maxRemembered, sessionId) {
    const live = await memory.getLiveWindows();
    const key = String(windowId);
    const entry = live[key];
    if (!entry || !entry.tabs || !entry.tabs.length) {
      if (entry) {
        delete live[key];
        await memory.setLiveWindows(live);
      }
      return null;
    }

    const stored = await memory.rememberClosed(toClosed(entry, sessionId), maxRemembered);
    delete live[key];
    await memory.setLiveWindows(live);
    return stored;
  }

  /**
   * Collect mirror entries whose window is no longer open.
   *
   * This is the safety net that makes the whole thing work: closing the last
   * window of a profile can suspend the background page before onRemoved has
   * finished writing, so the moment a new window appears we check the mirror
   * against reality rather than trusting that the event got through.
   */
  async function reconcileClosed(openWindows, sessionId, maxRemembered) {
    const live = await memory.getLiveWindows();
    const openIds = new Set((openWindows || []).map((win) => String(win.id)));

    const gone = Object.keys(live).filter((key) => !openIds.has(key));
    if (!gone.length) return [];

    const stored = [];
    for (const key of gone) {
      const entry = live[key];
      if (entry && entry.tabs && entry.tabs.length) {
        stored.push(await memory.rememberClosed(toClosed(entry, sessionId), maxRemembered));
      }
      delete live[key];
    }
    await memory.setLiveWindows(live);
    return stored.filter(Boolean);
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
      stored.push(await memory.rememberClosed(toClosed(entry, sessionId), maxRemembered));
    }
    return stored.filter(Boolean);
  }

  return {
    TRACKABLE_SCHEMES,
    isTrackableUrl,
    isBlankWindow,
    normalizeWindow,
    snapshotAll,
    handleWindowRemoved,
    reconcileClosed,
    harvestAll,
  };
});
