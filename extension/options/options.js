'use strict';

const api = globalThis.browser || globalThis.chrome;

const BOOLEANS = ['enabled', 'restoreOnFirstWindow', 'restoreOnEveryNewWindow'];
const NUMBERS = ['maxRemembered', 'tabCreateDelayMs', 'settleDelayMs'];

const saved = document.getElementById('saved');

function t(key) {
  return api.i18n.getMessage(key) || key;
}

function flashSaved() {
  saved.classList.add('show');
  setTimeout(() => saved.classList.remove('show'), 1200);
}

function send(message) {
  return api.runtime.sendMessage(message);
}

function fill(settings) {
  for (const key of BOOLEANS) document.getElementById(key).checked = !!settings[key];
  for (const key of NUMBERS) document.getElementById(key).value = settings[key];
}

async function save(key, value) {
  const overview = await send({ type: 'settings', patch: { [key]: value } });
  fill(overview.settings);
  flashSaved();
}

(async function init() {
  for (const node of document.querySelectorAll('[data-i18n]')) {
    node.textContent = t(node.dataset.i18n);
  }

  const overview = await send({ type: 'overview' });
  fill(overview.settings);

  for (const key of BOOLEANS) {
    document.getElementById(key).addEventListener('change', (event) => save(key, event.target.checked));
  }
  for (const key of NUMBERS) {
    document.getElementById(key).addEventListener('change', (event) => {
      const value = Number(event.target.value);
      if (Number.isFinite(value)) save(key, value);
    });
  }

  document.getElementById('clear').addEventListener('click', async () => {
    if (!confirm(t('optionsClearConfirm'))) return;
    await send({ type: 'clear' });
    fill((await send({ type: 'overview' })).settings);
    flashSaved();
  });
})();
