window.GEO = window.GEO || {};

window.GEO.DeepSeekAdapter = function() {
  window.GEO.BaseAdapter.call(this);
  this.platformId = 'deepseek';
};

window.GEO.DeepSeekAdapter.prototype = Object.create(window.GEO.BaseAdapter.prototype);
window.GEO.DeepSeekAdapter.prototype.constructor = window.GEO.DeepSeekAdapter;

window.GEO.DeepSeekAdapter.matches = function(url) {
  return /deepseek\.com/.test(url);
};

/**
 * DeepSeek 多轮对话提取
 * 消息结构：.ds-message 容器
 * - 用户消息：带 d29f3d7d class，文本在 .fbb737a4
 * - AI 回复：不带 d29f3d7d，引用在 .f2021e64 容器的 a._04ab7b1
 */
window.GEO.DeepSeekAdapter.prototype.extract = function() {
  var result = window.GEO.createResult(this.platformId);

  var msgs = document.querySelectorAll('.ds-message');
  var conversations = [];
  var currentConv = null;

  for (var i = 0; i < msgs.length; i++) {
    var msg = msgs[i];
    var isUser = this._isUserMessage(msg);

    if (isUser) {
      var queryText = this._extractQueryFromBlock(msg);
      currentConv = window.GEO.createConversation(queryText);
      conversations.push(currentConv);
    } else if (currentConv) {
      var keywords = this._extractKeywordsFromBlock(msg);
      var citations = this._extractCitationsFromBlock(msg);

      if (keywords.length > 0 || citations.length > 0) {
        currentConv.hasSearch = true;
        currentConv.searchKeywords = keywords;
        currentConv.citations = citations;
      }
    }
  }

  result.conversations = conversations;

  return result;
};

/**
 * 判断是否为用户消息
 * DeepSeek 用户消息的 .ds-message 会额外带 d29f3d7d class
 */
window.GEO.DeepSeekAdapter.prototype._isUserMessage = function(msg) {
  var cls = msg.className || '';
  // 用户消息有 d29f3d7d 额外标识
  if (cls.indexOf('d29f3d7d') !== -1) return true;
  // 备选：检查是否包含用户文本容器
  if (msg.querySelector('.fbb737a4') && !msg.querySelector('.ds-markdown')) return true;
  return false;
};

/**
 * 从用户消息块提取提问文本
 */
window.GEO.DeepSeekAdapter.prototype._extractQueryFromBlock = function(msg) {
  // 用户问题文本在 .fbb737a4 内
  var textEl = msg.querySelector('.fbb737a4');
  if (textEl) return textEl.textContent.trim();

  // 备选：第一个有文本的子元素
  var children = msg.querySelectorAll('div, p, span');
  for (var i = 0; i < children.length; i++) {
    var t = children[i].textContent.trim();
    if (t.length > 2 && t.length < 500) return t;
  }
  return '';
};

/**
 * 从 AI 回复块提取搜索关键词
 * DeepSeek 在思考过程 (.ds-think-content) 中描述搜索意图
 * 以及搜索摘要 (span._08cbf39) 显示 "搜索到 N 个网页"
 */
window.GEO.DeepSeekAdapter.prototype._extractKeywordsFromBlock = function(msg) {
  var keywords = [];

  // DeepSeek 不像豆包那样单独列出搜索关键词
  // 但搜索摘要可以作为关键词信息
  var searchSummary = msg.querySelector('span[class*="_08cbf39"], [class*="_08cbf39"]');
  if (searchSummary) {
    var summaryText = searchSummary.textContent.trim();
    if (summaryText) {
      keywords.push(summaryText);
    }
  }

  // 从思考内容中提取搜索意图描述
  var thinkEls = msg.querySelectorAll('.ds-think-content');
  for (var i = 0; i < thinkEls.length; i++) {
    var text = thinkEls[i].textContent.trim();
    // 只取简短的搜索描述，过滤掉过长的分析文本
    if (text.length < 200 && (text.indexOf('搜索') !== -1 || text.indexOf('查找') !== -1)) {
      if (keywords.indexOf(text) === -1) {
        keywords.push(text);
      }
    }
  }

  return keywords;
};

/**
 * 从 AI 回复块提取引用链接
 * 引用来源卡片在 .f2021e64 容器内的 a._04ab7b1
 */
window.GEO.DeepSeekAdapter.prototype._extractCitationsFromBlock = function(msg) {
  var citations = [];

  // 主策略: 引用来源卡片区域 (.f2021e64 > a._04ab7b1)
  var refSection = msg.querySelector('.f2021e64');
  var refLinks = [];

  if (refSection) {
    refLinks = refSection.querySelectorAll('a');
  }

  // 备选策略: 通过 class 直接找引用卡片
  if (refLinks.length === 0) {
    refLinks = msg.querySelectorAll('a[class*="_04ab7b1"]');
  }

  // 备选策略2: 找 _02fb570 父容器内的链接
  if (refLinks.length === 0) {
    var refContainers = msg.querySelectorAll('[class*="_02fb570"][class*="_9887d4d"]');
    for (var c = 0; c < refContainers.length; c++) {
      var containerLinks = refContainers[c].querySelectorAll('a[href^="http"]');
      for (var cl = 0; cl < containerLinks.length; cl++) {
        refLinks = Array.prototype.slice.call(refLinks).concat(containerLinks[cl]);
      }
    }
    // 如果上面组合不好用，直接 querySelectorAll
    if (refLinks.length === 0) {
      refLinks = msg.querySelectorAll('[class*="_02fb570"] a[href^="http"]');
    }
  }

  for (var i = 0; i < refLinks.length; i++) {
    var link = refLinks[i];
    var href = link.href;
    if (!href || href.indexOf('deepseek.com') !== -1) continue;

    var title = link.textContent.trim();
    // 过滤掉正文中的引用编号链接（如 "-15", "-24"）
    if (/^-?\d+$/.test(title)) continue;

    citations.push({
      index: i + 1,
      url: href,
      title: title || this._getDomain(href)
    });
  }

  return this._dedup(citations);
};

window.GEO.DeepSeekAdapter.prototype.isResponseComplete = function() {
  var loading = this._queryFirst([
    '[class*="loading"]',
    '[class*="typing"]',
    '[class*="generating"]',
    '[class*="streaming"]'
  ]);
  return !loading;
};

window.GEO.DeepSeekAdapter.prototype._getDomain = function(url) {
  try {
    return new URL(url).hostname;
  } catch (e) {
    return url;
  }
};
