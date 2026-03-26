// SPDX-FileCopyrightText: 2026 CyberSport Masters <git@csmpro.ru>
// SPDX-License-Identifier: AGPL-3.0-only

// Available templates (all use {key} placeholders, emojis auto-injected from config):
//
// lines (channel notification):
//   {header}            - task header with link (built by message-builder)
//   {description}       - task description (HTML)
//   {dateEmoji}         - 📆 (configurable)
//   {dateLabel}         - Deadline / Startline / Range
//   {date}              - formatted date string
//   {stateEmoji}        - 📊 (configurable)
//   {state}             - translated state name
//   {priorityEmoji}     - ⚡ (configurable)
//   {priority}          - translated priority name
//   {labelsEmoji}       - 🏷️ (configurable)
//   {labels}            - comma-separated label names
//   {assigneesEmoji}    - 👤 (configurable)
//   {assignees}         - comma-separated user mentions
//   {creatorEmoji}      - 👨‍💻 (configurable)
//   {creator}           - creator display name
//
// dmLines (DM notification):
//   {stateEmoji}        - 📊 (configurable)
//   {header}            - task name with link
//   {changes}           - pre-rendered change lines
//
// dmCommentLines (comment DM notification):
//   {commentEmoji}      - 💬 (configurable)
//   {commentAuthor}     - author display name
//   {commentText}       - comment text (truncated)
//   {taskHeader}        - task name with link
//
// dmChangeTemplates (change indicators, rendered via renderChange):
//   state / stateNoOld:       {stateEmoji}, {from}, {to}
//   priority / priorityNoOld: {priorityEmoji}, {from}, {to}
//   deadline / deadlineNoOld: {dateEmoji}, {from}, {to}
//   assignees / assigneesNoOld: {assigneesEmoji}, {from}, {to}
//   notSetFallback:           value used when {to} is empty
//
// startMessageLines (health/start message):
//   {version}           - app version
//   {status}            - ok / error
//   {uptime}            - formatted uptime
//   {pendingPosts}      - count
//   {pendingDeletes}    - count
//   {totalMessages}     - count
//   {templateLoaded}    - true / false
//   {users}             - user count
//   {lastUpdate}        - formatted timestamp
//
// startLines (start command):
//   (no placeholders)
//
// Emojis (config.labels.emojis):
//   default, completed, cancelled,
//   dateEmoji, stateEmoji, priorityEmoji,
//   labelsEmoji, assigneesEmoji, creatorEmoji, commentEmoji

const { loadConfig } = require('./config');

const DEFAULT_LABELS = {
  priorities: {
    urgent: 'URGENT',
    high: 'HIGH',
    medium: 'MEDIUM',
    low: 'LOW',
  },
  states: {
    backlog: 'BACKLOG',
    unstarted: 'PLANNED',
    started: 'IN PROGRESS',
    completed: 'DONE',
    cancelled: 'CANCELLED',
  },
  emojis: {
    default: '📝',
    completed: '✅',
    cancelled: '❌',
    dateEmoji: '📆',
    stateEmoji: '📊',
    priorityEmoji: '⚡',
    labelsEmoji: '🏷️',
    assigneesEmoji: '👤',
    creatorEmoji: '👨‍💻',
    commentEmoji: '💬',
  },
  header: {
    withLink: '<b><a href="{issueUrl}">{stateEmoji} {taskName}</a></b>',
    withoutLink: '<b>{stateEmoji} {taskName}</b>',
  },
  dateFormat: {
    locale: 'en-US',
    options: { year: 'numeric', month: '2-digit', day: '2-digit' },
  },
  timeFormat: {
    locale: 'en-US',
    options: { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' },
  },
  deadline: {
    range: '{start} – {end}',
    target: '{end}',
    start: '{start}',
  },
  noDescription: '',
  dateLabels: {
    range: 'Deadline',
    target: 'Deadline',
    start: 'Startline',
  },
};

const DEFAULT_LINES = [
  '{header}',
  '',
  '{description}',
  '',
  '{dateEmoji} {dateLabel}: <b>{date}</b>',
  '{stateEmoji} Status: <b>{state}</b>',
  '{priorityEmoji} Priority: <b>{priority}</b>',
  '{labelsEmoji} Labels: <b>{labels}</b>',
  '{assigneesEmoji} Assignees: <b>{assignees}</b>',
  '{creatorEmoji} Creator: <b>{creator}</b>',
];

const DEFAULT_DM_LINES = [
  '{stateEmoji} Task updated: <b>{header}</b>',
  '',
  '{changes}',
];

const DEFAULT_DM_COMMENT_LINES = [
  '{commentEmoji} New comment by {commentAuthor}',
  'in <b>{taskHeader}</b>',
  '',
  '{commentText}',
  ''
];

const DEFAULT_DM_CHANGE_TEMPLATES = {
  state: '{stateEmoji} Status: <b>{from}</b> → <b>{to}</b>',
  stateNoOld: '{stateEmoji} Status: <b>{to}</b>',
  priority: '{priorityEmoji} Priority: <b>{from}</b> → <b>{to}</b>',
  priorityNoOld: '{priorityEmoji} Priority: <b>{to}</b>',
  deadline: '{dateEmoji} Deadline: <b>{from}</b> → <b>{to}</b>',
  deadlineNoOld: '{dateEmoji} Deadline: <b>{to}</b>',
  assignees: '{assigneesEmoji} Assignees: <b>{from}</b> → <b>{to}</b>',
  assigneesNoOld: '{assigneesEmoji} Assignees: <b>{to}</b>',
  notSetFallback: 'not set',
};

const DEFAULT_START_MESSAGE_LINES = [
  'Plane Telegram Webhooks Bot v{version}',
  'Status: {status}',
  'Uptime: {uptime}',
  'Pending posts: {pendingPosts}',
  'Pending deletes: {pendingDeletes}',
  'Total messages: {totalMessages}',
  'Template loaded: {templateLoaded}',
  'Users: {users}',
  '',
  'Last update: {lastUpdate}',
];

const DEFAULT_START_LINES = [
  'Plane Telegram Webhooks Bot',
  '',
  'Ready to notify about your Plane issues.',
];

const deepMerge = (target, source) => {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) &&
      target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
};

const render = (lines, vars) => {
  return lines
    .filter(line => {
      const placeholders = line.match(/\{(\w+)\}/g);
      if (!placeholders) return true;
      return placeholders.every(p => {
        const key = p.slice(1, -1);
        return vars[key] !== undefined && vars[key] !== '';
      });
    })
    .map(line => {
      return line.replace(/\{(\w+)\}/g, (_, key) => {
        return vars[key] !== undefined ? vars[key] : '';
      });
    })
    .filter((line, i, arr) => {
      if (line.trim() === '') {
        return i > 0 && arr[i - 1]?.trim() !== '';
      }
      return true;
    })
    .join('\n');
};

const compileChange = (str) => {
  return (vars) => {
    return str.replace(/\{(\w+)\}/g, (_, key) => {
      return vars[key] !== undefined ? vars[key] : '';
    });
  };
};

const loadTemplate = () => {
  const logger = require('./logger');

  let labels = DEFAULT_LABELS;
  let lines = DEFAULT_LINES;
  let dmLines = DEFAULT_DM_LINES;
  let dmCommentLines = DEFAULT_DM_COMMENT_LINES;
  let dmChangeTemplates = { ...DEFAULT_DM_CHANGE_TEMPLATES };
  let startMessageLines = DEFAULT_START_MESSAGE_LINES;
  let startLines = DEFAULT_START_LINES;
  let customConfigStatus = false;

  let userConfig = null;

  userConfig = loadConfig('template');

  if (userConfig) {
    if (userConfig.labels) {
      labels = deepMerge(DEFAULT_LABELS, userConfig.labels);
    }
    if (Array.isArray(userConfig.lines)) {
      lines = userConfig.lines;
    }
    if (Array.isArray(userConfig.dmLines)) {
      dmLines = userConfig.dmLines;
    }
    if (Array.isArray(userConfig.dmCommentLines)) {
      dmCommentLines = userConfig.dmCommentLines;
    }
    if (userConfig.dmChangeTemplates && typeof userConfig.dmChangeTemplates === 'object') {
      dmChangeTemplates = deepMerge(dmChangeTemplates, userConfig.dmChangeTemplates);
    }
    if (Array.isArray(userConfig.startMessageLines)) {
      startMessageLines = userConfig.startMessageLines;
    }
    if (Array.isArray(userConfig.startLines)) {
      startLines = userConfig.startLines;
    }
    customConfigStatus = true;
    logger.info('Loaded user template config');
  }

  const compiledChangeTemplates = {};
  for (const [key, value] of Object.entries(dmChangeTemplates)) {
    compiledChangeTemplates[key] = compileChange(value);
  }

  const emojis = labels.emojis;
  const notSetFallback = dmChangeTemplates.notSetFallback || '';

  const renderWithEmojis = (lines, vars) => render(lines, { ...emojis, ...vars });

  const renderChange = (type, vars) => {
    const compiled = compiledChangeTemplates[type];
    if (!compiled) return '';
    return compiled({ ...emojis, ...vars });
  };

  return {
    render: renderWithEmojis,
    renderChange,
    emojis,
    notSetFallback,
    labels,
    lines,
    dmLines,
    dmCommentLines,
    startMessageLines,
    startLines,
    customConfigStatus
  };
};

const template = loadTemplate();

module.exports = template;
