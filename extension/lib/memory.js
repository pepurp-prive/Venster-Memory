/**
 * The per-profile memory.
 *
 * Safari gives every profile its own extension instance with its own storage,
 * so everything in here is automatically scoped to one profile. No profile id
 * is stored or needed.
 *
 *   liveWindows      mirror of the windows that are open right now, keyed by
 *                    window id. Needed because windows.onRemoved fires when the
 *                    window is already gone and can no longer be queried.
 *   closedWindows    windows that were closed, newest first, capped.
 *   restoreOps       recent restores, newest first, so the popup can undo one.
 *   state            restoreInProgress flag + timestamp.
 */
(function (root, factory) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const mod = factory(isNode ? require('./api.js') : root.VM.api);
  root.VM = Object.assign(root.VM || {}, { memory: mod });
  if (isNode) module.exports = mod;
})(typeof globalThis !== 'undefined' ? globalThis : self, function (api) {
  'use strict';

  const KEYS = Object.freeze({
    live: 'vm.liveWindows',
    closed: 'vm.closedWindows',
    ops: 'vm.restoreOps',
    state: 'vm.state',
  });

  /** A restoreInProgress flag older than this is treated as stale debris. */
  const STALE_LOCK_MS = 60_000;
  /** How many undoable restore operations to keep. */
  const MAX_OPS = 3;

  let idCounter = 0;
  function newId() {
    idCounter += 1;
    return `w${Date.now().toString(36)}-${idCounter.toString(36)}`;
  }

  async function read(key, fallback) {
    const stored = await api.storageGet(key);
    const value = stored && stored[key];
    return value === undefined || value === null ? fallback : value;
  }

  const getLiveWindows = () => read(KEYS.live, {});
  const setLiveWindows = (v) => api.storageSet({ [KEYS.live]: v });
  const getClosedWindows = () => read(KEYS.closed, []);
  const setClosedWindows = (v) => api.storageSet({ [KEYS.closed]: v });
  const getRestoreOps = () => read(KEYS.ops, []);
  const setRestoreOps = (v) => api.storageSet({ [KEYS.ops]: v });

  /** Push a closed window onto the front of the list and trim to `max`. */
  async function rememberClosed(entry, max) {
    const list = await getClosedWindows();
    // The same window can be offered twice: once by windows.onRemoved and once
    // by the reconcile that covers a background page suspended mid-close. The
    // uid it carried while it was open settles which is which.
    if (entry.uid && list.some((existing) => existing.uid === entry.uid)) return null;

    const stamped = Object.assign({ id: newId(), closedAt: Date.now() }, entry);
    list.unshift(stamped);
    await setClosedWindows(list.slice(0, Math.max(1, max)));
    return stamped;
  }

  /** Remove and return the given entries (by id) from the closed list. */
  async function takeClosed(ids) {
    const wanted = new Set(ids);
    const list = await getClosedWindows();
    const taken = list.filter((e) => wanted.has(e.id));
    await setClosedWindows(list.filter((e) => !wanted.has(e.id)));
    // Preserve the caller's requested order.
    return ids.map((id) => taken.find((e) => e.id === id)).filter(Boolean);
  }

  /** Put entries back, newest-first order preserved. Used by undo. */
  async function putBackClosed(entries) {
    const list = await getClosedWindows();
    await setClosedWindows(entries.concat(list));
  }

  async function recordRestoreOp(op) {
    const list = await getRestoreOps();
    list.unshift(Object.assign({ id: newId(), at: Date.now() }, op));
    await setRestoreOps(list.slice(0, MAX_OPS));
  }

  async function takeLatestRestoreOp() {
    const list = await getRestoreOps();
    if (!list.length) return null;
    const [head, ...rest] = list;
    await setRestoreOps(rest);
    return head;
  }

  async function getState() {
    return read(KEYS.state, { restoreInProgress: false, lockedAt: 0, sessionId: 1 });
  }

  async function patchState(patch) {
    const next = Object.assign(await getState(), patch);
    await api.storageSet({ [KEYS.state]: next });
    return next;
  }

  /**
   * Windows closed while Safari was running once carry the same session id.
   * Reopening Safari hands back that session, not every window you ever closed.
   */
  async function getSessionId() {
    return (await getState()).sessionId || 1;
  }

  async function bumpSessionId() {
    const next = ((await getState()).sessionId || 1) + 1;
    await patchState({ sessionId: next });
    return next;
  }

  /**
   * Why the last new window did or did not get its tabs back. Written on every
   * decision and shown in the popup: without a Mac to test on, this is the only
   * way to tell "it never fired" from "it fired and found nothing".
   */
  async function setDecision(code, detail) {
    await patchState({ decision: { code, detail: detail === undefined ? '' : String(detail), at: Date.now() } });
    return code;
  }

  async function getDecision() {
    return (await getState()).decision || null;
  }

  /**
   * True while a restore is running. A lock left behind by a crashed or
   * suspended background page expires instead of wedging the extension.
   */
  async function isRestoring() {
    const state = await getState();
    if (!state.restoreInProgress) return false;
    if (Date.now() - (state.lockedAt || 0) > STALE_LOCK_MS) {
      await setRestoring(false);
      return false;
    }
    return true;
  }

  async function setRestoring(value) {
    await patchState({ restoreInProgress: !!value, lockedAt: value ? Date.now() : 0 });
  }

  async function clearAll() {
    await api.storageRemove([KEYS.live, KEYS.closed, KEYS.ops, KEYS.state]);
  }

  return {
    KEYS,
    MAX_OPS,
    STALE_LOCK_MS,
    newId,
    getLiveWindows,
    setLiveWindows,
    getClosedWindows,
    setClosedWindows,
    rememberClosed,
    takeClosed,
    putBackClosed,
    getRestoreOps,
    setRestoreOps,
    recordRestoreOp,
    takeLatestRestoreOp,
    getState,
    patchState,
    getSessionId,
    bumpSessionId,
    setDecision,
    getDecision,
    isRestoring,
    setRestoring,
    clearAll,
  };
});
