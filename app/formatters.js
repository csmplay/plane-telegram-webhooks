// SPDX-FileCopyrightText: 2026 CyberSport Masters <git@csmpro.ru>
// SPDX-License-Identifier: AGPL-3.0-only

const sanitizeHtml = require('sanitize-html');

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const truncateText = (text, maxLength) => {
  if (!text || text.length <= maxLength) {
    return text;
  }

  let cutoff = maxLength;

  const nextNewline = text.indexOf('\n', maxLength);
  const nextBr = text.indexOf('<br', maxLength);
  let endOfLine;
  if (nextNewline > -1 && nextBr > -1) {
    endOfLine = Math.min(nextNewline, nextBr);
  } else if (nextNewline > -1) {
    endOfLine = nextNewline;
  } else if (nextBr > -1) {
    endOfLine = nextBr;
  } else {
    endOfLine = text.length;
  }

  if (endOfLine - maxLength <= 50) {
    cutoff = endOfLine;
  } else {
    const lastSpace = text.substring(0, maxLength).lastIndexOf(' ');
    if (lastSpace !== -1) {
      cutoff = lastSpace;
    }
  }

  const partBeforeOriginalCut = text.substring(0, maxLength);
  const lastOpenParen = partBeforeOriginalCut.lastIndexOf('(');
  const lastCloseParen = partBeforeOriginalCut.lastIndexOf(')');

  if (lastOpenParen > lastCloseParen) {
    const endOfParen = text.indexOf(')', lastOpenParen);
    if (endOfParen !== -1) {
      cutoff = endOfParen + 1;
    }
  }

  let truncated = text.substring(0, cutoff);

  const lastOpeningBracket = truncated.lastIndexOf('<');
  const lastClosingBracket = truncated.lastIndexOf('>');
  if (lastOpeningBracket > lastClosingBracket) {
    truncated = truncated.substring(0, lastOpeningBracket);
  }

  const tags = ['b', 'i', 'u', 's', 'code'];
  for (const tag of tags) {
    const openTag = `<${tag}>`;
    const closeTag = `</${tag}>`;
    const openCount = (truncated.split(openTag).length - 1);
    const closeCount = (truncated.split(closeTag).length - 1);

    if (openCount > closeCount) {
      truncated += closeTag.repeat(openCount - closeCount);
    }
  }

  return truncated + (text.length > truncated.length ? '...' : '');
};

const normalizeDescription = (htmlDescription) => {
  if (!htmlDescription) return '';

  let safe = htmlDescription.replace(/<a\s[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, (match, url, text) => {
    const trimmedText = text.trim();
    if (!trimmedText) return `(${url})`;

    const cleanUrl = url.replace(/^(https?:\/\/)?(www\.)?/, '');
    const cleanText = trimmedText.replace(/^(https?:\/\/)?(www\.)?/, '');

    if (cleanUrl === cleanText) {
      return `(${url})`;
    }

    return `${trimmedText} (${url})`;
  });

  safe = safe
    .replace(/<strong(?:\s[^>]*)?>/gi, '<b>')
    .replace(/<\/strong>/gi, '</b>')
    .replace(/<em(?:\s[^>]*)?>/gi, '<i>')
    .replace(/<\/em>/gi, '</i>');

  safe = safe
    .replace(/<li[^>]*data-checked="true"[^>]*>/gi, '[x] ')
    .replace(/<li[^>]*data-checked="false"[^>]*>/gi, '[ ] ')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/?(ul|ol|div|image-component)[^>]*>/gi, '')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<\/p>/gi, '\n')
    .replace(/&nbsp;/g, ' ');

  safe = sanitizeHtml(safe, {
    allowedTags: ['b', 'i', 'u', 's', 'code'],
    allowedAttributes: {},
    selfClosing: [],
    parser: { lowerCaseTags: true },
    textFilter: function(text) {
      return text.replace(/\n{3,}/g, '\n\n');
    }
  });

  return truncateText(safe.trim(), 200);
};

const formatDate = (dateString, dateFormat = {}) => {
  if (!dateString) return null;
  const date = new Date(dateString);
  const locale = dateFormat.locale || 'en-US';
  const options = dateFormat.options || { year: 'numeric', month: 'short', day: 'numeric' };
  return date.toLocaleDateString(locale, options);
};

const translatePriority = (priority, labels = {}) => {
  return (labels.priorities || {})[priority] || '';
};

const translateState = (stateGroup, labels = {}) => {
  return (labels.states || {})[stateGroup] || '';
};

const generateTaskNumber = (projectIdentifier, sequenceId) => {
  return `${projectIdentifier || 'TASK'}-${sequenceId || '?'}`;
};

const formatArray = (arr, key) => arr?.filter(Boolean).map(item => item[key]).join(', ') || '';

module.exports = {
  escapeHtml,
  normalizeDescription,
  formatDate,
  translatePriority,
  translateState,
  generateTaskNumber,
  formatArray
};
