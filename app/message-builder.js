const path = require('path');
const template = require('./template');
const {
  escapeHtml,
  formatDate,
  formatArray,
  translatePriority,
  translateState,
  generateTaskNumber
} = require('./formatters');

const getTelegramUserId = (planeDisplayName) => {
  try {
    const userMap = require(path.join(__dirname, '../config/users.json'));
    return userMap[planeDisplayName] || null;
  } catch {
    return null;
  }
};

const formatUserMention = (displayName) => {
  const tgId = getTelegramUserId(displayName);
  const escaped = escapeHtml(displayName);
  return tgId ? `<a href="tg://user?id=${tgId}">${escaped}</a>` : escaped;
};

const buildMessage = ({ issue, activity, projectIdentifier, baseUrl, workspaceSlug }) => {
  const { labels } = template;

  const stateGroup = issue.state?.group || 'backlog';
  const stateEmoji = labels.stateEmojis[stateGroup] || labels.stateEmojis.default;

  const taskNumber = generateTaskNumber(projectIdentifier, issue.sequence_id);
  const taskName = escapeHtml(issue.name);
  let header;

  if (issue.sequence_id && workspaceSlug && projectIdentifier) {
    const issueUrl = `${baseUrl}/${workspaceSlug}/browse/${projectIdentifier}-${issue.sequence_id}`;
    header = labels.header.withLink
      .replace('{issueUrl}', issueUrl)
      .replace('{stateEmoji}', stateEmoji)
      .replace('{taskName}', taskName)
      .replace('{taskNumber}', taskNumber);
  } else {
    header = labels.header.withoutLink
      .replace('{stateEmoji}', stateEmoji)
      .replace('{taskName}', taskName)
      .replace('{taskNumber}', taskNumber);
  }

  const start = formatDate(issue.start_date, labels.dateFormat);
  const end = formatDate(issue.target_date, labels.dateFormat);

  let dateLabel = '';
  let date = '';
  if (start && end) {
    dateLabel = labels.dateLabels.range || 'Range';
    date = labels.deadline.range
      .replace('{start}', escapeHtml(start))
      .replace('{end}', escapeHtml(end));
  } else if (end) {
    dateLabel = labels.dateLabels.target || labels.dateLabels.deadline;
    date = labels.deadline.target
      .replace('{end}', escapeHtml(end));
  } else if (start) {
    dateLabel = labels.dateLabels.start;
    date = labels.deadline.start
      .replace('{start}', escapeHtml(start));
  }

  const assignees = issue.assignees?.length
    ? issue.assignees.map(a => formatUserMention(a.display_name)).join(', ')
    : '';

  const creator = activity.originalCreator
    ? escapeHtml(activity.originalCreator)
    : '';

  return template.render({
    header,
    description: issue.description || labels.noDescription,
    dateLabel,
    date,
    state: translateState(stateGroup, labels),
    priority: translatePriority(issue.priority, labels),
    labels: escapeHtml(formatArray(issue.labels, 'name')),
    assignees,
    creator
  });
};

module.exports = { buildMessage };
