const path = require('node:path');
const { chromium } = require('playwright');
const { loadSettings, getProfile, getStepDelayMs } = require('./lib/config');
const { waitUntil } = require('./lib/countdown');
const { Logger } = require('./lib/logger');
const { handoffAlert } = require('./lib/alert');
const seatFlow = require('./lib/seatFlow');

function sleepMs(ms) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

async function attemptOnce(page, profile, log, stepDelayMs) {
  // "found but disabled" means the site itself hasn't flipped the session to
  // on-sale yet in whatever HTML it last rendered -- retrying clicks against
  // that same DOM can never succeed, only a fresh reload can. "not found at
  // all" more likely just means the session list is still hydrating, which a
  // quick re-check (no reload) can catch a moment later.
  const state = await seatFlow.getSessionState(page, profile.sessionMatch);
  if (!state.found) {
    log('Session not found on the page yet.');
    return { success: false, needsReload: false };
  }
  if (state.soldOut) {
    log('Session is sold out.');
    return { success: false, needsReload: false };
  }
  if (state.disabled) {
    log('Session found but not yet on sale -- reloading before the next attempt.');
    return { success: false, needsReload: true };
  }

  const sessionClicked = await seatFlow.clickSession(page, profile.sessionMatch);
  if (!sessionClicked) {
    log('Session became unclickable between the check and the click.');
    return { success: false, needsReload: false };
  }
  log('Clicked the session.');
  await sleepMs(stepDelayMs);

  const seatMapReady = await seatFlow.waitForSeatMap(page);
  if (!seatMapReady) {
    log('Seat map did not render in time.');
    return { success: false, needsReload: false };
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
    return { success: false, needsReload: false };
  }
  log(`Selected ${chosen.length} seat(s).`);
  await sleepMs(stepDelayMs);

  const reserved = await seatFlow.clickReserveAndContinue(page);
  if (!reserved) {
    log('Reserve button not available.');
    return { success: false, needsReload: false };
  }
  log('Clicked reserve.');
  await sleepMs(stepDelayMs);

  const succeeded = await seatFlow.reservationSucceeded(page);
  if (!succeeded) {
    log('Reservation did not succeed this attempt.');
    return { success: false, needsReload: false };
  }

  return { success: true, needsReload: false };
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
  const stepDelayMs = getStepDelayMs(settings);

  const logsDir = path.join(__dirname, 'logs');
  const logger = new Logger(path.join(logsDir, `${profileName}-${Date.now()}.log`));
  const log = (msg) => logger.log(msg);

  log(`Starting run for profile "${profileName}"`);
  log(`Target datetime: ${profile.targetDatetime || '(none - running immediately)'}`);
  if (stepDelayMs > 0) {
    log(`Test mode: pausing ${stepDelayMs}ms after each step so you can watch.`);
  }

  const userDataDir = path.join(__dirname, 'browser-profile');
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: null,
    args: ['--start-maximized'],
  });
  const page = context.pages()[0] || (await context.newPage());

  try {
    // The show page is heavy (images, fonts, ads, analytics). Waiting for all of
    // that ("load", Playwright's default) is what actually made the first step
    // look slow -- not clicking the session link itself. "domcontentloaded" only
    // waits for the DOM to exist, which is all clickSession needs.
    //
    // When there's a real countdown to wait out, spend part of that idle time
    // pre-loading the page now so the browser/OS/CDN connection is already warm
    // by go-time; the real navigation at T-0 reloads fresh (so it still reflects
    // the show having actually gone on sale) but lands much faster on a warm
    // connection than this first cold load did.
    if (profile.targetDatetime) {
      log('Pre-loading the show page now to warm up the connection before go-time...');
      await page
        .goto(profile.showUrl, { waitUntil: 'domcontentloaded' })
        .catch((err) => log(`Warm-up load failed, will retry at go-time: ${err.message}`));
    }

    log('Waiting until target time...');
    await waitUntil(profile.targetDatetime);
    log('Target time reached, navigating to show page.');

    await page.goto(profile.showUrl, { waitUntil: 'domcontentloaded' });

    const sessionListReady = await seatFlow.waitForSessionList(page);
    if (!sessionListReady) {
      log('Session list did not render in time -- continuing anyway, retry loop may still catch it.');
    }

    const deadline = Date.now() + profile.retryWindowSeconds * 1000;
    let success = false;
    let attemptNumber = 0;

    while (Date.now() < deadline && !success) {
      attemptNumber += 1;
      log(`Attempt #${attemptNumber}`);
      let needsReload = false;
      try {
        const result = await attemptOnce(page, profile, log, stepDelayMs);
        success = result.success;
        needsReload = result.needsReload;
      } catch (err) {
        log(`Attempt #${attemptNumber} error: ${err.message}`);
      }
      if (!success) {
        if (needsReload) {
          log('Reloading the show page to check for a fresh on-sale state...');
          await page
            .goto(profile.showUrl, { waitUntil: 'domcontentloaded' })
            .catch((err) => log(`Reload failed: ${err.message}`));
          await seatFlow.waitForSessionList(page).catch(() => {});
        } else {
          await new Promise((resolve) => setTimeout(resolve, profile.retryIntervalMs));
        }
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
    await sleepMs(stepDelayMs);

    log('Submitting to bank payment page.');
    await seatFlow.clickPayAndHandoff(page);
    await sleepMs(stepDelayMs);

    log('Choosing payment method on the bank page (card vs. wallet)...');
    const methodResult = await seatFlow.clickBankPaymentMethod(page);
    if (methodResult.clicked) {
      log(`Selected the "${methodResult.option}" payment method.`);
    } else {
      log(`Could not auto-select a payment method: ${methodResult.reason} Continue manually.`);
    }

    log('Handing off for manual card entry.');
    handoffAlert('RESERVED - complete payment manually now (15 minute window)');
  } finally {
    log('Run finished. Browser window left open for manual continuation.');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
