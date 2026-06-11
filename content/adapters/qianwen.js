window.GEO = window.GEO || {};

window.GEO.QianwenAdapter = function() {
  window.GEO.BaseAdapter.call(this);
  this.platformId = 'qianwen';
};

window.GEO.QianwenAdapter.prototype = Object.create(window.GEO.BaseAdapter.prototype);
window.GEO.QianwenAdapter.prototype.constructor = window.GEO.QianwenAdapter;

window.GEO.QianwenAdapter.matches = function(url) {
  return /qianwen\.com/.test(url) || /tongyi\.aliyun\.com/.test(url);
};

/**
 * 千问（通义千问）多轮对话提取
 * 页面结构：
 * - 主容器：.message-list-scroll-container > .auto-center-wrapper-* > .message-list-content-container
 * - 对话轮次：.chat-round 容器，带 data-chat="{reqId}-question" 属性
 * - 用户提问：.chat-question-wrap 或 [class*="chat-question-card"]
 * - AI 回答：.qk-md-text（Markdown 渲染）
 * - 引用数据：存储在 <script type="application/json" id="s-data-card_video_..."> 标签中
 *   JSON 路径：data.originalData.content.list[]
 *   每个引用包含：title, norm_url, author, subtype(video/note), publishTime
 * - 每轮对话的 reqId 通过 .chat-round[data-chat] 获取，与 script 标签中的 data.initialData.reqId 匹配
 */
window.GEO.QianwenAdapter.prototype.extract = function() {
  var result = window.GEO.createResult(this.platformId);

  // 先从 script 标签中解析所有引用数据（按 reqId 分组）
  var citationsByReqId = this._parseCitationScripts();

  var rounds = document.querySelectorAll('.chat-round');

  if (rounds.length === 0) {
    // Fallback: 如果没有 .chat-round，尝试从所有 script 数据中提取
    var query = this._extractQuery();
    var allCitations = this._getAllCitationsFromScripts(citationsByReqId);
    if (allCitations.length > 0) {
      var conv = window.GEO.createConversation(query);
      conv.citations = allCitations;
      conv.hasSearch = true;
      result.conversations.push(conv);
    }
    return result;
  }

  for (var i = 0; i < rounds.length; i++) {
    var round = rounds[i];
    var query = this._extractQueryFromRound(round);
    var reqId = this._getReqIdFromRound(round);
    var citations = citationsByReqId[reqId] || [];

    if (citations.length > 0) {
      var conv = window.GEO.createConversation(query);
      conv.citations = citations;
      conv.searchKeywords = [];
      conv.hasSearch = true;
      result.conversations.push(conv);
    }
  }

  return result;
};

/**
 * 从页面中所有 <script type="application/json"> 标签解析引用数据
 * 返回 { reqId: [{index, url, title}, ...], ... }
 */
window.GEO.QianwenAdapter.prototype._parseCitationScripts = function() {
  var citationsByReqId = {};
  var scripts = document.querySelectorAll('script[type="application/json"]');

  for (var i = 0; i < scripts.length; i++) {
    var text = scripts[i].textContent;
    if (!text || text.indexOf('norm_url') === -1) continue;

    try {
      var data = JSON.parse(text);
      if (!data.data || !data.data.initialData || !data.data.originalData) continue;

      var reqId = data.data.initialData.reqId || '';
      var content = data.data.originalData.content;
      if (!content || !content.list) continue;

      var list = content.list;
      var citations = [];
      var seen = {};

      for (var j = 0; j < list.length; j++) {
        var item = list[j];
        var url = item.norm_url || item.url || '';
        var title = item.title || '';
        var author = item.author || '';

        // 跳过没有标题的空条目
        if (!title) continue;

        // 组合标题和作者信息
        var displayTitle = title;
        if (author && title.indexOf(author) === -1) {
          displayTitle = title + ' - ' + author;
        }

        // 如果有 URL 则去重
        if (url) {
          if (seen[url]) continue;
          seen[url] = true;
        }

        citations.push({
          index: citations.length + 1,
          url: url,
          title: displayTitle
        });
      }

      if (reqId && citations.length > 0) {
        citationsByReqId[reqId] = citations;
      }
    } catch (e) {
      // 解析失败，跳过
    }
  }

  return citationsByReqId;
};

/**
 * 从 .chat-round 的 data-chat 属性获取 reqId
 * data-chat 格式为 "{reqId}-question"
 */
window.GEO.QianwenAdapter.prototype._getReqIdFromRound = function(round) {
  var dataChat = round.getAttribute('data-chat') || '';
  // 格式: "ae29a28b14d24ee3a3b46024386021be-question"
  var parts = dataChat.split('-question');
  if (parts.length > 0 && parts[0]) {
    return parts[0];
  }
  // 备选：从 round 内的 reference-wrap ID 获取
  var refWrap = round.querySelector('[class*="reference-wrap"]');
  if (refWrap && refWrap.id) {
    // ID 格式: "reference-link-anchor-{reqId}"
    var match = refWrap.id.match(/reference-link-anchor-(.+)/);
    if (match) return match[1];
  }
  return '';
};

/**
 * 从 chat-round 容器中提取用户提问
 */
window.GEO.QianwenAdapter.prototype._extractQueryFromRound = function(round) {
  // 策略1：.chat-question-wrap
  var questionWrap = round.querySelector('[class*="chat-question-wrap"]');
  if (questionWrap) {
    var text = questionWrap.textContent.trim();
    if (text.length > 0 && text.length < 500) return text;
  }

  // 策略2：chat-question-card-wrap
  var cardWrap = round.querySelector('[class*="chat-question-card"]');
  if (cardWrap) {
    var text = cardWrap.textContent.trim();
    if (text.length > 0 && text.length < 500) return text;
  }

  // 策略3：message-card-wrap question
  var msgCard = round.querySelector('[class*="message-card-wrap"][class*="question"]');
  if (msgCard) {
    var text = msgCard.textContent.trim();
    if (text.length > 0 && text.length < 500) return text;
  }

  return '';
};

/**
 * 从所有 script 数据中获取引用列表（Fallback）
 */
window.GEO.QianwenAdapter.prototype._getAllCitationsFromScripts = function(citationsByReqId) {
  var all = [];
  var keys = Object.keys(citationsByReqId);
  for (var i = 0; i < keys.length; i++) {
    var citations = citationsByReqId[keys[i]];
    for (var j = 0; j < citations.length; j++) {
      all.push(citations[j]);
    }
  }
  // 重新编号
  for (var k = 0; k < all.length; k++) {
    all[k].index = k + 1;
  }
  return all;
};

/**
 * Fallback：提取用户提问（单轮）
 */
window.GEO.QianwenAdapter.prototype._extractQuery = function() {
  var questionWrap = document.querySelector('[class*="chat-question-wrap"]');
  if (questionWrap) return questionWrap.textContent.trim();
  return '';
};

window.GEO.QianwenAdapter.prototype.isResponseComplete = function() {
  var loading = this._queryFirst([
    '[class*="animate-pulse"]',
    '[class*="loading"]',
    '[class*="streaming"]',
    '[class*="generating"]',
    '[class*="cursor-blink"]',
    '[class*="typing"]'
  ]);
  return !loading;
};
