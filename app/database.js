// SPDX-FileCopyrightText: 2026 CyberSport Masters <git@csmpro.ru>
// SPDX-License-Identifier: AGPL-3.0-only

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const logger = require('./logger');

const DATA_DIR = path.join(__dirname, '../data');
const DB_PATH = path.join(DATA_DIR, 'messages.db');
const JSON_PATH = path.join(DATA_DIR, 'messages.json');
const BACKUP_PATH = path.join(DATA_DIR, 'messages.backup.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(DB_PATH) && fs.existsSync(JSON_PATH)) {
  logger.info('Migrating messages.json to messages.db...');
  const messages = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      task_number TEXT PRIMARY KEY,
      message_id INTEGER NOT NULL
    )
  `);
  const stmt = db.prepare('INSERT OR REPLACE INTO messages (task_number, message_id) VALUES (?, ?)');
  let count = 0;
  for (const [taskNumber, messageId] of Object.entries(messages)) {
    stmt.run(taskNumber, messageId);
    count++;
  }
  db.close();
  logger.info(`Migrated ${count} messages.`);
  fs.renameSync(JSON_PATH, BACKUP_PATH);
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

db.exec(`
  CREATE TABLE IF NOT EXISTS event_state (
    task_number TEXT PRIMARY KEY,
    last_event_ts_ms INTEGER
  )
`);

const stmtGetEventTs = db.prepare('SELECT last_event_ts_ms FROM event_state WHERE task_number = ?');
const stmtDeleteEventTs = db.prepare('DELETE FROM event_state WHERE task_number = ?');

// Atomically update last_event_ts_ms only if the incoming timestamp is newer.
// Returns changes=1 when inserted/updated, changes=0 when blocked by the WHERE clause.
const stmtTrySetLastEventTs = db.prepare(`
  INSERT INTO event_state (task_number, last_event_ts_ms)
  VALUES (?, ?)
  ON CONFLICT(task_number) DO UPDATE SET
    last_event_ts_ms = excluded.last_event_ts_ms
  WHERE event_state.last_event_ts_ms IS NULL
     OR event_state.last_event_ts_ms <= excluded.last_event_ts_ms
`);

const stmtSetEventTs = db.prepare('INSERT OR REPLACE INTO event_state (task_number, last_event_ts_ms) VALUES (?, ?)');

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
  getLastEventTs: (taskNumber) => {
    const row = stmtGetEventTs.get(taskNumber);
    return row?.last_event_ts_ms ?? null;
  },
  trySetLastEventTs: (taskNumber, tsMs) => {
    const result = stmtTrySetLastEventTs.run(taskNumber, tsMs);
    return result.changes > 0;
  },
  migrateLastEventTs: (fromTaskNumber, toTaskNumber) => {
    const fromTs = stmtGetEventTs.get(fromTaskNumber)?.last_event_ts_ms ?? null;
    if (fromTs === null) return;

    const toTs = stmtGetEventTs.get(toTaskNumber)?.last_event_ts_ms ?? null;
    if (toTs !== null) return;

    stmtSetEventTs.run(toTaskNumber, fromTs);
    stmtDeleteEventTs.run(fromTaskNumber);
  },
  close
};
