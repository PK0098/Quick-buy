const fs = require('node:fs');
const path = require('node:path');

class Logger {
  constructor(filePath) {
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }

  log(message) {
    const line = `[${new Date().toISOString()}] ${message}\n`;
    fs.appendFileSync(this.filePath, line);
    console.log(line.trim());
  }
}

module.exports = { Logger };
