const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Logger } = require('./logger');

test('Logger creates its parent directory and appends timestamped lines', () => {
  const dir = path.join(os.tmpdir(), `tiwall-log-test-${Date.now()}`);
  const filePath = path.join(dir, 'run.log');
  const logger = new Logger(filePath);

  logger.log('first message');
  logger.log('second message');

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.trim().split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^\[\d{4}-\d{2}-\d{2}T.*Z\] first message$/);
  assert.match(lines[1], /^\[\d{4}-\d{2}-\d{2}T.*Z\] second message$/);

  fs.rmSync(dir, { recursive: true, force: true });
});
