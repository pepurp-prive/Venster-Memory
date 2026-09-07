'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { installMockBrowser } = require('./mock-browser.js');
const track = require('../extension/lib/track.js');
const memory = require('../extension/lib/memory.js');

test('only http, https and file URLs are worth remembering', () => {
  assert.equal(track.isTrackableUrl('https://example.com'), true);
  assert.equal(track.isTrackableUrl('http://example.com'), true);
  assert.equal(track.isTrackableUrl('file:///Users/x/a.html'), true);

  assert.equal(track.isTrackableUrl('about:blank'), false);
  assert.equal(track.isTrackableUrl('favorites://'), false);
  assert.equal(track.isTrackableUrl('safari-web-extension://abc/popup.html'), false);
  assert.equal(track.isTrackableUrl(undefined), false, 'Safari withholds url without access');
  assert.equal(track.isTrackableUrl(''), false);
});

test('a window Safari has already filled is not blank', () => {
  assert.equal(track.isBlankWindow({ tabs: [{ url: 'favorites://' }] }), true);
  assert.equal(track.isBlankWindow({ tabs: [{ url: undefined }] }), true);

  assert.equal(
    track.isBlankWindow({ tabs: [{ url: 'https://a.test' }] }),
    false,
    'a single real tab means Safari populated it'
  );
  assert.equal(
    track.isBlankWindow({ tabs: [{ url: 'favorites://' }, { url: 'favorites://' }] }),
    false,
    'two tabs is not a fresh start window'
  );
  assert.equal(track.isBlankWindow({ incognito: true, tabs: [{ url: 'favorites://' }] }), false);
  assert.equal(track.isBlankWindow({ type: 'popup', tabs: [{ url: 'favorites://' }] }), false);
});

test('normalizeWindow drops junk tabs and keeps the active one', () => {
  const entry = track.normalizeWindow({
    id: 1,
    top: 10,
    left: 20,
    width: 800,
    height: 600,
    tabs: [
      { url: 'favorites://', active: false },
      { url: 'https://a.test', title: 'A', active: false, pinned: true },
      { url: 'https://b.test', title: 'B', active: true },
      { url: undefined, active: false },
    ],
  });

  assert.deepEqual(entry.tabs.map((t) => t.url), ['https://a.test', 'https://b.test']);
  assert.deepEqual(entry.tabs.map((t) => t.index), [0, 1], 'indexes are renumbered after filtering');
  assert.equal(entry.activeIndex, 1);
  assert.equal(entry.tabs[0].pinned, true);
  assert.deepEqual(entry.bounds, { top: 10, left: 20, width: 800, height: 600 });
});

test('private windows and windows without real tabs are never remembered', () => {
  assert.equal(track.normalizeWindow({ incognito: true, tabs: [{ url: 'https://a.test' }] }), null);
  assert.equal(track.normalizeWindow({ type: 'popup', tabs: [{ url: 'https://a.test' }] }), null);
  assert.equal(track.normalizeWindow({ tabs: [{ url: 'favorites://' }] }), null);
  assert.equal(track.normalizeWindow({ tabs: [] }), null);
});

test('snapshotAll mirrors every ordinary window, skipping private ones', async () => {
  const mock = installMockBrowser();
  const normal = mock.openWindow({ tabs: [{ url: 'https://a.test' }, { url: 'https://b.test' }] });
  mock.openWindow({ incognito: true, tabs: [{ url: 'https://secret.test' }] });
  mock.openWindow({ tabs: [{ url: 'favorites://' }] });

  const live = await track.snapshotAll();

  assert.deepEqual(Object.keys(live), [String(normal)]);
  assert.equal(live[String(normal)].tabs.length, 2);
});

test('closing a window moves it to the front of the memory', async () => {
  const mock = installMockBrowser();
  const first = mock.openWindow({ tabs: [{ url: 'https://one.test', title: 'One' }] });
  const second = mock.openWindow({ tabs: [{ url: 'https://two.test', title: 'Two' }] });
  await track.snapshotAll();

  mock.closeWindow(first);
  await track.handleWindowRemoved(first, 20);
  mock.closeWindow(second);
  await track.handleWindowRemoved(second, 20);

  const closed = await memory.getClosedWindows();
  assert.deepEqual(
    closed.map((entry) => entry.tabs[0].url),
    ['https://two.test', 'https://one.test'],
    'newest closed window comes first'
  );
  assert.ok(closed[0].closedAt > 0);
  assert.equal(Object.keys(await memory.getLiveWindows()).length, 0);
});

test('an empty window is not worth remembering', async () => {
  const mock = installMockBrowser();
  const id = mock.openWindow({ tabs: [{ url: 'favorites://' }] });
  await track.snapshotAll();

  mock.closeWindow(id);
  assert.equal(await track.handleWindowRemoved(id, 20), null);
  assert.deepEqual(await memory.getClosedWindows(), []);
});

test('the memory is capped at maxRemembered, oldest dropped', async () => {
  const mock = installMockBrowser();
  for (let i = 0; i < 7; i += 1) {
    const id = mock.openWindow({ tabs: [{ url: `https://w${i}.test` }] });
    await track.snapshotAll();
    mock.closeWindow(id);
    await track.handleWindowRemoved(id, 5);
  }

  const closed = await memory.getClosedWindows();
  assert.equal(closed.length, 5);
  assert.deepEqual(
    closed.map((entry) => entry.tabs[0].url),
    ['https://w6.test', 'https://w5.test', 'https://w4.test', 'https://w3.test', 'https://w2.test']
  );
});
