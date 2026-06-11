window.GEO = window.GEO || {};

window.GEO.PerplexityAdapter = function() {
  window.GEO.BaseAdapter.call(this);
  this.platformId = 'perplexity';
};

window.GEO.PerplexityAdapter.prototype = Object.create(window.GEO.BaseAdapter.prototype);
window.GEO.PerplexityAdapter.prototype.constructor = window.GEO.PerplexityAdapter;

window.GEO.PerplexityAdapter.matches = function(url) {
  return /perplexity\.ai/.test(url);
};

/**
 * Perplexity 多轮对话提取
 * 页面结构：
 * - 用户提问：<h1> 标签（首轮），后续轮次可能在其他容器中
 * - AI 回答：.prose 容器
 * - 引用来源：span[data-pplx-citation-url] 属性存储 URL
 * - 来源标题：仅域名可见，完整标题在 hover popover 中（不预渲染）
 */
window.GEO.PerplexityAdapter.prototype.extract = function() {
  var result = window.GEO.createResult(this.platformId);

  // Perplexity 的页面结构：每轮对话有一个 query + prose 区域
  // 单轮：一个 h1 + 一个 .prose
  // 多轮：多个 query 块 + 多个 .prose 块

  var conversations = [];

  // 策略1：尝试找到多轮对话结构
  // Perplexity 多轮在 thread 容器中，每轮有自己的 query 和 answer
  var turns = this._findConversationTurns();

  if (turns.length > 0) {
    for (var i = 0; i < turns.length; i++) {
      var turn = turns[i];
      var conv = window.GEO.createConversation(turn.query);
      conv.citations = turn.citations;
      conv.searchKeywords = turn.keywords;
      conv.hasSearch = turn.citations.length > 0;
      if (conv.hasSearch) {
        conversations.push(conv);
      }
    }
  } else {
    // 策略2：单轮提取（fallback）
    var query = this._extractQuery();
    var citations = this._extractAllCitations(document);
    var conv = window.GEO.createConversation(query);
    conv.citations = citations;
    conv.hasSearch = citations.length > 0;
    if (conv.hasSearch) {
      conversations.push(conv);
    }
  }

  result.conversations = conversations;
  return result;
};

/**
 * 查找多轮对话结构
 * Perplexity 的多轮对话页面中，每一轮包含：
 * - 一个 query 文本（h1 或其他 heading/text block）
 * - 一个 .prose 回答区域（内含 citation spans）
 */
window.GEO.PerplexityAdapter.prototype._findConversationTurns = function() {
  var turns = [];
  var proses = document.querySelectorAll('.prose');

  if (proses.length === 0) return turns;

  // 对于每个 .prose 区域，往上找对应的 query
  for (var i = 0; i < proses.length; i++) {
    var proseEl = proses[i];
    var query = this._findQueryForProse(proseEl, i);
    var citations = this._extractCitationsFromContainer(proseEl);

    turns.push({
      query: query,
      citations: citations,
      keywords: [] // Perplexity 不单独展示搜索关键词
    });
  }

  return turns;
};

/**
 * 为指定的 .prose 区域找到对应的用户提问
 */
window.GEO.PerplexityAdapter.prototype._findQueryForProse = function(proseEl, index) {
  // 首轮：页面上的 h1
  if (index === 0) {
    var h1 = document.querySelector('h1');
    if (h1) return h1.textContent.trim();
  }

  // 多轮：向上或向前遍历兄弟节点找 query 文本
  var container = proseEl.parentElement;
  while (container && container !== document.body) {
    // 查找同级的前序兄弟中的 query 文本
    var prev = container.previousElementSibling;
    while (prev) {
      // 检查是否包含用户提问文本（通常在 heading 或特定容器中）
      var heading = prev.querySelector('h1, h2, [class*="query"]');
      if (heading) {
        var text = heading.textContent.trim();
        if (text.length > 1 && text.length < 500) return text;
      }
      // 也可能直接是文本块
      var directText = prev.textContent.trim();
      if (directText.length > 1 && directText.length < 300 && !prev.querySelector('.prose')) {
        return directText;
      }
      prev = prev.previousElementSibling;
    }
    container = container.parentElement;
  }

  return '';
};

/**
 * 从指定容器（或其祖先范围）提取引用链接
 * Perplexity 使用 data-pplx-citation-url 属性
 */
window.GEO.PerplexityAdapter.prototype._extractCitationsFromContainer = function(container) {
  var citations = [];

  // 在 prose 区域及其父容器中查找引用
  var searchScope = container;
  // 扩大搜索范围到父容器（引用可能在 prose 同级区域）
  var parent = container.parentElement;
  if (parent) {
    searchScope = parent;
  }

  var citeEls = searchScope.querySelectorAll('[data-pplx-citation-url]');

  // 如果在父容器中没找到，在整个文档中找（单轮页面）
  if (citeEls.length === 0) {
    citeEls = document.querySelectorAll('[data-pplx-citation-url]');
  }

  var seen = {};
  for (var i = 0; i < citeEls.length; i++) {
    var url = citeEls[i].getAttribute('data-pplx-citation-url');
    if (!url || seen[url]) continue;
    seen[url] = true;

    var title = this._getTitleForUrl(url, citeEls[i]);

    citations.push({
      index: citations.length + 1,
      url: url,
      title: title
    });
  }

  return citations;
};

/**
 * 尝试获取引用的标题
 * 优先从页面中的 <a> 链接文本获取，否则用域名
 */
window.GEO.PerplexityAdapter.prototype._getTitleForUrl = function(url, citeEl) {
  // 策略1：查找页面中指向同一 URL 的 <a> 标签的文本
  var links = document.querySelectorAll('a[href="' + url + '"]');
  for (var i = 0; i < links.length; i++) {
    var text = links[i].textContent.trim();
    // 过滤掉纯数字和太短的文本
    if (text.length > 3 && !/^\d+$/.test(text)) {
      return text;
    }
  }

  // 策略2：检查 citation 元素内部的文本
  var innerText = citeEl.textContent.trim();
  if (innerText.length > 3 && !/^\d+$/.test(innerText)) {
    return innerText;
  }

  // 策略3：从 URL 路径推断标题
  try {
    var urlObj = new URL(url);
    var path = decodeURIComponent(urlObj.pathname);
    // 取最后一段路径作为标题线索
    var segments = path.split('/').filter(function(s) { return s.length > 0; });
    if (segments.length > 0) {
      var last = segments[segments.length - 1];
      // 去掉文件扩展名
      last = last.replace(/\.\w+$/, '').replace(/[-_]/g, ' ');
      if (last.length > 3) {
        return urlObj.hostname.replace('www.', '') + ' - ' + last;
      }
    }
    return urlObj.hostname.replace('www.', '');
  } catch (e) {
    return url;
  }
};

/**
 * Fallback：提取页面上所有引用
 */
window.GEO.PerplexityAdapter.prototype._extractAllCitations = function(doc) {
  return this._extractCitationsFromContainer(doc.body || doc.documentElement);
};

/**
 * 提取用户提问（单轮 fallback）
 */
window.GEO.PerplexityAdapter.prototype._extractQuery = function() {
  var h1 = document.querySelector('h1');
  if (h1) return h1.textContent.trim();

  var queryEl = document.querySelector('[class*="query"]');
  if (queryEl) return queryEl.textContent.trim();

  return '';
};

window.GEO.PerplexityAdapter.prototype.isResponseComplete = function() {
  var loading = this._queryFirst([
    '[class*="animate-pulse"]',
    '[class*="loading"]',
    '[class*="streaming"]',
    '[class*="cursor-blink"]'
  ]);
  return !loading;
};
