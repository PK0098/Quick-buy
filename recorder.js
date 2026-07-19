// tiwall-autobuy/recorder.js
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');
const { loadSettings, saveRecording } = require('./lib/config');
const { prepareRecording } = require('./lib/recording');

async function main() {
  const name = process.argv[2];
  const startUrl = process.argv[3];
  if (!name || !startUrl) {
    console.error('Usage: node recorder.js <name> <startUrl>');
    process.exit(1);
  }

  const settingsPath = path.join(__dirname, 'settings.json');
  const settings = loadSettings(settingsPath);

  const userDataDir = path.join(__dirname, 'browser-profile');
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: null,
    args: ['--start-maximized'],
  });
  const page = context.pages()[0] || (await context.newPage());

  const recorder = await prepareRecording(page);

  console.log(`Navigating to ${startUrl}`);
  console.log('Click through the site manually. When you are done, click the "Done - continue" button in the corner.');

  await page.goto(startUrl, { waitUntil: 'domcontentloaded' });

  const startOrigin = new URL(startUrl).origin;
  const { actions, stoppedEarly } = await recorder.waitForDone(startOrigin);

  // Closing the browser here is the visible confirmation that clicking Done (or
  // pressing Esc) actually registered -- otherwise the page just sits there
  // unchanged and it's unclear anything happened at all.
  await context.close();

  if (stoppedEarly) {
    console.log("Recording stopped early: left the starting site's domain.");
  }

  if (actions.length === 0) {
    console.log('No actions were recorded -- nothing saved.');
    process.exitCode = 1;
    return;
  }

  const updatedSettings = saveRecording(settings, name, {
    startUrl,
    targetDatetime: null,
    actions,
  });
  fs.writeFileSync(settingsPath, JSON.stringify(updatedSettings, null, 2));

  console.log(`Recorded ${actions.length} action(s). Saved as recordings.${name} in settings.json.`);
  console.log(
    `Edit targetDatetime (and re-record if a date-specific label needs to change) before running: node replay.js ${name}`
  );
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
