/** Putting a remembered window back on screen. */
(function (root, factory) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const mod = factory(
    isNode ? require('./api.js') : root.VM.api,
    isNode ? require('./memory.js') : root.VM.memory
  );
  root.VM = Object.assign(root.VM || {}, { restore: mod });
  if (isNode) module.exports = mod;
})(typeof globalThis !== 'undefined' ? globalThis : self, function (api, memory) {
  'use strict';

  async function applyBounds(windowId, bounds) {
    if (!bounds) return;
    const update = {};
    for (const key of ['top', 'left', 'width', 'height']) {
      if (typeof bounds[key] === 'number') update[key] = bounds[key];
    }
    if (!Object.keys(update).length) return;
    try {
      await api.windowsUpdate(windowId, update);
    } catch (_) {
      /* Position and size are a nicety, never a reason to fail a restore. */
    }
  }

  /** Create the entry's tabs at the end of `windowId`, one at a time. */
  async function createTabs(windowId, tabs, delayMs, startIndex) {
    const created = [];
    for (let i = 0; i < tabs.length; i += 1) {
      const tab = await api.tabsCreate({
        windowId,
        url: tabs[i].url,
        index: startIndex + i,
        active: false,
      });
      created.push(tab.id);
      if (delayMs > 0 && i < tabs.length - 1) await api.sleep(delayMs);
    }
    return created;
  }

  async function finishWindow(entry, windowId, tabIds) {
    const activeId = tabIds[Math.min(entry.activeIndex || 0, tabIds.length - 1)];
    if (activeId !== undefined) {
      try {
        await api.tabsUpdate(activeId, { active: true });
      } catch (_) { /* not fatal */ }
    }
    // Pinning last: Safari moves pinned tabs to the front, which would
    // otherwise scramble the indexes we just created.
    for (let i = 0; i < entry.tabs.length; i += 1) {
      if (!entry.tabs[i].pinned || tabIds[i] === undefined) continue;
      try {
        await api.tabsUpdate(tabIds[i], { pinned: true });
      } catch (_) { /* best effort */ }
    }
    await applyBounds(windowId, entry.bounds);
  }

  /**
   * Fill an existing (empty) window and close the start page it opened with.
   */
  async function restoreIntoWindow(windowId, entry, delayMs) {
    const win = await api.windowsGet(windowId, { populate: true });
    const preexisting = (win.tabs || []).map((tab) => tab.id);

    const tabIds = await createTabs(windowId, entry.tabs, delayMs, preexisting.length);
    await finishWindow(entry, windowId, tabIds);

    if (preexisting.length) {
      try {
        await api.tabsRemove(preexisting);
      } catch (_) { /* the user may have closed it already */ }
    }
    return { entry, windowId, tabIds, createdWindow: false };
  }

  /** Open a remembered window as a new window. */
  async function restoreAsNewWindow(entry, delayMs) {
    const [first, ...rest] = entry.tabs;
    const created = await api.windowsCreate({ url: first.url });
    const windowId = created.id;
    const firstTabId = (created.tabs && created.tabs[0] && created.tabs[0].id) ?? undefined;

    if (delayMs > 0 && rest.length) await api.sleep(delayMs);
    const restIds = await createTabs(windowId, rest, delayMs, 1);

    const tabIds = [firstTabId, ...restIds];
    await finishWindow(entry, windowId, tabIds);
    return { entry, windowId, tabIds, createdWindow: true };
  }

  /**
   * Restore `entries` (newest first). The first one goes into `targetWindowId`
   * so the window the user just opened is the one that fills up; the rest come
   * back as new windows.
   */
  async function restoreEntries(targetWindowId, entries, delayMs) {
    const records = [];
    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i];
      if (!entry || !entry.tabs || !entry.tabs.length) continue;
      records.push(
        i === 0 && targetWindowId !== null && targetWindowId !== undefined
          ? await restoreIntoWindow(targetWindowId, entry, delayMs)
          : await restoreAsNewWindow(entry, delayMs)
      );
    }
    return records;
  }

  /**
   * Undo the most recent restore: close what we opened and put the windows back
   * into the memory, so nothing is lost when we guessed wrong.
   */
  async function undoLatest() {
    const op = await memory.takeLatestRestoreOp();
    if (!op || !op.records || !op.records.length) return null;

    for (const record of op.records) {
      try {
        if (record.createdWindow) {
          await api.windowsRemove(record.windowId);
        } else {
          // Leave the window standing with a fresh start page rather than
          // closing it out from under the user.
          await api.tabsCreate({ windowId: record.windowId, active: true });
          await api.tabsRemove(record.tabIds.filter((id) => id !== undefined));
        }
      } catch (_) { /* the user may already have closed it */ }
    }

    await memory.putBackClosed(op.records.map((record) => record.entry));
    return op;
  }

  return {
    applyBounds,
    createTabs,
    restoreIntoWindow,
    restoreAsNewWindow,
    restoreEntries,
    undoLatest,
  };
});
