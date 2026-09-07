'use strict';

const api = globalThis.browser || globalThis.chrome;

const els = {
  status: document.getElementById('status'),
  empty: document.getElementById('empty'),
  list: document.getElementById('list'),
  access: document.getElementById('access'),
  accessHelp: document.getElementById('access-help'),
  undoBox: document.getElementById('undo-box'),
  undo: document.getElementById('undo'),
  options: document.getElementById('options'),
};

function t(key, subs) {
  return api.i18n.getMessage(key, subs) || key;
}

function applyStaticText() {
  for (const node of document.querySelectorAll('[data-i18n]')) {
    node.textContent = t(node.dataset.i18n);
  }
}

function timeAgo(ms) {
  const seconds = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function send(message) {
  return api.runtime.sendMessage(message);
}

function render(overview) {
  if (!overview) return;
  const { settings, closed, ops, access, trackedTabs, trackedWindows } = overview;

  els.access.hidden = access !== 'blocked';
  els.undoBox.hidden = !ops || !ops.length;

  els.status.textContent = settings.enabled
    ? t('popupTracking', [String(trackedWindows), String(trackedTabs)])
    : t('popupDisabled');

  els.list.textContent = '';
  els.empty.hidden = closed.length > 0;

  for (const entry of closed) {
    const active = entry.tabs[Math.min(entry.activeIndex || 0, entry.tabs.length - 1)] || entry.tabs[0];

    const li = document.createElement('li');

    const meta = document.createElement('div');
    meta.className = 'meta';

    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = active ? active.title : '';
    title.title = active ? active.url : '';

    const sub = document.createElement('div');
    sub.className = 'sub';
    sub.textContent = `${t('popupTabCount', [String(entry.tabs.length)])} · ${timeAgo(entry.closedAt)}`;

    meta.append(title, sub);

    const restore = document.createElement('button');
    restore.className = 'primary';
    restore.textContent = t('popupRestore');
    restore.addEventListener('click', async () => {
      restore.disabled = true;
      render(await send({ type: 'restore', id: entry.id }));
      window.close();
    });

    const forget = document.createElement('button');
    forget.className = 'quiet';
    forget.textContent = t('popupForget');
    forget.addEventListener('click', async () => {
      render(await send({ type: 'forget', id: entry.id }));
    });

    li.append(meta, restore, forget);
    els.list.append(li);
  }
}

els.undo.addEventListener('click', async () => {
  els.undo.disabled = true;
  render(await send({ type: 'undo' }));
  els.undo.disabled = false;
});

els.options.addEventListener('click', (event) => {
  event.preventDefault();
  api.runtime.openOptionsPage();
  window.close();
});

els.accessHelp.addEventListener('click', () => {
  api.tabs.create({ url: api.runtime.getURL('welcome/welcome.html') });
  window.close();
});

(async function init() {
  applyStaticText();
  render(await send({ type: 'overview' }));
  send({ type: 'badge' });
})();
