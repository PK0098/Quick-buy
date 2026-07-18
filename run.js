const path = require('node:path');
const { chromium } = require('playwright');
const { loadSettings, getProfile } = require('./lib/config');
const { waitUntil } = require('./lib/countdown');
const { Logger } = require('./lib/logger');
const { handoffAlert } = require('./lib/alert');
const seatFlow = require('./lib/seatFlow');

async function attemptOnce(page, profile, log) {
  const sessionClicked = await seatFlow.clickSession(page, profile.sessionMatch);
  if (!sessionClicked) {
    log('Session not yet clickable or not found.');
    return false;
  }

  const seatMapReady = await seatFlow.waitForSeatMap(page);
  if (!seatMapReady) {
    log('Seat map did not render in time.');
    return false;
  }

  const maxTickets = await seatFlow.getShowMaxTickets(page);
  if (maxTickets !== null && profile.ticketCount > maxTickets) {
    throw new Error(
      `Show page states a max of ${maxTickets} tickets, but profile requests ${profile.ticketCount}`
    );
  }

  const chosen = await seatFlow.selectSeats(page, profile.preferredSeats, profile.ticketCount);
  if (chosen.length < profile.ticketCount) {
    log(`Only found ${chosen.length}/${profile.ticketCount} free seats this attempt.`);
    return false;
  }

  const reserved = await seatFlow.clickReserveAndContinue(page);
  if (!reserved) {
    log('Reserve button not available.');
    return false;
  }

  const succeeded = await seatFlow.reservationSucceeded(page);
  if (!succeeded) {
    log('Reservation did not succeed this attempt.');
    return false;
  }

  return true;
}

async function main() {
  const profileName = process.argv[2];
  if (!profileName) {
    console.error('Usage: node run.js <profileName>');
    process.exit(1);
  }

  const settingsPath = path.join(__dirname, 'settings.json');
  const settings = loadSettings(settingsPath);
  const profile = getProfile(settings, profileName);

  const logsDir = path.join(__dirname, 'logs');
  const logger = new Logger(path.join(logsDir, `${profileName}-${Date.now()}.log`));
  const log = (msg) => logger.log(msg);

  log(`Starting run for profile "${profileName}"`);
  log(`Target datetime: ${profile.targetDatetime || '(none - running immediately)'}`);

  const userDataDir = path.join(__dirname, 'browser-profile');
  const context = await chromium.launchPersistentContext(userDataDir, { headless: false });
  const page = context.pages()[0] || (await context.newPage());

  try {
    log('Waiting until target time...');
    await waitUntil(profile.targetDatetime);
    log('Target time reached, navigating to show page.');

    await page.goto(profile.showUrl);

    const deadline = Date.now() + profile.retryWindowSeconds * 1000;
    let success = false;
    let attemptNumber = 0;

    while (Date.now() < deadline && !success) {
      attemptNumber += 1;
      log(`Attempt #${attemptNumber}`);
      try {
        success = await attemptOnce(page, profile, log);
      } catch (err) {
        log(`Attempt #${attemptNumber} error: ${err.message}`);
      }
      if (!success) {
        await new Promise((resolve) => setTimeout(resolve, profile.retryIntervalMs));
      }
    }

    if (!success) {
      log('Exhausted retry window without a successful reservation.');
      handoffAlert('NO SEATS RESERVED - manual intervention needed');
      process.exitCode = 1;
      return;
    }

    log('Reservation succeeded. Filling buyer form.');
    await seatFlow.fillBuyerForm(page, profile.buyer);

    log('Submitting to bank payment page.');
    await seatFlow.clickPayAndHandoff(page);

    log('Reached bank payment redirect. Handing off for manual card entry.');
    handoffAlert('RESERVED - complete payment manually now (15 minute window)');
  } finally {
    log('Run finished. Browser window left open for manual continuation.');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
