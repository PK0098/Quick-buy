function beep(times = 3) {
  for (let i = 0; i < times; i++) {
    process.stdout.write('\x07');
  }
}

function banner(message) {
  const line = '='.repeat(60);
  console.log(`\n${line}\n${message}\n${line}\n`);
}

function handoffAlert(message) {
  banner(message);
  beep(5);
}

module.exports = { beep, banner, handoffAlert };
