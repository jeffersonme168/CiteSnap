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
 * Perplexity 页面结构：
 * - 多轮对话的 turn 容器是 flex flex-col 父元素的直接子 div
 * - 每个 turn 容器内有一个 .prose（回答）和 query 文本
 * - 第一轮 query 在 h1 中，后续轮次 query 在 div.bg-base 中
 */
window.GEO.PerplexityAdapter.prototype._findConversationTurns = function() {
  var turns = [];
  var proses = document.querySelectorAll('.prose');

  if (proses.length === 0) return turns;

  // 找到所有 turn 容器（每个 .prose 所属的 turn 块）
  var turnContainers = this._findTurnContainers(proses);

  for (var i = 0; i < turnContainers.length; i++) {
    var turnEl = turnContainers[i];
    var query = this._findQueryInTurn(turnEl, i);
    var citations = this._extractCitationsFromContainer(turnEl);

    turns.push({
      query: query,
      citations: citations,
      keywords: [] // Perplexity 不单独展示搜索关键词
    });
  }

  return turns;
};

/**
 * 找到每个 .prose 所属的 turn 容器
 * turn 容器是两个 .prose 的公共祖先的直接子元素
 */
window.GEO.PerplexityAdapter.prototype._findTurnContainers = function(proses) {
  if (proses.length === 1) {
    // 单轮：返回整个文档 body 作为容器
    return [document.body];
  }

  // 找到所有 .prose 的公共祖先
  var commonAncestor = this._findCommonAncestor(proses[0], proses[1]);
  if (!commonAncestor) return [document.body];

  // 公共祖先的子元素中，每个包含 .prose 的就是一个 turn 容器
  var containers = [];
  var children = commonAncestor.children;
  for (var i = 0; i < children.length; i++) {
    if (children[i].querySelector('.prose')) {
      containers.push(children[i]);
    }
  }

  // 如果没找到合理的容器，fallback 到每个 prose 本身
  if (containers.length === 0) {
    for (var i = 0; i < proses.length; i++) {
      containers.push(proses[i]);
    }
  }

  return containers;
};

/**
 * 找到两个元素的最近公共祖先
 */
window.GEO.PerplexityAdapter.prototype._findCommonAncestor = function(el1, el2) {
  var ancestors = [];
  var node = el1;
  while (node) {
    ancestors.push(node);
    node = node.parentElement;
  }
  node = el2;
  while (node) {
    if (ancestors.indexOf(node) !== -1) return node;
    node = node.parentElement;
  }
  return null;
};

/**
 * 在 turn 容器中找到用户提问文本
 */
window.GEO.PerplexityAdapter.prototype._findQueryInTurn = function(turnEl, index) {
  // 策略1：找 h1（第一轮通常有 h1）
  var h1 = turnEl.querySelector('h1');
  if (h1) return h1.textContent.trim();

  // 策略2：找 div.bg-base（后续轮次的 query 容器）
  var bgBase = turnEl.querySelector('[class*="bg-base"]');
  if (bgBase) {
    var text = bgBase.textContent.trim();
    if (text.length > 1 && text.length < 500) return text;
  }

  // 策略3：找 [class*="query"] 元素
  var queryEl = turnEl.querySelector('[class*="query"]');
  if (queryEl) {
    var text = queryEl.textContent.trim();
    if (text.length > 1 && text.length < 500) return text;
  }

  // 策略4：找 .prose 之前的文本块
  var prose = turnEl.querySelector('.prose');
  if (prose) {
    var current = prose.parentElement;
    while (current && current !== turnEl) {
      var prev = current.previousElementSibling;
      while (prev) {
        if (!prev.querySelector('.prose')) {
          var prevText = prev.textContent.trim();
          if (prevText.length > 1 && prevText.length < 300) {
            return prevText;
          }
        }
        prev = prev.previousElementSibling;
      }
      current = current.parentElement;
    }
  }

  // 策略5：首轮 fallback 到页面 h1
  if (index === 0) {
    var pageH1 = document.querySelector('h1');
    if (pageH1) return pageH1.textContent.trim();
  }

  return '';
};

/**
 * 从指定 turn 容器中提取引用链接
 * Perplexity 使用 data-pplx-citation-url 属性
 */
window.GEO.PerplexityAdapter.prototype._extractCitationsFromContainer = function(container) {
  var citations = [];

  // 直接在 turn 容器中查找所有引用
  var citeEls = container.querySelectorAll('[data-pplx-citation-url]');

  // 如果容器是 document.body（单轮 fallback），直接搜索整个文档
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
