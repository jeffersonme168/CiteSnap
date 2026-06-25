window.GEO = window.GEO || {};

window.GEO.KimiAdapter = function() {
  window.GEO.BaseAdapter.call(this);
  this.platformId = 'kimi';
};

window.GEO.KimiAdapter.prototype = Object.create(window.GEO.BaseAdapter.prototype);
window.GEO.KimiAdapter.prototype.constructor = window.GEO.KimiAdapter;

window.GEO.KimiAdapter.matches = function(url) {
  return /kimi\.moonshot\.cn/.test(url);
};

window.GEO.KimiAdapter.prototype.extractQuery = function() {
  // Kimi 聊天中最后一条用户消息
  var userMessages = this._queryAll([
    '[class*="user-message"]',
    '[class*="human-message"]',
    '[data-role="user"]',
    '[class*="chat-message--human"]'
  ]);

  if (userMessages.length > 0) {
    return userMessages[userMessages.length - 1].textContent.trim();
  }
  return '';
};

window.GEO.KimiAdapter.prototype.extractKeywords = function() {
  var keywords = [];

  // Kimi 搜索阶段显示的关键词
  var searchEls = this._queryAll([
    '[class*="search-keyword"]',
    '[class*="search-query"]',
    '[class*="searching"] span',
    '[class*="web-search"] span'
  ]);

  for (var i = 0; i < searchEls.length; i++) {
    var text = searchEls[i].textContent.trim();
    if (text && text.length < 100 && keywords.indexOf(text) === -1) {
      keywords.push(text);
    }
  }

  return keywords;
};

window.GEO.KimiAdapter.prototype.extractCitations = function() {
  var citations = [];

  // Kimi 的引用链接
  var refLinks = this._queryAll([
    '[class*="reference"] a[href^="http"]',
    '[class*="citation"] a[href^="http"]',
    '[class*="source"] a[href^="http"]',
    '[class*="footnote"] a[href^="http"]'
  ]);

  for (var i = 0; i < refLinks.length; i++) {
    var link = refLinks[i];
    var href = link.href;
    if (href && href.indexOf('kimi.moonshot.cn') === -1) {
      citations.push({
        index: citations.length + 1,
        url: href,
        title: link.textContent.trim() || link.title || this._getDomain(href)
      });
    }
  }

  // 备选：回答区域中的外部链接
  if (citations.length === 0) {
    var responseArea = this._queryFirst([
      '[class*="assistant"]',
      '[data-role="assistant"]',
      '[class*="bot-message"]',
      '[class*="ai-message"]'
    ]);

    if (responseArea) {
      var links = responseArea.querySelectorAll('a[href^="http"]');
      for (var j = 0; j < links.length; j++) {
        var a = links[j];
        if (a.href.indexOf('kimi.moonshot.cn') === -1 &&
            a.href.indexOf('moonshot.cn') === -1) {
          citations.push({
            index: citations.length + 1,
            url: a.href,
            title: a.textContent.trim() || a.title || this._getDomain(a.href)
          });
        }
      }
    }
  }

  return this._dedup(citations);
};

window.GEO.KimiAdapter.prototype.isResponseComplete = function() {
  var loading = this._queryFirst([
    '[class*="loading"]',
    '[class*="typing"]',
    '[class*="generating"]',
    '[class*="streaming"]'
  ]);
  return !loading;
};

window.GEO.KimiAdapter.prototype._getDomain = function(url) {
  try {
    return new URL(url).hostname;
  } catch (e) {
    return url;
  }
};
