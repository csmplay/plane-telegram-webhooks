// SPDX-FileCopyrightText: 2026 CyberSport Masters <git@csmpro.ru>
// SPDX-License-Identifier: AGPL-3.0-only

const fs = require('fs');
const path = require('path');

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

const loadTemplate = () => {
  const logger = require('./logger');

  let labels = DEFAULT_LABELS;
  let lines = DEFAULT_LINES;
  let customConfigStatus = 'not loaded';

  const jsonPath = path.join(__dirname, '../config/template.json');
  const jsPath = path.join(__dirname, '../config/template.js');

  let userConfig = null;
  let configSource = null;

  if (fs.existsSync(jsonPath)) {
    try {
      userConfig = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      configSource = 'config/template.json';
    } catch (err) {
      logger.warn(`Failed to load config/template.json: ${err.message}`);
    }
  } else if (fs.existsSync(jsPath)) {
    try {
      userConfig = require(jsPath);
      configSource = 'config/template.js';
      logger.warn('Using deprecated config/template.js. Trygint to migrate it to config/template.json');
      try {
        fs.writeFileSync(jsonPath, JSON.stringify(userConfig, null, 2), 'utf8');
        logger.info('Migrated config/template.js to config/template.json');
      } catch (writeErr) {
        logger.warn(`Failed to migrate config to JSON: ${writeErr.message}`);
      }
    } catch (err) {
      logger.warn(`Failed to load config/template.js: ${err.message}`);
    }
  }

  if (userConfig) {
    if (userConfig.labels) {
      labels = deepMerge(DEFAULT_LABELS, userConfig.labels);
    }
    if (Array.isArray(userConfig.lines)) {
      lines = userConfig.lines;
    }
    customConfigStatus = 'loaded';
    logger.info(`Loaded user template config from ${configSource}`);
  }

  return {
    labels,
    render: compileTemplate(lines),
    customConfigStatus
  };
};

const template = loadTemplate();

module.exports = template;
