const { test } = require('node:test');
const assert = require('node:assert/strict');
const { msUntil, waitUntil } = require('./countdown');

test('msUntil returns 0 when targetDatetime is null', () => {
  assert.equal(msUntil(null, new Date('2026-01-01T00:00:00Z')), 0);
});

test('msUntil returns the positive difference when target is in the future', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const target = '2026-01-01T00:00:05Z';
  assert.equal(msUntil(target, now), 5000);
});

test('msUntil returns a negative number when target is in the past', () => {
  const now = new Date('2026-01-01T00:00:05Z');
  const target = '2026-01-01T00:00:00Z';
  assert.equal(msUntil(target, now), -5000);
});

test('waitUntil resolves immediately when targetDatetime is null', async () => {
  let sleepCalls = 0;
  await waitUntil(null, { sleepFn: async () => { sleepCalls += 1; }, nowFn: () => new Date() });
  assert.equal(sleepCalls, 0);
});

test('waitUntil sleeps in decreasing chunks until the fake clock reaches target', async () => {
  let fakeNow = new Date('2026-01-01T00:00:00.000Z').getTime();
  const target = '2026-01-01T00:00:00.300Z';
  const sleepDurations = [];
  const sleepFn = async (ms) => {
    sleepDurations.push(ms);
    fakeNow += ms;
  };
  const nowFn = () => new Date(fakeNow);
  await waitUntil(target, { sleepFn, nowFn });
  assert.ok(sleepDurations.length > 0);
  assert.ok(fakeNow >= new Date(target).getTime());
});
