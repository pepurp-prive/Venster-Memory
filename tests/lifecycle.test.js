'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { installMockBrowser, flush } = require('./mock-browser.js');
const controller = require('../extension/lib/controller.js');
const settings = require('../extension/lib/settings.js');
const memory = require('../extension/lib/memory.js');
const track = require('../extension/lib/track.js');

/** Set up a mock with instant timings; returns the mock. */
async function setup(patch = {}) {
  controller.stop(); // clear module state left by an earlier case
  const mock = installMockBrowser();
  await settings.set(Object.assign({ settleDelayMs: 0, tabCreateDelayMs: 0 }, patch));
  return mock;
}

test('the red button: close the last window, open Safari, the tabs are back', async () => {
  const mock = await setup();

  const original = mock.openWindow({
    tabs: [
      { url: 'https://maccess.io/download', title: 'Download | Maccess' },
      { url: 'https://apple.com/mac-mini', title: 'Buy Mac mini' },
      { url: 'https://apple.com/mac-studio', title: 'Buy Mac Studio' },
    ],
    bounds: { top: 25, left: 0, width: 1440, height: 900 },
  });
  await track.snapshotAll();

  // The red button. Safari itself keeps running.
  mock.closeWindow(original);
  await controller.onWindowRemoved(original);
  assert.equal((await memory.getClosedWindows()).length, 1);

  // Opening Safari again gives a fresh start-page window.
  const reopened = mock.openWindow({ tabs: [{ url: 'favorites://' }] });
  await controller.onWindowCreated(reopened);

  assert.deepEqual(mock.tabUrls(reopened), [
    'https://maccess.io/download',
    'https://apple.com/mac-mini',
    'https://apple.com/mac-studio',
  ]);
  assert.equal(mock.windowIds().length, 1);
  assert.deepEqual(await memory.getClosedWindows(), [], 'it has been handed back, so it is spent');
});

test('every window of the profile comes back when Safari reopens', async () => {
  const mock = await setup();

  const first = mock.openWindow({ tabs: [{ url: 'https://one.test' }] });
  const second = mock.openWindow({ tabs: [{ url: 'https://two-a.test' }, { url: 'https://two-b.test' }] });
  await track.snapshotAll();

  mock.closeWindow(first);
  await controller.onWindowRemoved(first);
  mock.closeWindow(second);
  await controller.onWindowRemoved(second);

  const reopened = mock.openWindow({ tabs: [{ url: 'favorites://' }] });
  await controller.onWindowCreated(reopened);

  assert.equal(mock.windowIds().length, 2, 'both windows are on screen again');
  assert.deepEqual(
    mock.tabUrls(reopened),
    ['https://two-a.test', 'https://two-b.test'],
    'the most recently closed window takes the window the user just opened'
  );
  const other = mock.windowIds().find((id) => id !== reopened);
  assert.deepEqual(mock.tabUrls(other), ['https://one.test']);
});

test('a window Safari fills itself — a tab group — is left alone', async () => {
  const mock = await setup({ settleDelayMs: 40 });

  const closed = mock.openWindow({ tabs: [{ url: 'https://loose.test' }] });
  await track.snapshotAll();
  mock.closeWindow(closed);
  await controller.onWindowRemoved(closed);

  // The user opens the "Naamloos" tab group: Safari populates the window
  // during the grace period.
  const grouped = mock.openWindow({ tabs: [{ url: 'favorites://' }] });
  const pending = controller.onWindowCreated(grouped);
  mock.addTab(grouped, { url: 'https://group-a.test' });
  mock.addTab(grouped, { url: 'https://group-b.test' });

  assert.equal(await pending, null, 'nothing was restored');
  assert.deepEqual(mock.tabUrls(grouped), ['favorites://', 'https://group-a.test', 'https://group-b.test']);
  assert.equal((await memory.getClosedWindows()).length, 1, 'the memory is untouched');
});

test('a new window opened by hand stays empty by default', async () => {
  const mock = await setup();

  const closed = mock.openWindow({ tabs: [{ url: 'https://remembered.test' }] });
  await track.snapshotAll();
  mock.closeWindow(closed);
  await controller.onWindowRemoved(closed);

  // Safari is still running with a window open.
  mock.openWindow({ tabs: [{ url: 'https://still-open.test' }] });
  const fresh = mock.openWindow({ tabs: [{ url: 'favorites://' }] });

  assert.equal(await controller.onWindowCreated(fresh), null);
  assert.deepEqual(mock.tabUrls(fresh), ['favorites://']);
  assert.equal((await memory.getClosedWindows()).length, 1, 'still remembered, just not forced on you');
});

test('with restoreOnEveryNewWindow, a later window gets the newest one back', async () => {
  const mock = await setup({ restoreOnEveryNewWindow: true });

  for (const url of ['https://older.test', 'https://newest.test']) {
    const id = mock.openWindow({ tabs: [{ url }] });
    await track.snapshotAll();
    mock.closeWindow(id);
    await controller.onWindowRemoved(id);
  }

  mock.openWindow({ tabs: [{ url: 'https://still-open.test' }] });
  const fresh = mock.openWindow({ tabs: [{ url: 'favorites://' }] });
  await controller.onWindowCreated(fresh);

  assert.deepEqual(mock.tabUrls(fresh), ['https://newest.test'], 'only the newest, not the whole memory');
  assert.deepEqual(
    (await memory.getClosedWindows()).map((e) => e.tabs[0].url),
    ['https://older.test']
  );
});

test('restoreOnFirstWindow off means the extension keeps its hands off', async () => {
  const mock = await setup({ restoreOnFirstWindow: false });

  const closed = mock.openWindow({ tabs: [{ url: 'https://remembered.test' }] });
  await track.snapshotAll();
  mock.closeWindow(closed);
  await controller.onWindowRemoved(closed);

  const reopened = mock.openWindow({ tabs: [{ url: 'favorites://' }] });
  assert.equal(await controller.onWindowCreated(reopened), null);
  assert.deepEqual(mock.tabUrls(reopened), ['favorites://']);
});

test('switched off, nothing is remembered and nothing is restored', async () => {
  const mock = await setup({ enabled: false });

  const id = mock.openWindow({ tabs: [{ url: 'https://a.test' }] });
  assert.equal(await controller.runSnapshot(), null);
  mock.closeWindow(id);
  assert.equal(await controller.onWindowRemoved(id), null);

  const fresh = mock.openWindow({ tabs: [{ url: 'favorites://' }] });
  assert.equal(await controller.onWindowCreated(fresh), null);
  assert.deepEqual(await memory.getClosedWindows(), []);
});

test('the same window is never handed back twice', async () => {
  const mock = await setup();

  const closed = mock.openWindow({ tabs: [{ url: 'https://once.test' }] });
  await track.snapshotAll();
  mock.closeWindow(closed);
  await controller.onWindowRemoved(closed);

  const first = mock.openWindow({ tabs: [{ url: 'favorites://' }] });
  await controller.onWindowCreated(first);
  assert.deepEqual(mock.tabUrls(first), ['https://once.test']);

  mock.closeWindow(first);
  // Deliberately not tracked: pretend the mirror never caught up.
  await memory.setLiveWindows({});

  const second = mock.openWindow({ tabs: [{ url: 'favorites://' }] });
  assert.equal(await controller.onWindowCreated(second), null);
  assert.deepEqual(mock.tabUrls(second), ['favorites://']);
});

test('no snapshot is written while a restore is running', async () => {
  const mock = await setup();
  mock.openWindow({ tabs: [{ url: 'https://a.test' }] });

  await memory.setRestoring(true);
  assert.equal(await controller.runSnapshot(), null);
  assert.deepEqual(await memory.getLiveWindows(), {});

  await memory.setRestoring(false);
  assert.ok(await controller.runSnapshot());
  assert.equal(Object.keys(await memory.getLiveWindows()).length, 1);
});

test('a stale restore lock does not wedge the extension', async () => {
  const mock = await setup();
  mock.openWindow({ tabs: [{ url: 'https://a.test' }] });

  await mock.storage.local.set({
    [memory.KEYS.state]: { restoreInProgress: true, lockedAt: Date.now() - memory.STALE_LOCK_MS - 1000 },
  });

  assert.equal(await memory.isRestoring(), false, 'the lock has expired');
  assert.ok(await controller.runSnapshot());
});

test('a failed restore hands every window straight back to the memory', async () => {
  const mock = await setup();

  const closed = mock.openWindow({ tabs: [{ url: 'https://a.test' }, { url: 'https://b.test' }] });
  await track.snapshotAll();
  mock.closeWindow(closed);
  await controller.onWindowRemoved(closed);

  const before = await memory.getClosedWindows();
  const fresh = mock.openWindow({ tabs: [{ url: 'favorites://' }] });

  mock.tabs.create = async () => {
    throw new Error('Safari said no');
  };

  await assert.rejects(() => controller.onWindowCreated(fresh), /Safari said no/);

  const after = await memory.getClosedWindows();
  assert.deepEqual(
    after.map((e) => e.tabs.map((t) => t.url)),
    before.map((e) => e.tabs.map((t) => t.url)),
    'nothing was lost when the restore blew up'
  );
  assert.equal(await memory.isRestoring(), false, 'and the lock was released');
});

test('undo puts a wrongly restored window back where it came from', async () => {
  const mock = await setup();

  const closed = mock.openWindow({ tabs: [{ url: 'https://a.test' }, { url: 'https://b.test' }] });
  await track.snapshotAll();
  mock.closeWindow(closed);
  await controller.onWindowRemoved(closed);

  // Imagine this window was actually an empty tab group.
  const fresh = mock.openWindow({ tabs: [{ url: 'favorites://' }] });
  await controller.onWindowCreated(fresh);
  assert.equal(mock.tabUrls(fresh).length, 2);
  assert.equal((await memory.getRestoreOps()).length, 1);

  await controller.undo();

  assert.deepEqual(mock.tabUrls(fresh), [undefined], 'back to a start page');
  assert.deepEqual(
    (await memory.getClosedWindows()).map((e) => e.tabs.map((t) => t.url)),
    [['https://a.test', 'https://b.test']]
  );
  assert.equal(mock.badge, '', 'and the badge is cleared');
});

test('Safari withholding tab URLs is reported, not silently ignored', async () => {
  const mock = await setup();
  mock.openWindow({ tabs: [{ url: 'https://a.test' }] });

  assert.equal(await controller.checkAccess(), 'ok');

  mock.accessBlocked = true;
  assert.equal(await controller.checkAccess(), 'blocked');

  const overview = await controller.getOverview();
  assert.equal(overview.access, 'blocked');
});

test('the overview the popup renders reflects what is tracked and remembered', async () => {
  const mock = await setup();

  const open = mock.openWindow({ tabs: [{ url: 'https://live-a.test' }, { url: 'https://live-b.test' }] });
  const gone = mock.openWindow({ tabs: [{ url: 'https://gone.test' }] });
  await track.snapshotAll();
  mock.closeWindow(gone);
  await controller.onWindowRemoved(gone);
  await track.snapshotAll();

  const overview = await controller.getOverview();
  assert.equal(overview.trackedWindows, 1);
  assert.equal(overview.trackedTabs, 2);
  assert.equal(overview.closed.length, 1);
  assert.equal(overview.closed[0].tabs[0].url, 'https://gone.test');
  assert.ok(mock.windowIds().includes(open));
});

test('end to end through the real event wiring', async () => {
  const mock = await setup();
  controller.start();
  await flush(20);

  const working = mock.openWindow({
    tabs: [{ url: 'https://github.com/a' }, { url: 'https://github.com/b' }],
  });
  await flush(600); // let the debounced snapshot land

  mock.closeWindow(working); // the red button
  await flush(50);
  assert.equal((await memory.getClosedWindows()).length, 1);

  mock.openWindow({ tabs: [{ url: 'favorites://' }] }); // Safari opened again
  await flush(150);

  const [only] = mock.windowIds();
  assert.deepEqual(mock.tabUrls(only), ['https://github.com/a', 'https://github.com/b']);

  controller.stop();
});

test('the alarm keeps the mirror fresh even if events are missed', async () => {
  const mock = await setup();
  controller.start();
  await flush(20);
  controller.stop();

  assert.deepEqual(
    mock.alarms.created.map((a) => a.name),
    [controller.ALARM_NAME]
  );

  mock.openWindow({ tabs: [{ url: 'https://a.test' }] });
  await memory.setLiveWindows({}); // pretend the events never arrived

  mock.alarms.onAlarm.emit({ name: controller.ALARM_NAME });
  await flush(20);

  assert.equal(Object.keys(await memory.getLiveWindows()).length, 1);
});

test('quitting Safari: windows that vanished without an event are recovered', async () => {
  const mock = await setup();

  mock.openWindow({ tabs: [{ url: 'https://persoonlijk-a.test' }, { url: 'https://persoonlijk-b.test' }] });
  await track.snapshotAll();

  // Cmd+Q. No windows.onRemoved arrives; the mirror is all that is left.
  mock.quitBrowser();
  assert.equal(Object.keys(await memory.getLiveWindows()).length, 1, 'the mirror survives the quit');
  assert.deepEqual(await memory.getClosedWindows(), []);

  controller.beginStartupHarvest();
  await controller.settled();

  assert.deepEqual(await memory.getLiveWindows(), {}, 'the mirror is emptied');
  assert.equal((await memory.getClosedWindows()).length, 1, 'and its window is now remembered');

  const reopened = mock.openWindow({ tabs: [{ url: 'favorites://' }] });
  await controller.onWindowCreated(reopened);

  assert.deepEqual(mock.tabUrls(reopened), ['https://persoonlijk-a.test', 'https://persoonlijk-b.test']);
});

test('a snapshot never drops a window that disappeared without an event', async () => {
  const mock = await setup();

  mock.openWindow({ tabs: [{ url: 'https://gone.test' }] });
  await track.snapshotAll();
  mock.quitBrowser();

  const stillOpen = mock.openWindow({ tabs: [{ url: 'https://new.test' }] });
  const live = await track.snapshotAll();

  assert.equal(Object.keys(live).length, 2, 'the vanished window is kept for the harvest');
  assert.ok(Object.values(live).some((entry) => entry.tabs[0].url === 'https://gone.test'));
  assert.ok(live[String(stillOpen)]);
});

test('only the session that just ended comes back, not everything ever closed', async () => {
  const mock = await setup();

  // An old session: closed, handed back, done with.
  const old = mock.openWindow({ tabs: [{ url: 'https://last-week.test' }] });
  await track.snapshotAll();
  mock.closeWindow(old);
  await controller.onWindowRemoved(old);

  const firstReopen = mock.openWindow({ tabs: [{ url: 'favorites://' }] });
  await controller.onWindowCreated(firstReopen);
  assert.deepEqual(mock.tabUrls(firstReopen), ['https://last-week.test']);

  // Deliberately push it back into the memory as a leftover from that session.
  mock.closeWindow(firstReopen);
  await memory.setLiveWindows({});
  await memory.setClosedWindows([
    { id: 'stale', closedAt: Date.now() - 8.64e7, sessionId: 1, activeIndex: 0, bounds: {},
      tabs: [{ url: 'https://last-week.test', title: 'old', pinned: false, index: 0 }] },
  ]);

  // Today: one window, closed with the red button.
  const today = mock.openWindow({ tabs: [{ url: 'https://today.test' }] });
  await track.snapshotAll();
  mock.closeWindow(today);
  await controller.onWindowRemoved(today);

  const reopened = mock.openWindow({ tabs: [{ url: 'favorites://' }] });
  await controller.onWindowCreated(reopened);

  assert.equal(mock.windowIds().length, 1, 'last week is not thrown back on screen');
  assert.deepEqual(mock.tabUrls(reopened), ['https://today.test']);

  const left = await memory.getClosedWindows();
  assert.deepEqual(left.map((e) => e.id), ['stale'], 'the old one is still there to restore by hand');
});

test('each Safari launch starts a new session', async () => {
  await setup();
  const first = await memory.getSessionId();
  assert.equal(await memory.bumpSessionId(), first + 1);
  assert.equal(await memory.getSessionId(), first + 1);

  // The restore lock must not wipe it.
  await memory.setRestoring(true);
  await memory.setRestoring(false);
  assert.equal(await memory.getSessionId(), first + 1);
});
