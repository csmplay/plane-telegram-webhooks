const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const logger = require('./logger');

const DATA_DIR = path.join(__dirname, '../data');
const DB_PATH = path.join(DATA_DIR, 'messages.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// better perf
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    task_number TEXT PRIMARY KEY,
    message_id INTEGER NOT NULL
  )
`);

const stmtGet = db.prepare('SELECT message_id FROM messages WHERE task_number = ?');
const stmtSet = db.prepare('INSERT OR REPLACE INTO messages (task_number, message_id) VALUES (?, ?)');
const stmtDelete = db.prepare('DELETE FROM messages WHERE task_number = ?');
const stmtCount = db.prepare('SELECT COUNT(*) AS count FROM messages');

const getMessageId = (taskNumber) => {
  const row = stmtGet.get(taskNumber);
  return row?.message_id;
};

const setMessageId = (taskNumber, messageId) => {
  stmtSet.run(taskNumber, messageId);
};

const deleteMessageId = (taskNumber) => {
  stmtDelete.run(taskNumber);
};

const getMessageCount = () => {
  return stmtCount.get().count;
};

const close = () => {
  try {
    db.close();
    logger.info('Database connection closed');
  } catch (error) {
    logger.error('Failed to close database', { error: error.message });
  }
};

module.exports = {
  getMessageId,
  setMessageId,
  deleteMessageId,
  getMessageCount,
  close
};
