window.GEO = window.GEO || {};

window.GEO.ChatGPTAdapter = function() {
  window.GEO.BaseAdapter.call(this);
  this.platformId = 'chatgpt';
};

window.GEO.ChatGPTAdapter.prototype = Object.create(window.GEO.BaseAdapter.prototype);
window.GEO.ChatGPTAdapter.prototype.constructor = window.GEO.ChatGPTAdapter;

window.GEO.ChatGPTAdapter.matches = function(url) {
  return /chatgpt\.com/.test(url) || /chat\.openai\.com/.test(url);
};

/**
 * ChatGPT 搜索引用提取
 * 页面结构：
 * - 对话轮次：<section data-testid="conversation-turn-N">
 * - 用户提问：[data-message-author-role="user"]
 * - AI 回答：[data-message-author-role="assistant"]
 * - 内联引用：a[href*="utm_source=chatgpt"]（小型圆角标签，显示来源域名）
 * - 来源按钮：button[class*="footnote"]（点击展开来源面板）
 * - 来源面板：展开后显示完整引用列表，链接带 utm_source=chatgpt.com
 *   面板链接样式：hover:bg-token-surface-hover...flex-col gap-0.5 rounded-xl px-3 py-2.5
 */
window.GEO.ChatGPTAdapter.prototype.extract = function() {
  var result = window.GEO.createResult(this.platformId);

  var turns = this._getConversationTurns();

  for (var i = 0; i < turns.length; i++) {
    var turn = turns[i];
    var conv = window.GEO.createConversation(turn.query);
    conv.citations = turn.citations;
    conv.searchKeywords = [];
    conv.hasSearch = turn.hasSearch;
    result.conversations.push(conv);
  }

  return result;
};

/**
 * 获取所有对话轮次
 */
window.GEO.ChatGPTAdapter.prototype._getConversationTurns = function() {
  var turns = [];
  var sections = document.querySelectorAll('[data-testid^="conversation-turn-"]');

  var currentQuery = '';

  for (var i = 0; i < sections.length; i++) {
    var section = sections[i];
    var userMsg = section.querySelector('[data-message-author-role="user"]');
    var assistantMsg = section.querySelector('[data-message-author-role="assistant"]');

    if (userMsg) {
      currentQuery = userMsg.textContent.trim();
      // 去掉可能的前缀如 "你说：" 等
      currentQuery = currentQuery.replace(/^你说[：:]?\s*/, '');
      continue;
    }

    if (assistantMsg) {
      // 去掉可能的前缀如 "ChatGPT 说：" 等
      var citations = this._extractCitationsFromTurn(section);
      var hasSearch = citations.length > 0 || !!section.querySelector('button[class*="footnote"]');

      turns.push({
        query: currentQuery,
        citations: citations,
        hasSearch: hasSearch
      });
    }
  }

  return turns;
};

/**
 * 从对话轮次中提取引用链接
 * 策略：
 * 1. 先提取内联引用（a[href*="utm_source=chatgpt"]）
 * 2. 检查页面上所有引用链接（来源面板可能已展开）
 */
window.GEO.ChatGPTAdapter.prototype._extractCitationsFromTurn = function(section) {
  var citations = [];
  var seen = {};

  // 策略1：获取该轮次内的内联引用
  var inlineLinks = section.querySelectorAll('a[href*="utm_source=chatgpt"]');
  for (var i = 0; i < inlineLinks.length; i++) {
    var url = this._cleanUrl(inlineLinks[i].href);
    if (!url || seen[url]) continue;
    seen[url] = true;

    citations.push({
      index: citations.length + 1,
      url: url,
      title: this._extractTitle(inlineLinks[i])
    });
  }

  // 策略2：检查来源面板中的链接（不在 conversation-turn 内）
  // 只有当该轮次有 footnote 按钮时，面板链接才属于这个轮次
  var hasFootnote = !!section.querySelector('button[class*="footnote"]');
  if (hasFootnote) {
    var panelLinks = this._getPanelCitations();
    for (var j = 0; j < panelLinks.length; j++) {
      var url = this._cleanUrl(panelLinks[j].href);
      if (!url || seen[url]) continue;
      seen[url] = true;

      citations.push({
        index: citations.length + 1,
        url: url,
        title: panelLinks[j].title
      });
    }
  }

  return citations;
};

/**
 * 获取来源面板中的引用链接
 * 面板链接特征：含 utm_source=chatgpt，class 包含 flex-col gap-0.5 rounded-xl px-3 py-2.5
 */
window.GEO.ChatGPTAdapter.prototype._getPanelCitations = function() {
  var results = [];
  var allLinks = document.querySelectorAll('a[href*="utm_source=chatgpt"]');

  for (var i = 0; i < allLinks.length; i++) {
    var link = allLinks[i];
    var cls = typeof link.className === 'string' ? link.className : '';

    // 面板链接特征：flex-col 和 rounded-xl px-3 py-2.5
    if (cls.indexOf('flex-col') !== -1 && cls.indexOf('rounded-xl') !== -1 && cls.indexOf('py-2.5') !== -1) {
      results.push({
        href: link.href,
        title: this._extractTitle(link)
      });
    }
  }

  return results;
};

/**
 * 从链接元素提取标题
 * 面板链接文本格式：domain + title + date
 * 内联链接文本：仅域名（如 "知乎"）
 */
window.GEO.ChatGPTAdapter.prototype._extractTitle = function(linkEl) {
  var text = linkEl.textContent.trim();

  // 如果文本很短（内联标签），尝试从 URL 提取信息
  if (text.length <= 10) {
    return this._titleFromUrl(linkEl.href, text);
  }

  // 面板链接：去掉域名前缀（第一个非中文词通常是域名）
  // 格式类似: "zhihu.com2026年（5月）4000元...2026年5月1日"
  // 或: "知乎2026年（5月）4000元..."
  var domainMatch = text.match(/^[a-z0-9.-]+\.(com|cn|net|org|cc|ai)\b/i);
  if (domainMatch) {
    text = text.substring(domainMatch[0].length).trim();
  }

  // 去掉末尾日期（格式: 2026年N月N日 或类似）
  text = text.replace(/\d{4}年\d{1,2}月\d{1,2}日\s*[—\-]?\s*$/, '').trim();

  // 截断过长标题
  if (text.length > 150) {
    text = text.substring(0, 150) + '...';
  }

  return text || this._titleFromUrl(linkEl.href, '');
};

/**
 * 从 URL 推断标题
 */
window.GEO.ChatGPTAdapter.prototype._titleFromUrl = function(url, fallbackText) {
  try {
    var urlObj = new URL(url);
    var hostname = urlObj.hostname.replace('www.', '');
    if (fallbackText && fallbackText !== hostname) {
      return fallbackText + ' (' + hostname + ')';
    }
    return hostname;
  } catch (e) {
    return fallbackText || url;
  }
};

/**
 * 清理 URL：去掉 utm_source=chatgpt.com 参数
 */
window.GEO.ChatGPTAdapter.prototype._cleanUrl = function(url) {
  if (!url) return '';
  try {
    var urlObj = new URL(url);
    urlObj.searchParams.delete('utm_source');
    return urlObj.toString();
  } catch (e) {
    // Fallback: 简单字符串替换
    return url.replace(/[?&]utm_source=chatgpt\.com/, '');
  }
};

/**
 * 展开来源面板
 * 点击所有 footnote 按钮以展开来源列表
 */
window.GEO.ChatGPTAdapter.prototype._expandReferencePanels = function() {
  var buttons = document.querySelectorAll('button[class*="footnote"]');
  for (var i = 0; i < buttons.length; i++) {
    // 检查面板是否已展开（bar-search-sources-header 是否可见）
    var header = document.querySelector('[data-testid="bar-search-sources-header"]');
    if (!header) {
      buttons[i].click();
    }
  }
};

window.GEO.ChatGPTAdapter.prototype.isResponseComplete = function() {
  var loading = this._queryFirst([
    '[class*="streaming"]',
    '[class*="typing-indicator"]',
    '[class*="result-streaming"]',
    '[data-testid="send-button"][disabled]'
  ]);
  return !loading;
};
