/**
 * Thin wrapper around the WebExtension API.
 *
 * The API object is resolved lazily on every call so that the unit tests can
 * swap in a fake `globalThis.browser` after this file has been loaded.
 */
(function (root, factory) {
  const mod = factory();
  root.VM = Object.assign(root.VM || {}, { api: mod });
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  'use strict';

  function api() {
    const found = globalThis.browser || globalThis.chrome;
    if (!found) throw new Error('No WebExtension API available');
    return found;
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  return {
    api,
    sleep,

    // windows
    windowsGetAll: (opts) => api().windows.getAll(opts),
    windowsGet: (id, opts) => api().windows.get(id, opts),
    windowsCreate: (opts) => api().windows.create(opts),
    windowsUpdate: (id, opts) => api().windows.update(id, opts),
    windowsRemove: (id) => api().windows.remove(id),

    // tabs
    tabsCreate: (opts) => api().tabs.create(opts),
    tabsUpdate: (id, opts) => api().tabs.update(id, opts),
    tabsRemove: (ids) => api().tabs.remove(ids),
    tabsQuery: (opts) => api().tabs.query(opts),

    // storage
    storageGet: (keys) => api().storage.local.get(keys),
    storageSet: (items) => api().storage.local.set(items),
    storageRemove: (keys) => api().storage.local.remove(keys),

    // misc
    getURL: (path) => api().runtime.getURL(path),
    setBadge: async (text) => {
      const action = api().action || api().browserAction;
      if (!action || !action.setBadgeText) return;
      try {
        await action.setBadgeText({ text });
      } catch (_) {
        /* badges are cosmetic; never let them break a restore */
      }
    },
  };
});
