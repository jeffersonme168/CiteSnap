window.GEO = window.GEO || {};

window.GEO.DoubaoAdapter = function() {
  window.GEO.BaseAdapter.call(this);
  this.platformId = 'doubao';
};

window.GEO.DoubaoAdapter.prototype = Object.create(window.GEO.BaseAdapter.prototype);
window.GEO.DoubaoAdapter.prototype.constructor = window.GEO.DoubaoAdapter;

window.GEO.DoubaoAdapter.matches = function(url) {
  return /doubao\.com/.test(url);
};

/**
 * 自动点击展开所有折叠的"搜索 N 个关键词，参考 N 篇资料"区域
 */
window.GEO.DoubaoAdapter.prototype._expandThinkingBoxes = function() {
  var clickables = document.querySelectorAll('div[class*="cursor-pointer"]');
  var expanded = 0;

  for (var i = 0; i < clickables.length; i++) {
    var el = clickables[i];
    var text = el.textContent || '';
    if (text.indexOf('搜索') !== -1 && text.indexOf('关键词') !== -1 && text.indexOf('资料') !== -1) {
      // 检查附近是否已有引用链接（已展开则跳过）
      var parent = el.closest('[data-message-id]') || el.parentElement;
      if (parent) {
        var existingRefs = parent.querySelectorAll('a[data-thinking-box-tool-call="true"]');
        if (existingRefs.length === 0) {
          el.click();
          expanded++;
        }
      } else {
        el.click();
        expanded++;
      }
    }
  }
  return expanded;
};

/**
 * 重写 extract：基于 data-message-id 逐轮配对提取
 */
window.GEO.DoubaoAdapter.prototype.extract = function() {
  // 先展开所有折叠区域
  this._expandThinkingBoxes();

  var result = window.GEO.createResult(this.platformId);

  // 获取所有消息块（通过 data-message-id）
  var msgBlocks = document.querySelectorAll('[data-message-id]');
  var conversations = [];
  var currentConv = null;

  for (var i = 0; i < msgBlocks.length; i++) {
    var block = msgBlocks[i];
    var isUser = this._isUserMessage(block);

    if (isUser) {
      // 新的一轮对话
      var queryText = this._extractQueryFromBlock(block);
      currentConv = window.GEO.createConversation(queryText);
      conversations.push(currentConv);
    } else if (currentConv) {
      // AI 回复：提取关键词和引用
      var keywords = this._extractKeywordsFromBlock(block);
      var citations = this._extractCitationsFromBlock(block);

      if (keywords.length > 0 || citations.length > 0) {
        currentConv.hasSearch = true;
        currentConv.searchKeywords = keywords;
        currentConv.citations = citations;
      }
    }
  }

  // 只保留有搜索结果的对话轮次
  result.conversations = conversations.filter(function(conv) {
    return conv.hasSearch;
  });

  return result;
};

/**
 * 判断消息块是否为用户消息
 */
window.GEO.DoubaoAdapter.prototype._isUserMessage = function(block) {
  // 方式1: 包含用户气泡
  if (block.querySelector('div[class*="bg-g-send-msg-bubble-bg"]')) return true;
  // 方式2: 父级有 justify-end
  var parent = block.closest('[class*="justify-end"]');
  if (parent) return true;
  return false;
};

/**
 * 从用户消息块中提取提问文本
 */
window.GEO.DoubaoAdapter.prototype._extractQueryFromBlock = function(block) {
  var bubble = block.querySelector('div[class*="bg-g-send-msg-bubble-bg"]');
  if (bubble) return bubble.textContent.trim();

  var preWrap = block.querySelector('div[class*="whitespace-pre-wrap"]');
  if (preWrap) return preWrap.textContent.trim();

  return '';
};

/**
 * 从 AI 回复块中提取搜索关键词
 */
window.GEO.DoubaoAdapter.prototype._extractKeywordsFromBlock = function(block) {
  var keywords = [];

  var kwEls = block.querySelectorAll('div[class*="text-dbx-neutral-400"], [class*="neutral-400"]');
  for (var i = 0; i < kwEls.length; i++) {
    var text = kwEls[i].textContent.trim();
    if (!text) continue;

    var matches = text.match(/[\u201c\u201f"](.*?)[\u201d\u201f"]/g);
    if (matches) {
      for (var j = 0; j < matches.length; j++) {
        var kw = matches[j].replace(/[\u201c\u201d\u201f""]/g, '').trim();
        if (kw && keywords.indexOf(kw) === -1) {
          keywords.push(kw);
        }
      }
    } else if (text.length < 300) {
      var parts = text.split(/[、,，]/);
      for (var k = 0; k < parts.length; k++) {
        var part = parts[k].trim();
        if (part && part.length < 100 && keywords.indexOf(part) === -1) {
          keywords.push(part);
        }
      }
    }
  }

  return keywords;
};

/**
 * 从 AI 回复块中提取引用链接
 */
window.GEO.DoubaoAdapter.prototype._extractCitationsFromBlock = function(block) {
  var citations = [];

  var refLinks = block.querySelectorAll('a[data-thinking-box-tool-call="true"]');
  if (refLinks.length === 0) {
    refLinks = block.querySelectorAll('a[data-tool-call-item-id]');
  }

  for (var i = 0; i < refLinks.length; i++) {
    var link = refLinks[i];
    var href = link.href;
    if (!href || href.indexOf('doubao.com') !== -1) continue;

    var titleEl = link.querySelector('div[class*="truncate"]') ||
                  link.querySelector('div[class*="flex-1"]');
    var title = titleEl ? titleEl.textContent.trim() : '';

    if (!title) {
      title = link.textContent.trim();
      title = title.replace(/^\d+\.\s*/, '');
    }

    var indexEl = link.querySelector('span');
    var index = 0;
    if (indexEl) {
      index = parseInt(indexEl.textContent.replace(/[^0-9]/g, ''), 10) || (i + 1);
    } else {
      var itemId = link.getAttribute('data-tool-call-item-id') || '';
      var match = itemId.match(/result-(\d+)/);
      index = match ? parseInt(match[1], 10) + 1 : (i + 1);
    }

    citations.push({
      index: index,
      url: href,
      title: title || this._getDomain(href)
    });
  }

  return this._dedup(citations);
};

window.GEO.DoubaoAdapter.prototype.isResponseComplete = function() {
  var loading = this._queryFirst([
    '[class*="loading"]',
    '[class*="typing"]',
    '[class*="generating"]',
    '[class*="streaming"]'
  ]);
  return !loading;
};

window.GEO.DoubaoAdapter.prototype._getDomain = function(url) {
  try {
    return new URL(url).hostname;
  } catch (e) {
    return url;
  }
};
