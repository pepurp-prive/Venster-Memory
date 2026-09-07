/** User settings, with defaults. Stored under a single storage key. */
(function (root, factory) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const mod = factory(isNode ? require('./api.js') : root.VM.api);
  root.VM = Object.assign(root.VM || {}, { settings: mod });
  if (isNode) module.exports = mod;
})(typeof globalThis !== 'undefined' ? globalThis : self, function (api) {
  'use strict';

  const KEY = 'vm.settings';

  const DEFAULTS = Object.freeze({
    /** Master switch. */
    enabled: true,
    /** Restore every remembered window when a profile's first window opens. */
    restoreOnFirstWindow: true,
    /** Also hand back the newest remembered window on any later empty window. */
    restoreOnEveryNewWindow: false,
    /** How many closed windows to keep per profile. */
    maxRemembered: 20,
    /** Pause between tabs.create calls; Safari copes badly with bursts. */
    tabCreateDelayMs: 60,
    /** How long to wait before deciding a new window really is empty. */
    settleDelayMs: 700,
  });

  async function get() {
    const stored = await api.storageGet(KEY);
    return Object.assign({}, DEFAULTS, (stored && stored[KEY]) || {});
  }

  async function set(patch) {
    const next = Object.assign({}, await get(), patch);
    await api.storageSet({ [KEY]: next });
    return next;
  }

  async function reset() {
    await api.storageRemove(KEY);
    return Object.assign({}, DEFAULTS);
  }

  return { KEY, DEFAULTS, get, set, reset };
});
