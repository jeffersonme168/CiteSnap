window.GEO = window.GEO || {};

window.GEO.YiyanAdapter = function() {
  window.GEO.BaseAdapter.call(this);
  this.platformId = 'yiyan';
};

window.GEO.YiyanAdapter.prototype = Object.create(window.GEO.BaseAdapter.prototype);
window.GEO.YiyanAdapter.prototype.constructor = window.GEO.YiyanAdapter;

window.GEO.YiyanAdapter.matches = function(url) {
  return /yiyan\.baidu\.com/.test(url);
};

/**
 * 文心一言多轮对话提取
 * 页面结构：
 * - 用户提问：[class*="questionBox"]（class 含哈希后缀如 questionBox__ZFtMiY23）
 * - AI 回答：[class*="answerBox"]（class 含哈希后缀如 answerBox__D50BuLYx）
 * - 引用标记：回答内 .container__MWtKSa6G 包含 "参考N个网页" 文本，可点击展开
 * - 引用面板：.sourceContainer 内的 .list 包含 .item 列表
 *   - 标题：[class*="titleInfo"]
 *   - 来源：[class*="siteText"]（如"知乎"、"什么值得买"）
 *   - 日期：[class*="date"]
 *   - 注意：引用项无 URL 链接，仅有标题和来源名
 */
window.GEO.YiyanAdapter.prototype.extract = function() {
  var result = window.GEO.createResult(this.platformId);

  var turns = this._getConversationTurns();

  for (var i = 0; i < turns.length; i++) {
    var turn = turns[i];
    var conv = window.GEO.createConversation(turn.query);
    conv.citations = turn.citations;
    conv.searchKeywords = [];
    conv.hasSearch = turn.citations.length > 0;
    result.conversations.push(conv);
  }

  return result;
};

/**
 * 获取对话轮次：配对用户提问和 AI 回答
 */
window.GEO.YiyanAdapter.prototype._getConversationTurns = function() {
  var turns = [];

  var questions = document.querySelectorAll('[class*="questionBox"]');
  var answers = document.querySelectorAll('[class*="answerBox"]');

  // 过滤出真实的问题元素（排除内部子元素重复匹配）
  var realQuestions = [];
  for (var i = 0; i < questions.length; i++) {
    var q = questions[i];
    // 只取最外层的 questionBox（class 同时包含 flowBox）
    var cls = typeof q.className === 'string' ? q.className : '';
    if (cls.indexOf('flowBox') !== -1) {
      realQuestions.push(q);
    }
  }

  for (var j = 0; j < realQuestions.length; j++) {
    var queryText = this._extractQueryText(realQuestions[j]);
    var answerEl = j < answers.length ? answers[j] : null;
    var citations = answerEl ? this._extractCitationsFromAnswer(answerEl) : [];

    turns.push({
      query: queryText,
      citations: citations
    });
  }

  return turns;
};

/**
 * 从问题元素提取用户提问文本
 */
window.GEO.YiyanAdapter.prototype._extractQueryText = function(questionEl) {
  // 优先从 questionText 子元素获取
  var textEl = questionEl.querySelector('[class*="questionText"]');
  if (textEl) {
    return textEl.textContent.trim();
  }
  return questionEl.textContent.trim();
};

/**
 * 从回答元素提取引用信息
 * 策略1：从已展开的来源面板提取
 * 策略2：从回答内嵌的"参考N个网页"区域提取（点击后展开）
 */
window.GEO.YiyanAdapter.prototype._extractCitationsFromAnswer = function(answerEl) {
  var citations = [];

  // 策略1：检查来源面板是否已展开（.sourceContainer 内的 .list 里有 items）
  var sourceContainer = document.querySelector('[class*="sourceContainer"]');
  if (sourceContainer) {
    var items = sourceContainer.querySelectorAll('[class*="item__"]');
    if (items.length > 0) {
      // 检查面板显示的引用是否属于当前回答
      // （通过比较面板标题数量与回答中"参考N个网页"的N）
      var refHeader = answerEl.querySelector('[class*="titleText"]');
      var expectedCount = 0;
      if (refHeader) {
        var match = refHeader.textContent.match(/参考(\d+)个网页/);
        if (match) expectedCount = parseInt(match[1]);
      }

      var panelTotal = sourceContainer.querySelector('[class*="total"]');
      var panelCount = panelTotal ? parseInt(panelTotal.textContent) : 0;

      if (panelCount === expectedCount && expectedCount > 0) {
        return this._extractItemsFromPanel(items);
      }
    }
  }

  // 策略2：从回答内的 container 区域尝试提取（若面板未展开或不匹配）
  // 此时仅能记录"参考N个网页"这一信息
  var refContainer = answerEl.querySelector('[class*="container__M"]');
  if (refContainer) {
    var titleText = refContainer.querySelector('[class*="titleText"]');
    if (titleText) {
      var text = titleText.textContent.trim();
      var match = text.match(/参考(\d+)个网页/);
      if (match) {
        // 面板未展开，无法获取具体引用，留空
        // 引用将在面板展开后由策略1提取
      }
    }
  }

  return citations;
};

/**
 * 从来源面板的 item 列表提取引用数据
 */
window.GEO.YiyanAdapter.prototype._extractItemsFromPanel = function(items) {
  var citations = [];
  var seen = {};

  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var titleEl = item.querySelector('[class*="titleInfo"]');
    var siteEl = item.querySelector('[class*="siteText"]');
    var dateEl = item.querySelector('[class*="date"]');

    var title = titleEl ? titleEl.textContent.trim() : '';
    var site = siteEl ? siteEl.textContent.trim() : '';
    var date = dateEl ? dateEl.textContent.trim() : '';

    if (!title) continue;
    if (seen[title]) continue;
    seen[title] = true;

    var displayTitle = title;
    if (site) {
      displayTitle = title + ' - ' + site;
    }
    if (date) {
      displayTitle += ' (' + date + ')';
    }

    citations.push({
      index: citations.length + 1,
      url: '',
      title: displayTitle
    });
  }

  return citations;
};

/**
 * 展开参考面板
 * 点击所有"参考N个网页"按钮
 */
window.GEO.YiyanAdapter.prototype._expandReferencePanels = function() {
  var containers = document.querySelectorAll('[class*="container__MWtKSa6G"], [class*="container__M"]');
  for (var i = 0; i < containers.length; i++) {
    var el = containers[i];
    var text = el.textContent.trim();
    if (text.match(/参考\d+个网页/)) {
      el.click();
    }
  }
};

window.GEO.YiyanAdapter.prototype.isResponseComplete = function() {
  var loading = this._queryFirst([
    '[class*="loading"]',
    '[class*="streaming"]',
    '[class*="generating"]',
    '[class*="typing"]'
  ]);
  return !loading;
};
