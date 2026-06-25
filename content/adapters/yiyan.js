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
 * 异步提取（逐轮点击引用面板）
 * 由于 sourceContainer 是全局唯一面板，需要逐个点击每轮的引用按钮，
 * 等待面板加载后再读取，否则只能读到最后一轮的数据。
 */
window.GEO.YiyanAdapter.prototype.extractAsync = function(callback) {
  var self = this;
  var result = window.GEO.createResult(this.platformId);

  var questions = document.querySelectorAll('[class*="questionBox"]');
  var answers = document.querySelectorAll('[class*="answerBox"]');

  var realQuestions = [];
  for (var i = 0; i < questions.length; i++) {
    var cls = typeof questions[i].className === 'string' ? questions[i].className : '';
    if (cls.indexOf('flowBox') !== -1) {
      realQuestions.push(questions[i]);
    }
  }

  // 收集每轮的基本信息和对应的引用按钮
  var turnData = [];
  for (var j = 0; j < realQuestions.length; j++) {
    var queryText = this._extractQueryText(realQuestions[j]);
    var answerEl = j < answers.length ? answers[j] : null;
    var refBtn = null;
    if (answerEl) {
      // 目标是内层 container（含 titleText 子元素的那个），不是外层 wrapper
      var containers = answerEl.querySelectorAll('[class*="container__M"]');
      for (var k = 0; k < containers.length; k++) {
        var c = containers[k];
        if (c.querySelector('[class*="titleText"]') && c.textContent.trim().match(/参考\d+个网页/)) {
          // 确保是最内层的（不包含其他 container__M 子元素）
          var innerContainers = c.querySelectorAll('[class*="container__M"]');
          if (innerContainers.length === 0) {
            refBtn = c;
            break;
          }
        }
      }
    }
    turnData.push({
      query: queryText,
      answerEl: answerEl,
      refBtn: refBtn,
      citations: []
    });
  }

  // 文心一言 DOM 是逆序的（最新对话在最上面），需要反转为时间顺序
  turnData.reverse();

  // 逐轮点击引用按钮并提取
  var currentIndex = 0;

  function processNext() {
    if (currentIndex >= turnData.length) {
      // 所有轮次处理完毕，组装结果
      for (var m = 0; m < turnData.length; m++) {
        var conv = window.GEO.createConversation(turnData[m].query);
        conv.citations = turnData[m].citations;
        conv.searchKeywords = [];
        conv.hasSearch = turnData[m].citations.length > 0;
        result.conversations.push(conv);
      }
      callback(result);
      return;
    }

    var turn = turnData[currentIndex];

    if (!turn.refBtn) {
      // 该轮无引用按钮，跳过
      currentIndex++;
      processNext();
      return;
    }

    // 点击该轮的引用按钮
    turn.refBtn.click();

    // 等待面板加载
    setTimeout(function() {
      var sourceContainer = document.querySelector('[class*="sourceContainer"]');
      if (sourceContainer) {
        var items = sourceContainer.querySelectorAll('[class*="item__"]');
        if (items.length > 0) {
          turn.citations = self._extractItemsFromPanel(items);
        }
      }
      currentIndex++;
      processNext();
    }, 1000);
  }

  processNext();
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

  // 文心一言 DOM 是逆序的（最新对话在最上面），反转为时间顺序
  turns.reverse();

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
 * 禁用全局展开（由 extractAsync 逐轮处理）
 */
window.GEO.YiyanAdapter.prototype._expandReferencePanels = function() {
  // 不做全局展开，由 extractAsync 逐轮点击引用按钮
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
