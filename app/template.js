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

  const userPath = path.join(__dirname, '../config/template.js');
  if (fs.existsSync(userPath)) {
    try {
      const userConfig = require(userPath);
      if (userConfig.labels) {
        labels = deepMerge(DEFAULT_LABELS, userConfig.labels);
      }
      if (Array.isArray(userConfig.lines)) {
        lines = userConfig.lines;
      }
      logger.info('Loaded user template config from config/template.js');
    } catch (err) {
      logger.warn(`Failed to load config/template.js: ${err.message}`);
    }
  }

  return { labels, render: compileTemplate(lines) };
};

const template = loadTemplate();

module.exports = template;
