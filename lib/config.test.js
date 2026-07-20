const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadSettings, getProfile, getStepDelayMs, getRecording, saveRecording } = require('./config');

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

test('getProfile defaults sessionTime to null and passes a set value through', () => {
  const without = getProfile(baseSettings(), 'demo');
  assert.equal(without.sessionTime, null);

  const settings = baseSettings();
  settings.profiles.demo.sessionTime = '۱۹:۰۰';
  const withTime = getProfile(settings, 'demo');
  assert.equal(withTime.sessionTime, '۱۹:۰۰');
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

test('getStepDelayMs returns 0 when testMode is false or unset', () => {
  assert.equal(getStepDelayMs({ testMode: false }), 0);
  assert.equal(getStepDelayMs({}), 0);
});

test('getStepDelayMs returns 2000 when testMode is true and no override is given', () => {
  assert.equal(getStepDelayMs({ testMode: true }), 2000);
});

test('getStepDelayMs uses testModeDelayMs when testMode is true', () => {
  assert.equal(getStepDelayMs({ testMode: true, testModeDelayMs: 500 }), 500);
});

test('getStepDelayMs ignores testModeDelayMs when testMode is false', () => {
  assert.equal(getStepDelayMs({ testMode: false, testModeDelayMs: 500 }), 0);
});

test('loadSettings reads and parses a JSON file from disk', () => {
  const tmpFile = path.join(os.tmpdir(), `tiwall-settings-test-${Date.now()}.json`);
  fs.writeFileSync(tmpFile, JSON.stringify(baseSettings()));
  const loaded = loadSettings(tmpFile);
  assert.equal(loaded.buyer.name, 'Ali Test');
  fs.unlinkSync(tmpFile);
});

test('getRecording returns a fully-populated recording with defaults applied', () => {
  const settings = {
    recordings: {
      demo: { startUrl: 'https://example.com', actions: [{ type: 'click', text: 'Buy' }] },
    },
  };
  const recording = getRecording(settings, 'demo');
  assert.equal(recording.startUrl, 'https://example.com');
  assert.equal(recording.targetDatetime, null);
  assert.equal(recording.retryWindowSeconds, 10);
  assert.equal(recording.retryIntervalMs, 250);
  assert.deepEqual(recording.actions, [{ type: 'click', text: 'Buy' }]);
});

test('getRecording throws for an unknown recording name', () => {
  const settings = { recordings: {} };
  assert.throws(() => getRecording(settings, 'nope'), /No recording named "nope"/);
});

test('getRecording throws when startUrl is missing', () => {
  const settings = { recordings: { demo: { actions: [] } } };
  assert.throws(() => getRecording(settings, 'demo'), /must include startUrl and an actions array/);
});

test('getRecording throws when actions is not an array', () => {
  const settings = { recordings: { demo: { startUrl: 'https://example.com', actions: 'nope' } } };
  assert.throws(() => getRecording(settings, 'demo'), /must include startUrl and an actions array/);
});

test('saveRecording adds a new recording without disturbing existing settings', () => {
  const settings = {
    buyer: { name: 'Ali' },
    profiles: { vanya: { showUrl: 'https://www.tiwall.com/s/uncle.vanya' } },
    recordings: { other: { startUrl: 'https://other.example.com', actions: [] } },
  };
  const updated = saveRecording(settings, 'demo', {
    startUrl: 'https://example.com',
    actions: [{ type: 'click', text: 'Buy' }],
  });
  assert.deepEqual(updated.buyer, { name: 'Ali' });
  assert.deepEqual(updated.profiles, { vanya: { showUrl: 'https://www.tiwall.com/s/uncle.vanya' } });
  assert.deepEqual(updated.recordings.other, { startUrl: 'https://other.example.com', actions: [] });
  assert.equal(updated.recordings.demo.startUrl, 'https://example.com');
  assert.equal(updated.recordings.demo.targetDatetime, null);
  assert.equal(updated.recordings.demo.retryWindowSeconds, 10);
  assert.deepEqual(updated.recordings.demo.actions, [{ type: 'click', text: 'Buy' }]);
});

test('saveRecording works when settings has no recordings key yet', () => {
  const settings = { buyer: { name: 'Ali' }, profiles: {} };
  const updated = saveRecording(settings, 'demo', {
    startUrl: 'https://example.com',
    actions: [],
  });
  assert.ok(updated.recordings.demo);
});
