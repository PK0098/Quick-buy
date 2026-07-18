function msUntil(targetDatetime, now = new Date()) {
  if (!targetDatetime) return 0;
  const target = new Date(targetDatetime);
  return target.getTime() - now.getTime();
}

function realSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil(targetDatetime, { sleepFn = realSleep, nowFn = () => new Date() } = {}) {
  if (!targetDatetime) return;
  let remaining = msUntil(targetDatetime, nowFn());
  while (remaining > 0) {
    let chunk;
    if (remaining > 5000) {
      chunk = Math.min(remaining - 1000, 30000);
    } else {
      chunk = Math.min(remaining, 100);
    }
    await sleepFn(Math.max(chunk, 10));
    remaining = msUntil(targetDatetime, nowFn());
  }
}

module.exports = { msUntil, waitUntil };
