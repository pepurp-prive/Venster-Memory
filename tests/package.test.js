'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const EXT = path.join(ROOT, 'extension');

const read = (relative) => fs.readFileSync(path.join(EXT, relative), 'utf8');
const manifest = JSON.parse(read('manifest.json'));

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

test('every file the manifest points at exists', () => {
  const referenced = [
    ...manifest.background.scripts,
    manifest.action.default_popup,
    manifest.options_ui.page,
    ...Object.values(manifest.action.default_icon),
    ...Object.values(manifest.icons),
  ];

  for (const relative of referenced) {
    assert.ok(fs.existsSync(path.join(EXT, relative)), `missing: ${relative}`);
  }
});

test('background scripts are listed before the files that use them', () => {
  const order = manifest.background.scripts;
  const position = (name) => order.indexOf(`lib/${name}.js`);

  assert.ok(position('api') >= 0, 'api.js must be loaded');
  for (const dependent of ['settings', 'memory', 'track', 'restore', 'controller']) {
    assert.ok(position('api') < position(dependent), `api.js must precede ${dependent}.js`);
  }
  for (const dependent of ['track', 'restore', 'controller']) {
    assert.ok(position('memory') < position(dependent), `memory.js must precede ${dependent}.js`);
  }
  for (const dependency of ['settings', 'memory', 'track', 'restore']) {
    assert.ok(position(dependency) < position('controller'), `${dependency}.js must precede controller.js`);
  }
  assert.equal(order[order.length - 1], 'background.js', 'the entry point comes last');
});

test('Safari MV3: a non-persistent background page, not a service worker', () => {
  // Safari supports background.scripts in MV3 and, unlike a service worker,
  // it can actually be inspected in the Web Inspector.
  assert.equal(manifest.manifest_version, 3);
  assert.ok(Array.isArray(manifest.background.scripts));
  assert.equal(manifest.background.persistent, false);
  assert.equal(manifest.background.service_worker, undefined);
});

test('the permissions the extension actually needs are declared', () => {
  for (const permission of ['tabs', 'storage', 'alarms']) {
    assert.ok(manifest.permissions.includes(permission), `missing permission: ${permission}`);
  }
  // Without a host permission Safari hands back tabs with no url at all.
  assert.deepEqual(manifest.host_permissions, ['*://*/*']);
});

test('every JavaScript file parses', () => {
  const files = walk(EXT).filter((file) => file.endsWith('.js'));
  assert.ok(files.length >= 8);
  for (const file of files) {
    assert.doesNotThrow(
      () => new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file }),
      `syntax error in ${path.relative(ROOT, file)}`
    );
  }
});

test('every <script src> in the UI pages resolves', () => {
  for (const file of walk(EXT).filter((f) => f.endsWith('.html'))) {
    const html = fs.readFileSync(file, 'utf8');
    for (const match of html.matchAll(/<script[^>]+src="([^"]+)"/g)) {
      const target = path.resolve(path.dirname(file), match[1]);
      assert.ok(fs.existsSync(target), `${path.relative(ROOT, file)} points at a missing ${match[1]}`);
    }
    // Manifest V3 forbids inline scripts, so there must not be any.
    assert.ok(
      !/<script(?![^>]*\ssrc=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/.test(html),
      `${path.relative(ROOT, file)} has an inline script, which MV3 blocks`
    );
  }
});

test('the Dutch and English translations line up', () => {
  const en = JSON.parse(read('_locales/en/messages.json'));
  const nl = JSON.parse(read('_locales/nl/messages.json'));

  assert.deepEqual(Object.keys(en).sort(), Object.keys(nl).sort());
  for (const [key, value] of Object.entries(en)) {
    assert.ok(value.message, `empty English message: ${key}`);
    assert.ok(nl[key].message, `empty Dutch message: ${key}`);
    assert.deepEqual(
      Object.keys(value.placeholders || {}).sort(),
      Object.keys(nl[key].placeholders || {}).sort(),
      `placeholders differ for ${key}`
    );
  }
});

test('every message key used in the UI or the manifest is translated', () => {
  const en = JSON.parse(read('_locales/en/messages.json'));

  const used = new Set();
  for (const file of walk(EXT).filter((f) => f.endsWith('.html'))) {
    const html = fs.readFileSync(file, 'utf8');
    for (const match of html.matchAll(/data-i18n="([^"]+)"/g)) used.add(match[1]);
  }
  for (const match of read('manifest.json').matchAll(/__MSG_([A-Za-z0-9_]+)__/g)) used.add(match[1]);

  assert.ok(used.size > 10, 'expected the UI to be localised');
  for (const key of used) {
    assert.ok(en[key], `no translation for "${key}"`);
  }
});
