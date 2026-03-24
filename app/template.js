// SPDX-FileCopyrightText: 2026 CyberSport Masters <git@csmpro.ru>
// SPDX-License-Identifier: AGPL-3.0-only

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
  '👨‍💻 Creator: <b>{creator}</b>',
];

const DEFAULT_DM_LINES = [
  '🔔 Task updated: <b>{taskName}</b>',
  '',
  '{changes}'
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
  'Status: {status}',
  'Uptime: {uptime}',
  'Pending posts: {pendingPosts}',
  'Pending deletes: {pendingDeletes}',
  'Total messages: {totalMessages}',
  'Template config: {templateConfig}',
  'Users configured: {hasUsers}',
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

const compileTemplate = (lines) => {
  return (vars) => {
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
};

const compileLinesTemplate = (lines) => {
  return (vars) => {
    return lines
      .map(line => {
        return line.replace(/\{(\w+)\}/g, (_, key) => {
          return vars[key] !== undefined ? vars[key] : '';
        });
      })
      .join('\n');
  };
};

const compileChangeTemplate = (str) => {
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
  let customConfigStatus = 'not loaded';

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
    customConfigStatus = 'loaded';
    logger.info('Loaded user template config');
  }

  const compiledChangeTemplates = {};
  for (const [key, value] of Object.entries(dmChangeTemplates)) {
    compiledChangeTemplates[key] = compileChangeTemplate(value);
  }

  return {
    labels,
    render: compileTemplate(lines),
    renderDM: compileLinesTemplate(dmLines),
    renderDMChange: (type, vars) => {
      const compiled = compiledChangeTemplates[type];
      if (!compiled) return '';
      return compiled(vars);
    },
    notSetFallback: dmChangeTemplates.notSetFallback || '',
    renderStartMessage: compileLinesTemplate(startMessageLines),
    customConfigStatus
  };
};

const template = loadTemplate();

module.exports = template;
