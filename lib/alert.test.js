const { test } = require('node:test');
const assert = require('node:assert/strict');
const { banner, beep, handoffAlert } = require('./alert');

test('banner logs the message wrapped in separator lines', () => {
  const originalLog = console.log;
  const calls = [];
  console.log = (msg) => calls.push(msg);
  try {
    banner('PAY NOW');
  } finally {
    console.log = originalLog;
  }
  assert.ok(calls.some((c) => c.includes('PAY NOW')));
  assert.ok(calls.some((c) => c.includes('====')));
});

test('beep writes the bell character to stdout the requested number of times', () => {
  const originalWrite = process.stdout.write;
  let writeCount = 0;
  process.stdout.write = (chunk) => {
    if (chunk === '\x07') writeCount += 1;
    return true;
  };
  try {
    beep(3);
  } finally {
    process.stdout.write = originalWrite;
  }
  assert.equal(writeCount, 3);
});

test('handoffAlert calls both banner and beep without throwing', () => {
  const originalLog = console.log;
  const originalWrite = process.stdout.write;
  console.log = () => {};
  process.stdout.write = () => true;
  try {
    assert.doesNotThrow(() => handoffAlert('done'));
  } finally {
    console.log = originalLog;
    process.stdout.write = originalWrite;
  }
});
