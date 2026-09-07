/**
 * Wiring: turns browser events into tracking and restoring.
 *
 * Kept out of background.js so the whole decision tree can be unit tested
 * against a fake browser API.
 */
(function (root, factory) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const mod = factory(
    isNode ? require('./api.js') : root.VM.api,
    isNode ? require('./settings.js') : root.VM.settings,
    isNode ? require('./memory.js') : root.VM.memory,
    isNode ? require('./track.js') : root.VM.track,
    isNode ? require('./restore.js') : root.VM.restore
  );
  root.VM = Object.assign(root.VM || {}, { controller: mod });
  if (isNode) module.exports = mod;
})(typeof globalThis !== 'undefined' ? globalThis : self, function (api, settings, memory, track, restore) {
  'use strict';

  const SNAPSHOT_DEBOUNCE_MS = 500;
  const ALARM_NAME = 'vm.snapshot';

  let snapshotTimer = null;
  /** Set when Safari has just started; everything else waits for it. */
  let startupHarvest = null;

  function log(err) {
    if (err) console.error('[Venster-Memory]', err);
  }

  /** Collapse a burst of tab events into a single write. */
  function scheduleSnapshot(delayMs) {
    const wait = delayMs === undefined ? SNAPSHOT_DEBOUNCE_MS : delayMs;
    if (snapshotTimer) clearTimeout(snapshotTimer);
    snapshotTimer = setTimeout(() => {
      snapshotTimer = null;
      runSnapshot().catch(log);
    }, wait);
  }

  async function runSnapshot() {
    await settled();
    const conf = await settings.get();
    if (!conf.enabled) return null;
    if (await memory.isRestoring()) return null;
    return track.snapshotAll();
  }

  /** Wait for a pending startup harvest so nothing races past it. */
  async function settled() {
    if (!startupHarvest) return;
    try {
      await startupHarvest;
    } catch (err) {
      log(err);
    }
  }

  /**
   * Safari has just started. Anything still in the mirror was open when Safari
   * quit — windows.onRemoved does not reliably fire on quit — so it belongs in
   * the memory before anything else touches it.
   */
  function beginStartupHarvest() {
    startupHarvest = (async () => {
      const conf = await settings.get();
      if (!conf.enabled) return null;
      return track.harvestAll(await memory.getSessionId(), conf.maxRemembered);
    })();
    startupHarvest.catch(log);
    return startupHarvest;
  }

  /** Whether Safari is actually handing us tab URLs yet. */
  async function checkAccess() {
    let tabs;
    try {
      tabs = await api.tabsQuery({});
    } catch (_) {
      return 'unknown';
    }
    if (!tabs || !tabs.length) return 'unknown';
    return tabs.some((tab) => typeof tab.url === 'string' && tab.url.length) ? 'ok' : 'blocked';
  }

  /**
   * Hand the given remembered windows back. On failure they go straight back
   * into the memory rather than evaporating.
   */
  async function performRestore(targetWindowId, ids, conf) {
    const entries = await memory.takeClosed(ids);
    if (!entries.length) return null;

    await memory.setRestoring(true);
    try {
      const records = await restore.restoreEntries(targetWindowId, entries, conf.tabCreateDelayMs);
      await memory.recordRestoreOp({ records });
      await api.setBadge(String(records.reduce((sum, r) => sum + r.tabIds.length, 0)));
      return records;
    } catch (err) {
      await memory.putBackClosed(entries);
      throw err;
    } finally {
      await memory.setRestoring(false);
      await runSnapshot().catch(log);
    }
  }

  /**
   * A window appeared. Wait for it to settle: if Safari fills it itself — a tab
   * group, or a link opened from another app — it is none of our business.
   * Only a window that is still empty gets its tabs handed back.
   */
  async function onWindowCreated(windowId) {
    await settled();
    const conf = await settings.get();
    if (!conf.enabled) return null;
    if (await memory.isRestoring()) return null;

    if (conf.settleDelayMs > 0) await api.sleep(conf.settleDelayMs);
    if (await memory.isRestoring()) return null;

    let win;
    try {
      win = await api.windowsGet(windowId, { populate: true });
    } catch (_) {
      return null; // closed again while we waited
    }
    if (!win || !track.isBlankWindow(win)) return null;

    const all = await api.windowsGetAll({ populate: true });
    const normal = all.filter((w) => !w.incognito && (!w.type || w.type === 'normal'));
    const isFirstWindow = normal.length <= 1;

    const closed = await memory.getClosedWindows();
    if (!closed.length) return null;

    let wanted;
    if (isFirstWindow) {
      if (!conf.restoreOnFirstWindow) return null;
      // Only the windows from the session that just ended, so reopening Safari
      // after a fortnight does not throw twenty windows at you.
      const sessionId = await memory.getSessionId();
      wanted = closed.filter((entry) =>
        (entry.sessionId === undefined ? sessionId : entry.sessionId) === sessionId
      );
      await memory.bumpSessionId();
      if (!wanted.length) return null;
    } else {
      if (!conf.restoreOnEveryNewWindow) return null;
      wanted = closed.slice(0, 1);
    }

    return performRestore(windowId, wanted.map((entry) => entry.id), conf);
  }

  /** A window is gone: remember what was in it. */
  async function onWindowRemoved(windowId) {
    await settled();
    const conf = await settings.get();
    if (!conf.enabled) return null;
    if (await memory.isRestoring()) return null;
    return track.handleWindowRemoved(windowId, conf.maxRemembered, await memory.getSessionId());
  }

  /** Restore one remembered window on request from the popup. */
  async function restoreById(id, targetWindowId) {
    const conf = await settings.get();
    return performRestore(
      targetWindowId === undefined ? null : targetWindowId,
      [id],
      conf
    );
  }

  async function undo() {
    await memory.setRestoring(true);
    try {
      return await restore.undoLatest();
    } finally {
      await memory.setRestoring(false);
      await api.setBadge('');
      await runSnapshot().catch(log);
    }
  }

  async function forget(id) {
    const list = await memory.getClosedWindows();
    await memory.setClosedWindows(list.filter((entry) => entry.id !== id));
  }

  async function getOverview() {
    const [conf, closed, ops, access] = await Promise.all([
      settings.get(),
      memory.getClosedWindows(),
      memory.getRestoreOps(),
      checkAccess(),
    ]);
    const live = await memory.getLiveWindows();
    const trackedTabs = Object.values(live).reduce((sum, w) => sum + w.tabs.length, 0);
    return { settings: conf, closed, ops, access, trackedTabs, trackedWindows: Object.keys(live).length };
  }

  /** Messages from the popup and the options page. */
  async function handleMessage(message) {
    switch (message && message.type) {
      case 'overview':
        return getOverview();
      case 'restore':
        await restoreById(message.id, message.windowId);
        return getOverview();
      case 'undo':
        await undo();
        return getOverview();
      case 'forget':
        await forget(message.id);
        return getOverview();
      case 'clear':
        await memory.clearAll();
        await runSnapshot().catch(log);
        return getOverview();
      case 'settings':
        await settings.set(message.patch || {});
        return getOverview();
      case 'badge':
        await api.setBadge('');
        return null;
      default:
        return null;
    }
  }

  function openWelcome() {
    api.tabsCreate({ url: api.getURL('welcome/welcome.html') }).catch(log);
  }

  function start() {
    const b = api.api();
    const bump = () => scheduleSnapshot();

    for (const name of ['onCreated', 'onRemoved', 'onUpdated', 'onMoved', 'onActivated', 'onAttached', 'onDetached']) {
      if (b.tabs[name]) b.tabs[name].addListener(bump);
    }
    if (b.windows.onBoundsChanged) b.windows.onBoundsChanged.addListener(bump);

    b.windows.onCreated.addListener((win) => {
      scheduleSnapshot();
      onWindowCreated(win.id).catch(log);
    });
    b.windows.onRemoved.addListener((id) => {
      onWindowRemoved(id).catch(log);
    });

    if (b.runtime.onStartup) {
      b.runtime.onStartup.addListener(() => {
        beginStartupHarvest();
        scheduleSnapshot();
      });
    }
    if (b.runtime.onInstalled) {
      b.runtime.onInstalled.addListener((details) => {
        if (!details || details.reason === 'install') openWelcome();
      });
    }
    if (b.runtime.onMessage) b.runtime.onMessage.addListener((message) => handleMessage(message));

    if (b.alarms) {
      b.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
      b.alarms.onAlarm.addListener((alarm) => {
        if (alarm && alarm.name === ALARM_NAME) runSnapshot().catch(log);
      });
    }

    scheduleSnapshot(1200);
  }

  /** Cancel a pending snapshot. Used by the unit tests between cases. */
  function stop() {
    if (snapshotTimer) clearTimeout(snapshotTimer);
    snapshotTimer = null;
    startupHarvest = null;
  }

  return {
    ALARM_NAME,
    SNAPSHOT_DEBOUNCE_MS,
    scheduleSnapshot,
    runSnapshot,
    settled,
    beginStartupHarvest,
    checkAccess,
    performRestore,
    onWindowCreated,
    onWindowRemoved,
    restoreById,
    undo,
    forget,
    getOverview,
    handleMessage,
    start,
    stop,
  };
});
