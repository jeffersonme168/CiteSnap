window.GEO = window.GEO || {};

window.GEO.YuanbaoAdapter = function() {
  window.GEO.BaseAdapter.call(this);
  this.platformId = 'yuanbao';
};

window.GEO.YuanbaoAdapter.prototype = Object.create(window.GEO.BaseAdapter.prototype);
window.GEO.YuanbaoAdapter.prototype.constructor = window.GEO.YuanbaoAdapter;

window.GEO.YuanbaoAdapter.matches = function(url) {
  return /yuanbao\.tencent\.com/.test(url) || /yb\.tencent\.com/.test(url);
};

/**
 * 腾讯元宝多轮对话提取
 * 页面结构：
 * - 用户提问：.agent-chat__list__item--human（排除 placeholder）
 * - AI 回答：.agent-chat__list__item--ai，带 data-conv-id 属性
 * - 引用数据：存储在右侧抽屉面板 #chatReferenceList 中
 *   - 每个引用：.agent-dialogue-references__item
 *     - dt-cid 属性与 AI 回答的 data-conv-id 对应
 *     - dt-ext6 属性 = 引用 URL
 *     - dt-ext3 属性 = 来源名称
 *   - 引用卡片：.hyc-common-markdown__ref_card
 *     - data-url 属性 = 引用 URL
 *     - 内部文本 = 标题
 * - 深度搜索思考区：.hyc-component-deepsearch-cot（每个 AI 回答内）
 */
window.GEO.YuanbaoAdapter.prototype.extract = function() {
  var result = window.GEO.createResult(this.platformId);

  // 获取所有对话轮次
  var turns = this._getConversationTurns();

  // 从抽屉面板获取引用数据，按 conv-id 分组
  var citationsByConvId = this._getCitationsFromDrawer();

  for (var i = 0; i < turns.length; i++) {
    var turn = turns[i];
    var citations = citationsByConvId[turn.convId] || [];

    // 如果抽屉中没有找到引用，尝试从思考区提取标题
    if (citations.length === 0 && turn.aiElement) {
      citations = this._getCitationsFromThinking(turn.aiElement);
    }

    var conv = window.GEO.createConversation(turn.query);
    conv.citations = citations;
    conv.searchKeywords = [];
    conv.hasSearch = citations.length > 0;

    if (conv.query || conv.hasSearch) {
      result.conversations.push(conv);
    }
  }

  return result;
};

/**
 * 获取对话轮次：配对用户提问和 AI 回答
 */
window.GEO.YuanbaoAdapter.prototype._getConversationTurns = function() {
  var turns = [];

  var humanItems = document.querySelectorAll('.agent-chat__list__item--human');
  var aiItems = document.querySelectorAll('.agent-chat__list__item--ai');

  // 过滤掉 placeholder
  var realHumans = [];
  for (var i = 0; i < humanItems.length; i++) {
    if (humanItems[i].className.indexOf('placeholder') === -1 &&
        humanItems[i].textContent.trim().length > 0) {
      realHumans.push(humanItems[i]);
    }
  }

  // 配对：每个真实的 human 对应一个 ai
  for (var j = 0; j < realHumans.length; j++) {
    var query = this._extractQueryFromHuman(realHumans[j]);
    var aiEl = j < aiItems.length ? aiItems[j] : null;
    var convId = aiEl ? (aiEl.getAttribute('data-conv-id') || '') : '';

    turns.push({
      query: query,
      convId: convId,
      aiElement: aiEl
    });
  }

  // 如果没有配对成功，尝试用 AI items 的 data-conv-idx 推断
  if (turns.length === 0 && aiItems.length > 0) {
    for (var k = 0; k < aiItems.length; k++) {
      var convId = aiItems[k].getAttribute('data-conv-id') || '';
      turns.push({
        query: '',
        convId: convId,
        aiElement: aiItems[k]
      });
    }
  }

  return turns;
};

/**
 * 从用户消息元素提取提问文本
 */
window.GEO.YuanbaoAdapter.prototype._extractQueryFromHuman = function(humanEl) {
  // 尝试从 bubble content 中获取
  var bubble = humanEl.querySelector('.agent-chat__bubble__content');
  if (bubble) {
    var text = bubble.textContent.trim();
    if (text.length > 0 && text.length < 500) return text;
  }

  // Fallback: 直接取整个元素的文本
  var text = humanEl.textContent.trim();
  if (text.length > 0 && text.length < 500) return text;

  return '';
};

/**
 * 从右侧抽屉面板提取引用，按 conv-id 分组
 * 返回 { convId: [{index, url, title}, ...], ... }
 */
window.GEO.YuanbaoAdapter.prototype._getCitationsFromDrawer = function() {
  var citationsByConvId = {};

  var items = document.querySelectorAll('.agent-dialogue-references__item');

  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var convId = item.getAttribute('dt-cid') || '';
    var url = item.getAttribute('dt-ext6') || '';
    var sourceName = item.getAttribute('dt-ext3') || '';

    if (!url) {
      // Fallback: 从内部 ref_card 获取
      var refCard = item.querySelector('.hyc-common-markdown__ref_card');
      if (refCard) {
        url = refCard.getAttribute('data-url') || '';
      }
    }

    if (!url) continue;

    // 获取标题
    var title = this._getTitleFromRefItem(item, sourceName);

    if (!citationsByConvId[convId]) {
      citationsByConvId[convId] = [];
    }

    citationsByConvId[convId].push({
      index: citationsByConvId[convId].length + 1,
      url: url,
      title: title
    });
  }

  return citationsByConvId;
};

/**
 * 从引用项中提取标题
 */
window.GEO.YuanbaoAdapter.prototype._getTitleFromRefItem = function(item, sourceName) {
  // 策略1：从 ref_card 内获取标题文本
  var refCard = item.querySelector('.hyc-common-markdown__ref_card');
  if (refCard) {
    // 标题在 ref_card-foot__source_txt 之前的文本
    var titleEl = refCard.querySelector('[class*="ref_card-foot__source_txt"]');
    var fullText = refCard.textContent.trim();

    if (titleEl) {
      var sourceText = titleEl.textContent.trim();
      // 标题 = 全文去掉来源名称
      var title = fullText;
      if (sourceText && fullText.indexOf(sourceText) === 0) {
        title = fullText.substring(sourceText.length).trim();
      } else if (sourceText && fullText.indexOf(sourceText) > 0) {
        title = fullText.substring(0, fullText.indexOf(sourceText)).trim();
      }
      if (title.length > 0) return title;
    }

    // Fallback: 去掉来源名直接用全文
    if (sourceName && fullText.indexOf(sourceName) === 0) {
      var title = fullText.substring(sourceName.length).trim();
      if (title.length > 0) return title;
    }

    if (fullText.length > 0 && fullText.length < 200) return fullText;
  }

  // 策略2：用来源名称
  if (sourceName) return sourceName;

  return '';
};

/**
 * 从思考区（CoT）提取引用标题（无 URL，仅作 fallback）
 */
window.GEO.YuanbaoAdapter.prototype._getCitationsFromThinking = function(aiElement) {
  var citations = [];
  var docs = aiElement.querySelectorAll('.hyc-component-deepsearch-cot__think__content__item__doc');

  var seen = {};
  for (var i = 0; i < docs.length; i++) {
    var titleEl = docs[i].querySelector('[class*="__doc__title__text"]');
    if (!titleEl) continue;

    var title = titleEl.textContent.trim();
    if (!title || seen[title]) continue;
    seen[title] = true;

    citations.push({
      index: citations.length + 1,
      url: '',
      title: title
    });
  }

  return citations;
};

window.GEO.YuanbaoAdapter.prototype.isResponseComplete = function() {
  var loading = this._queryFirst([
    '[class*="animate-pulse"]',
    '[class*="loading"]',
    '[class*="streaming"]',
    '[class*="generating"]',
    '[class*="agent-chat__list__item--ai-loading"]'
  ]);
  return !loading;
};

/**
 * 展开引用面板（点击"源"按钮打开抽屉）
 */
window.GEO.YuanbaoAdapter.prototype._expandReferencePanels = function() {
  // 如果抽屉未打开，尝试点击"源"按钮
  var drawer = document.querySelector('.t-drawer--open .agent-dialogue-references');
  if (drawer) return; // 已经打开

  var sourceBtn = document.querySelector('[data-toolbar-type="citation"]');
  if (sourceBtn) {
    sourceBtn.click();
  }
};
