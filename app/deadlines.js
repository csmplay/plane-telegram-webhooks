// SPDX-FileCopyrightText: 2026 CyberSport Masters <git@csmpro.ru>
// SPDX-License-Identifier: AGPL-3.0-only

const db = require('./database');
const telegramService = require('./telegram');
const template = require('./template');
const { getTelegramUserId } = require('./users');
const { escapeHtml, formatDate } = require('./formatters');
const logger = require('./logger');

const DEFAULT_CHECK_TIME = '10:00'; // HH:MM in local timezone
const DEFAULT_NOTIFY_DAYS = [7, 2, 0];

let schedulerTimer = null;

const parseTime = (expr) => {
  const match = expr.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  return { hour, minute };
};

const nextRunTime = (time, tz, now) => {
  const { hour, minute } = time;
  const d = new Date(now);

  if (tz) {
    const nowInTz = new Date(d.toLocaleString('en-US', { timeZone: tz }));
    const offset = d.getTime() - nowInTz.getTime();
    d.setTime(d.getTime() + offset);
    d.setHours(hour, minute, 0, 0);
  } else {
    d.setHours(hour, minute, 0, 0);
  }

  if (d.getTime() <= now) {
    d.setDate(d.getDate() + 1);
  }

  return d.getTime() - now;
};

const buildIssueUrl = (taskNumber, baseUrl, workspaceSlug) => {
  if (!taskNumber || !baseUrl || !workspaceSlug) return null;
  return `${baseUrl}/${workspaceSlug}/issues/${taskNumber}`;
};

const buildApproachingMessage = (deadline, daysUntil, config) => {
  const { labels } = template;
  const taskName = escapeHtml(deadline.task_name);
  const issueUrl = buildIssueUrl(deadline.task_number, config.baseUrl, config.workspaceSlug);
  const taskHeader = issueUrl ? `<a href="${issueUrl}">${taskName}</a>` : taskName;
  const formattedDate = escapeHtml(formatDate(deadline.target_date, labels.dateFormat));

  return template.render(template.reminderApproachingLines, {
    taskHeader,
    deadline: formattedDate,
    days: String(daysUntil)
  });
};

const sendDmToAssignees = async (assigneesJson, message) => {
  let assignees;
  try {
    assignees = JSON.parse(assigneesJson || '[]');
  } catch {
    assignees = [];
  }

  if (!assignees.length || !message) return { sent: false, hasUnmapped: false };

  let sent = false;
  let hasUnmapped = false;

  for (const assignee of assignees) {
    const telegramUserId = getTelegramUserId(assignee);
    if (!telegramUserId) {
      hasUnmapped = true;
      continue;
    }

    const ok = await telegramService.sendDm({ telegramUserId, message, label: 'deadline' });
    if (ok) sent = true;
  }

  return { sent, hasUnmapped };
};

const getDaysUntil = (targetDate, tz) => {
  const target = new Date(targetDate + 'T00:00:00');
  const now = new Date();

  let today;
  if (tz) {
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: tz });
    today = new Date(todayStr + 'T00:00:00');
  } else {
    today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  return Math.round((target.getTime() - today.getTime()) / 86400000);
};

const checkDeadlines = async (config) => {
  const notifyDays = (config.notifyDays || DEFAULT_NOTIFY_DAYS).slice().sort((a, b) => b - a);
  const tz = config.tz;

  let deadlines;
  try {
    deadlines = db.getActiveDeadlines();
  } catch (error) {
    logger.error('Failed to fetch active deadlines', { error: error.message });
    return;
  }

  for (const deadline of deadlines) {
    const daysUntil = getDaysUntil(deadline.target_date, tz);
    if (daysUntil < 0) continue; // past deadline, never notify again

    const notified = new Set(
      (deadline.notified_milestones || '')
        .split(',')
        .filter(Boolean)
        .map(Number)
    );

    // Find milestones we've crossed or passed but haven't notified for
    const missed = notifyDays.filter(m => m >= daysUntil && !notified.has(m));

    if (missed.length > 0) {
      // Pick smallest missed milestone (closest to deadline, most urgent)
      const milestone = missed[missed.length - 1];
      const message = buildApproachingMessage(deadline, daysUntil, config);
      const { sent, hasUnmapped } = await sendDmToAssignees(deadline.assignees, message);
      if (sent || hasUnmapped) {
        db.markMilestoneNotified(deadline.task_number, milestone);
        logger.debug('Sent deadline reminder', {
          taskNumber: deadline.task_number,
          milestone,
          daysUntil,
          targetDate: deadline.target_date,
          sent,
          skippedUnmapped: hasUnmapped && !sent
        });
      }
    }
  }
};

const scheduleNext = (time, tz, config) => {
  const now = Date.now();
  const delay = nextRunTime(time, tz, now);

  schedulerTimer = setTimeout(() => {
    checkDeadlines(config).catch(error => {
      logger.error('Deadline check failed', { error: error.message });
    }).finally(() => {
      scheduleNext(time, tz, config);
    });
  }, delay);

  const nextRun = new Date(now + delay);
  logger.info('Next deadline check scheduled', {
    at: nextRun.toISOString()
  });
};

const start = (config) => {
  stop();

  const timeExpr = config.checkTime || DEFAULT_CHECK_TIME;
  const time = parseTime(timeExpr);

  if (!time) {
    logger.error('Invalid DEADLINE_CHECK_TIME format (use HH:MM)', { timeExpr });
    return;
  }

  const tz = config.tz;
  const notifyDays = config.notifyDays || DEFAULT_NOTIFY_DAYS;
  logger.info('Deadline reminder checker started', {
    checkTime: timeExpr,
    tz: tz || 'local',
    notifyDays: notifyDays.join(', ')
  });

  scheduleNext(time, tz, config);
};

const stop = () => {
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
  }
};

module.exports = {
  recordDeadline: (issue, taskNumber, stateGroup) => {
    if (!issue.target_date) {
      db.deleteDeadline(taskNumber);
      return;
    }

    const assignees = (issue.assignees || [])
      .filter(a => a?.id)
      .map(a => ({ id: a.id, display_name: a.display_name }));

    db.upsertDeadline(
      taskNumber,
      issue.name,
      issue.target_date,
      issue.project,
      stateGroup,
      JSON.stringify(assignees)
    );

    logger.debug('Recorded deadline', {
      taskNumber,
      targetDate: issue.target_date,
      stateGroup
    });
  },
  checkDeadlines,
  start,
  stop
};
