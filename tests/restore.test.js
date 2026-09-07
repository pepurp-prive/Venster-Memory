'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { installMockBrowser } = require('./mock-browser.js');
const restore = require('../extension/lib/restore.js');
const memory = require('../extension/lib/memory.js');

const entryOf = (urls, extra = {}) =>
  Object.assign(
    {
      tabs: urls.map((url, index) => ({ url, title: url, pinned: false, index })),
      activeIndex: 0,
      bounds: {},
    },
    extra
  );

test('restoring into a window fills it and closes the start page', async () => {
  const mock = installMockBrowser();
  const windowId = mock.openWindow({ tabs: [{ url: 'favorites://' }] });

  const record = await restore.restoreIntoWindow(
    windowId,
    entryOf(['https://a.test', 'https://b.test', 'https://c.test'], { activeIndex: 2 }),
    0
  );

  assert.deepEqual(mock.tabUrls(windowId), ['https://a.test', 'https://b.test', 'https://c.test']);
  assert.equal(record.tabIds.length, 3);
  assert.equal(record.createdWindow, false);
  assert.equal(mock.windowIds().length, 1, 'no extra window flashed up');

  const active = (await mock.windows.get(windowId, { populate: true })).tabs.find((t) => t.active);
  assert.equal(active.url, 'https://c.test', 'the tab that was in front is in front again');
});

test('tab order survives a restore, and the window keeps its place on screen', async () => {
  const mock = installMockBrowser();
  const windowId = mock.openWindow({ tabs: [{ url: 'favorites://' }] });

  await restore.restoreIntoWindow(
    windowId,
    entryOf(['https://1.test', 'https://2.test', 'https://3.test', 'https://4.test'], {
      bounds: { top: 42, left: 84, width: 1200, height: 900 },
    }),
    0
  );

  assert.deepEqual(mock.tabUrls(windowId), [
    'https://1.test',
    'https://2.test',
    'https://3.test',
    'https://4.test',
  ]);
  const win = await mock.windows.get(windowId, {});
  assert.deepEqual(
    { top: win.top, left: win.left, width: win.width, height: win.height },
    { top: 42, left: 84, width: 1200, height: 900 }
  );
});

test('pinned tabs are pinned again', async () => {
  const mock = installMockBrowser();
  const windowId = mock.openWindow({ tabs: [{ url: 'favorites://' }] });

  const entry = entryOf(['https://pin.test', 'https://loose.test']);
  entry.tabs[0].pinned = true;

  await restore.restoreIntoWindow(windowId, entry, 0);

  const tabs = (await mock.windows.get(windowId, { populate: true })).tabs;
  assert.equal(tabs.find((t) => t.url === 'https://pin.test').pinned, true);
  assert.equal(tabs.find((t) => t.url === 'https://loose.test').pinned, false);
});

test('the second and further windows come back as their own windows', async () => {
  const mock = installMockBrowser();
  const target = mock.openWindow({ tabs: [{ url: 'favorites://' }] });

  const records = await restore.restoreEntries(
    target,
    [entryOf(['https://newest.test']), entryOf(['https://older-a.test', 'https://older-b.test'])],
    0
  );

  assert.equal(records.length, 2);
  assert.equal(records[0].createdWindow, false, 'newest reuses the window the user just opened');
  assert.equal(records[1].createdWindow, true);
  assert.equal(mock.windowIds().length, 2);
  assert.deepEqual(mock.tabUrls(target), ['https://newest.test']);
  assert.deepEqual(mock.tabUrls(records[1].windowId), ['https://older-a.test', 'https://older-b.test']);
});

test('undo closes what was opened and hands the windows back to the memory', async () => {
  const mock = installMockBrowser();
  const target = mock.openWindow({ tabs: [{ url: 'favorites://' }] });

  const records = await restore.restoreEntries(
    target,
    [entryOf(['https://a.test', 'https://b.test']), entryOf(['https://c.test'])],
    0
  );
  await memory.recordRestoreOp({ records });

  assert.equal(mock.windowIds().length, 2);

  const undone = await restore.undoLatest();

  assert.ok(undone);
  assert.equal(mock.windowIds().length, 1, 'the window we created is gone again');
  assert.ok(mock.windowIds().includes(target), 'the window the user opened is still standing');
  assert.deepEqual(mock.tabUrls(target), [undefined], 'left with a fresh start page, not closed');

  const closed = await memory.getClosedWindows();
  assert.deepEqual(
    closed.map((entry) => entry.tabs.map((t) => t.url)),
    [['https://a.test', 'https://b.test'], ['https://c.test']],
    'nothing was lost'
  );
  assert.deepEqual(await memory.getRestoreOps(), [], 'the operation is spent');
});

test('undo with nothing to undo is a no-op', async () => {
  installMockBrowser();
  assert.equal(await restore.undoLatest(), null);
});

test('a failure during restore is propagated, not swallowed', async () => {
  const mock = installMockBrowser();
  const target = mock.openWindow({ tabs: [{ url: 'favorites://' }] });

  const original = mock.tabs.create;
  let calls = 0;
  mock.tabs.create = async (opts) => {
    calls += 1;
    if (calls === 2) throw new Error('Safari said no');
    return original.call(mock.tabs, opts);
  };

  await assert.rejects(
    () => restore.restoreEntries(target, [entryOf(['https://a.test', 'https://b.test'])], 0),
    /Safari said no/
  );
});
