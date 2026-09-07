'use strict';

const api = globalThis.browser || globalThis.chrome;

for (const node of document.querySelectorAll('[data-i18n]')) {
  node.textContent = api.i18n.getMessage(node.dataset.i18n) || node.dataset.i18n;
}
