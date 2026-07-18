// tiwall-autobuy/replay.js
const path = require('node:path');
const { chromium } = require('playwright');
const { loadSettings, getRecording } = require('./lib/config');
const { waitUntil } = require('./lib/countdown');
const { Logger } = require('./lib/logger');
const { handoffAlert } = require('./lib/alert');
const { runSequence } = require('./lib/replayEngine');

async function main() {
  const name = process.argv[2];
  if (!name) {
    console.error('Usage: node replay.js <recordingName>');
    process.exit(1);
  }

  const settingsPath = path.join(__dirname, 'settings.json');
  const settings = loadSettings(settingsPath);
  const recording = getRecording(settings, name);

  const logsDir = path.join(__dirname, 'logs');
  const logger = new Logger(path.join(logsDir, `replay-${name}-${Date.now()}.log`));
  const log = (msg) => logger.log(msg);

  log(`Starting replay for recording "${name}"`);
  log(`Target datetime: ${recording.targetDatetime || '(none - running immediately)'}`);

  const userDataDir = path.join(__dirname, 'browser-profile');
  const context = await chromium.launchPersistentContext(userDataDir, { headless: false });
  const page = context.pages()[0] || (await context.newPage());

  const startOrigin = new URL(recording.startUrl).origin;

  try {
    if (recording.targetDatetime) {
      log('Pre-loading the start page now to warm up the connection before go-time...');
      await page
        .goto(recording.startUrl, { waitUntil: 'domcontentloaded' })
        .catch((err) => log(`Warm-up load failed, will retry at go-time: ${err.message}`));
    }

    log('Waiting until target time...');
    await waitUntil(recording.targetDatetime);
    log('Target time reached.');

    const deadline = Date.now() + recording.retryWindowSeconds * 1000;
    let success = false;
    let attemptNumber = 0;

    while (Date.now() < deadline && !success) {
      attemptNumber += 1;
      log(`Attempt #${attemptNumber}`);
      await page.goto(recording.startUrl, { waitUntil: 'domcontentloaded' });

      const result = await runSequence(page, recording.actions, log, startOrigin);

      if (result.success) {
        success = true;
        break;
      }
      if (result.domainChanged) {
        log(`Left the recorded site's domain after step ${result.atStep + 1} -- stopping for manual continuation.`);
        handoffAlert('REACHED A DIFFERENT DOMAIN - continue manually now');
        return;
      }
      if (result.blockedAtStep !== undefined) {
        log(
          `Step ${result.blockedAtStep + 1} would have filled a payment-like field -- stopping for manual entry.`
        );
        handoffAlert('REACHED A PAYMENT-LIKE FIELD - complete manually now');
        return;
      }

      const stepDesc =
        result.action.type === 'click'
          ? `looking for "${result.action.text}"`
          : `looking for field "${result.action.label}"`;
      log(`Stuck at step ${result.stuckAtStep + 1} (${stepDesc}), reloading and retrying...`);
      await new Promise((resolve) => setTimeout(resolve, recording.retryIntervalMs));
    }

    if (!success) {
      log('Exhausted retry window without completing the recorded sequence.');
      handoffAlert('RECORDED FLOW DID NOT COMPLETE - manual intervention needed');
      process.exitCode = 1;
      return;
    }

    log('Recorded sequence completed successfully.');
    handoffAlert('RECORDED FLOW COMPLETE - continue manually from here');
  } finally {
    log('Replay finished. Browser window left open for manual continuation.');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
