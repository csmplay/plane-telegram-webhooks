const fs = require('fs');
const path = require('path');

const LOG_LEVELS = ['ERROR', 'WARN', 'INFO', 'DEBUG'];
const DEFAULT_LOG_LEVEL = 'INFO';
const getLogLevel = () => {
  const envLevel = process.env.LOG_LEVEL ? process.env.LOG_LEVEL.toUpperCase() : DEFAULT_LOG_LEVEL;
  return LOG_LEVELS.includes(envLevel) ? envLevel : DEFAULT_LOG_LEVEL;
};

const shouldLog = (level) => {
  return LOG_LEVELS.indexOf(level) <= LOG_LEVELS.indexOf(getLogLevel());
};

const log = (level, message, data = null) => {
  if (!shouldLog(level)) return;
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] ${level.padEnd(5)}`;
  if (data) {
    console.log(`${prefix} ${message}`, data);
  } else {
    console.log(`${prefix} ${message}`);
  }
};

const info = (message, data) => log('INFO', message, data);
const warn = (message, data) => log('WARN', message, data);
const error = (message, data) => log('ERROR', message, data);
const debug = (message, data) => log('DEBUG', message, data);

const dumpRawWebhook = (rawBody) => {
  debug('Raw webhook received', { raw: rawBody.toString() });
};

module.exports = { info, warn, error, debug, dumpRawWebhook };
