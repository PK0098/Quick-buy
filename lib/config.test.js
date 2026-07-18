const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadSettings, getProfile, getStepDelayMs } = require('./config');

function baseSettings() {
  return {
    buyer: { name: 'Ali Test', phone: '0912', email: 'a@b.com' },
    profiles: {
      demo: {
        showUrl: 'https://www.tiwall.com/s/demo',
        sessionMatch: 'یکشنبه',
        targetDatetime: null,
        ticketCount: 2,
        preferredSeats: [{ row: 1, seat: 1 }],
      },
    },
  };
}

test('getProfile returns a fully-populated profile with defaults applied', () => {
  const profile = getProfile(baseSettings(), 'demo');
  assert.equal(profile.showUrl, 'https://www.tiwall.com/s/demo');
  assert.equal(profile.ticketCount, 2);
  assert.equal(profile.retryWindowSeconds, 10);
  assert.equal(profile.retryIntervalMs, 250);
  assert.deepEqual(profile.buyer, baseSettings().buyer);
});

test('getProfile throws for an unknown profile name', () => {
  assert.throws(() => getProfile(baseSettings(), 'nope'), /No profile named "nope"/);
});

test('getProfile throws when buyer name is missing', () => {
  const settings = baseSettings();
  delete settings.buyer.name;
  assert.throws(() => getProfile(settings, 'demo'), /buyer must include name and phone/);
});

test('getProfile throws when profile is missing showUrl', () => {
  const settings = baseSettings();
  delete settings.profiles.demo.showUrl;
  assert.throws(() => getProfile(settings, 'demo'), /must include showUrl and sessionMatch/);
});

test('getProfile enforces the show maximum ticket cap when provided', () => {
  const settings = baseSettings();
  settings.profiles.demo.ticketCount = 5;
  assert.throws(
    () => getProfile(settings, 'demo', 3),
    /requests 5 tickets, but this show allows a maximum of 3/
  );
});

test('getProfile allows ticketCount at or under the cap', () => {
  const settings = baseSettings();
  settings.profiles.demo.ticketCount = 3;
  const profile = getProfile(settings, 'demo', 3);
  assert.equal(profile.ticketCount, 3);
});

test('getStepDelayMs returns 0 when mode is "main" or unset', () => {
  assert.equal(getStepDelayMs({ mode: 'main' }), 0);
  assert.equal(getStepDelayMs({}), 0);
});

test('getStepDelayMs returns 2000 when mode is "test"', () => {
  assert.equal(getStepDelayMs({ mode: 'test' }), 2000);
});

test('loadSettings reads and parses a JSON file from disk', () => {
  const tmpFile = path.join(os.tmpdir(), `tiwall-settings-test-${Date.now()}.json`);
  fs.writeFileSync(tmpFile, JSON.stringify(baseSettings()));
  const loaded = loadSettings(tmpFile);
  assert.equal(loaded.buyer.name, 'Ali Test');
  fs.unlinkSync(tmpFile);
});
