// SPDX-FileCopyrightText: 2026 CyberSport Masters <git@csmpro.ru>
// SPDX-License-Identifier: AGPL-3.0-only

// Available templates (all use {key} placeholders, emojis auto-injected from config):
//
// lines (channel notification):
//   {header}            - task header with link (built by message-builder)
//   {description}       - task description (HTML)
//   {dateLabel}         - Deadline / Startline / Range
//   {date}              - formatted date string
//   {state}             - translated state name
//   {priority}          - translated priority name
//   {labels}            - comma-separated label names
//   {assignees}         - comma-separated user mentions
//   {creator}           - creator display name
//
// dmLines (DM notification):
//   {stateEmoji}        - emoji for current state
//   {header}            - task name with link
//   {changes}           - pre-rendered change lines
//
// dmCommentLines (comment DM notification):
//   {commentAuthor}     - author display name
//   {commentText}       - comment text (truncated)
//   {taskHeader}        - task name with link
//
// dmChangeTemplates (change indicators, rendered via renderChange):
//   state / stateNoOld:       {from}, {to}
//   priority / priorityNoOld: {from}, {to}
//   deadline / deadlineNoOld: {from}, {to}
//   assignees / assigneesNoOld: {from}, {to}
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
// reminderApproachingLines (deadline reminder DM):
//   {days}            - real days remaining until deadline
//   {taskHeader}      - task name with link
//   {deadline}        - formatted deadline date

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
  stateEmojis: {
    default: '📝',
    completed: '✅',
    cancelled: '❌',
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
  '📆 {dateLabel}: <b>{date}</b>',
  '📊 Status: <b>{state}</b>',
  '⚡ Priority: <b>{priority}</b>',
  '🏷️ Labels: <b>{labels}</b>',
  '👤 Assignees: <b>{assignees}</b>',
  '✏️ Creator: <b>{creator}</b>',
];

const DEFAULT_DM_LINES = [
  '🛎 Task updated: <b>{header}</b>',
  '',
  '{changes}',
];

const DEFAULT_DM_COMMENT_LINES = [
  '💬 New comment by {commentAuthor}',
  'in <b>{taskHeader}</b>',
  '',
  '{commentText}',
  ''
];

const DEFAULT_DM_CHANGE_TEMPLATES = {
  state: '📊 Status: <b>{from}</b> → <b>{to}</b>',
  stateNoOld: '📊 Status: <b>{to}</b>',
  priority: '⚡ Priority: <b>{from}</b> → <b>{to}</b>',
  priorityNoOld: '⚡ Priority: <b>{to}</b>',
  deadline: '📆 Deadline: <b>{from}</b> → <b>{to}</b>',
  deadlineNoOld: '📆 Deadline: <b>{to}</b>',
  assignees: '👤 Assignees: <b>{from}</b> → <b>{to}</b>',
  assigneesNoOld: '👤 Assignees: <b>{to}</b>',
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

const DEFAULT_REMINDER_APPROACHING_LINES = [
  '⏰ Deadline in {days} day(s)!',
  '',
  'Task: <b>{taskHeader}</b>',
  'Due: <b>{deadline}</b>',
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
  let reminderApproachingLines = DEFAULT_REMINDER_APPROACHING_LINES;
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
    if (Array.isArray(userConfig.reminderApproachingLines)) {
      reminderApproachingLines = userConfig.reminderApproachingLines;
    }
    customConfigStatus = true;
    logger.info('Loaded user template config');
  }

  const compiledChangeTemplates = {};
  for (const [key, value] of Object.entries(dmChangeTemplates)) {
    compiledChangeTemplates[key] = compileChange(value);
  }

  const notSetFallback = dmChangeTemplates.notSetFallback || '';

  const renderChange = (type, vars) => {
    const compiled = compiledChangeTemplates[type];
    if (!compiled) return '';
    return compiled(vars);
  };

  return {
    render,
    renderChange,
    notSetFallback,
    labels,
    lines,
    dmLines,
    dmCommentLines,
    startMessageLines,
    startLines,
    reminderApproachingLines,
    customConfigStatus
  };
};

const template = loadTemplate();

module.exports = template;
