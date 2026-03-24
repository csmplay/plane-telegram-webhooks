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

const looksLikeUrl = (value) => {
  const v = String(value || '').trim();
  if (!v) return false;

  if (/^https?:\/\//i.test(v) || /^www\./i.test(v) || /^\/\/.+/i.test(v)) return true;

  if (/(\b[a-z0-9-]+\.)+[a-z]{2,}\b/i.test(v)) return true;

  if (/\b\d{1,3}(\.\d{1,3}){3}\b/.test(v)) return true;

  return false;
};

const isLinkLine = (line) => {
  const m = String(line || '').match(/\(([^)]+)\)\s*$/);
  if (!m) return false;
  return looksLikeUrl(m[1]);
};

const fixHtmlCut = (text) => {
  let truncated = text;

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

  return truncated;
};

const truncateDescriptionByRules = (text, baseLimit = 200, overhang = 50) => {
  const input = String(text || '').trim();
  if (!input) return '';
  const maxTotal = baseLimit + overhang;

  if (input.length <= maxTotal) {
    return fixHtmlCut(input);
  }

  const lines = input.split('\n');

  let offset = 0;
  const outParts = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineStart = offset;
    const lineEnd = offset + line.length;

    if (lineEnd <= baseLimit) {
      outParts.push(line);
      offset = lineEnd + (i < lines.length - 1 ? 1 : 0);
      continue;
    }

    const remainingToLineEnd = lineEnd - baseLimit;
    const shouldIncludeWholeLine = remainingToLineEnd < overhang;

    if (shouldIncludeWholeLine) {
      outParts.push(line);
      return fixHtmlCut(outParts.join('\n'));
    }

    if (isLinkLine(line)) {
      outParts.push(line);
      return fixHtmlCut(outParts.join('\n'));
    }

    const cutPosInLine = maxTotal - lineStart;
    const safeSlice = line.slice(0, Math.max(0, cutPosInLine));
    const lastSpace = safeSlice.lastIndexOf(' ');
    const finalSlice = lastSpace > 0 ? safeSlice.slice(0, lastSpace) : safeSlice;

    outParts.push(finalSlice.trimEnd());
    return fixHtmlCut(outParts.join('\n'));
  }

  return fixHtmlCut(outParts.join('\n'));
};

const convertRichHtmlToTelegramText = (html) => {
  const allowedInlineTags = new Set(['b', 'i', 'u', 's', 'code']);

  const tokens = String(html || '')
    .replace(/&nbsp;/g, ' ');

  const tagRe = /<\/?[^>]+>/g;
  let lastIndex = 0;

  const listStack = [];
  const out = [];

  const appendText = (t) => {
    if (!t) return;
    out.push(t);
  };

  const pushNewline = () => {
    const last = out[out.length - 1];
    if (last === '\n') return;
    if (typeof last === 'string' && last.endsWith('\n')) return;
    out.push('\n');
  };

  const getListPrefix = (liTag) => {
    const isChecked = /data-checked="true"/i.test(liTag);
    const isUnchecked = /data-checked="false"/i.test(liTag);
    if (isChecked || isUnchecked) {
      const checkboxMark = isChecked ? '🔲' : '⬛️';
      const top = listStack[listStack.length - 1];
      if (top?.type === 'ol') {
        const prefix = `${top.index}. ${checkboxMark} `;
        top.index += 1;
        return prefix;
      }
      return `${checkboxMark} `;
    }

    const top = listStack[listStack.length - 1];
    if (!top) return '• ';

    if (top.type === 'ol') {
      const prefix = `${top.index}. `;
      top.index += 1;
      return prefix;
    }

    return '• ';
  };

  const normalizeInlineTag = (tag) => {
    const m = tag.match(/^<\/?\s*([a-z0-9]+)\b/i);
    if (!m) return null;
    const tagName = m[1].toLowerCase();
    if (!allowedInlineTags.has(tagName)) return null;

    const isClosing = /^<\//.test(tag);
    return isClosing ? `</${tagName}>` : `<${tagName}>`;
  };

  let m;
  while ((m = tagRe.exec(tokens)) !== null) {
    const tag = m[0];
    const textSegment = tokens.slice(lastIndex, m.index);
    if (textSegment) appendText(textSegment);
    lastIndex = tagRe.lastIndex;

    const lowerTag = tag.toLowerCase();

    if (/<br\s*\/?\s*>/i.test(tag)) {
      pushNewline();
      continue;
    }
    if (/^<p\b/i.test(lowerTag)) {
      continue;
    }
    if (/^<\/p\b/i.test(lowerTag)) {
      pushNewline();
      continue;
    }

    if (/^<ol\b/i.test(lowerTag)) {
      listStack.push({ type: 'ol', index: 1 });
      continue;
    }
    if (/^<\/ol\b/i.test(lowerTag)) {
      listStack.pop();
      continue;
    }
    if (/^<ul\b/i.test(lowerTag)) {
      listStack.push({ type: 'ul' });
      continue;
    }
    if (/^<\/ul\b/i.test(lowerTag)) {
      listStack.pop();
      continue;
    }

    if (/^<li\b/i.test(lowerTag)) {
      out.push(getListPrefix(tag));
      continue;
    }
    if (/^<\/li\b/i.test(lowerTag)) {
      pushNewline();
      continue;
    }

    const inline = normalizeInlineTag(tag);
    if (inline) {
      out.push(inline);
      continue;
    }

  }

  if (lastIndex < tokens.length) appendText(tokens.slice(lastIndex));

  return out.join('').replace(/\n{3,}/g, '\n\n').trim();
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

  safe = convertRichHtmlToTelegramText(safe);

  safe = sanitizeHtml(safe, {
    allowedTags: ['b', 'i', 'u', 's', 'code'],
    allowedAttributes: {},
    selfClosing: [],
    parser: { lowerCaseTags: true },
    textFilter: function(text) {
      return text.replace(/\n{3,}/g, '\n\n');
    }
  });

  return truncateDescriptionByRules(safe, 200, 50);
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
