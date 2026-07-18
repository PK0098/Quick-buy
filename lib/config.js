const fs = require('node:fs');

function loadSettings(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function getProfile(settings, profileName, maxTicketsAllowed) {
  const profile = settings.profiles && settings.profiles[profileName];
  if (!profile) {
    throw new Error(`No profile named "${profileName}" in settings.json`);
  }
  if (!settings.buyer || !settings.buyer.name || !settings.buyer.phone) {
    throw new Error('settings.json buyer must include name and phone');
  }
  if (!profile.showUrl || !profile.sessionMatch) {
    throw new Error(`Profile "${profileName}" must include showUrl and sessionMatch`);
  }
  const ticketCount = profile.ticketCount || 1;
  if (typeof maxTicketsAllowed === 'number' && ticketCount > maxTicketsAllowed) {
    throw new Error(
      `Profile "${profileName}" requests ${ticketCount} tickets, ` +
        `but this show allows a maximum of ${maxTicketsAllowed}`
    );
  }
  return {
    showUrl: profile.showUrl,
    sessionMatch: profile.sessionMatch,
    targetDatetime: profile.targetDatetime || null,
    ticketCount,
    preferredSeats: profile.preferredSeats || [],
    retryWindowSeconds: profile.retryWindowSeconds || 10,
    retryIntervalMs: profile.retryIntervalMs || 250,
    buyer: settings.buyer,
  };
}

const TEST_MODE_STEP_DELAY_MS = 2000;

function getStepDelayMs(settings) {
  return settings.mode === 'test' ? TEST_MODE_STEP_DELAY_MS : 0;
}

module.exports = { loadSettings, getProfile, getStepDelayMs };
