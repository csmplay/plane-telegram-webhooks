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
// dmChangeTemplates (change indicators, rendered via renderChange):
//   state / stateNoOld:       {stateEmoji}, {from}, {to}
//   priority / priorityNoOld: {priorityEmoji}, {from}, {to}
//   deadline / deadlineNoOld: {dateEmoji}, {from}, {to}
//   assignees / assigneesNoOld: {assigneesEmoji}, {from}, {to}
//   notSetFallback:           value used when {to} is empty
//
// Emojis (config.labels.emojis):
//   default, completed, cancelled,
//   dateEmoji, stateEmoji, priorityEmoji,
//   labelsEmoji, assigneesEmoji, creatorEmoji

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
  '{changes}'
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
  let dmChangeTemplates = { ...DEFAULT_DM_CHANGE_TEMPLATES };
  let startMessageLines = DEFAULT_START_MESSAGE_LINES;
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
    if (userConfig.dmChangeTemplates && typeof userConfig.dmChangeTemplates === 'object') {
      dmChangeTemplates = deepMerge(dmChangeTemplates, userConfig.dmChangeTemplates);
    }
    if (Array.isArray(userConfig.startMessageLines)) {
      startMessageLines = userConfig.startMessageLines;
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
    startMessageLines,
    customConfigStatus
  };
};

const template = loadTemplate();

module.exports = template;
