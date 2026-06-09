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

window.GEO.PerplexityAdapter.prototype.extractQuery = function() {
  // Perplexity 主问题标题
  var el = this._queryFirst([
    'h1',
    '[class*="query"]',
    '[class*="question"]',
    'textarea[value]'
  ]);

  if (el) {
    if (el.tagName === 'TEXTAREA') return el.value.trim();
    return el.textContent.trim();
  }
  return '';
};

window.GEO.PerplexityAdapter.prototype.extractKeywords = function() {
  var keywords = [];

  // Perplexity 搜索阶段显示的搜索词
  var searchEls = this._queryAll([
    '[class*="search"] span',
    '[class*="query-chip"]',
    '[class*="search-query"]'
  ]);

  for (var i = 0; i < searchEls.length; i++) {
    var text = searchEls[i].textContent.trim();
    if (text && text.length < 100 && keywords.indexOf(text) === -1) {
      keywords.push(text);
    }
  }

  return keywords;
};

window.GEO.PerplexityAdapter.prototype.extractCitations = function() {
  var citations = [];

  // Perplexity 的来源卡片
  var sourceCards = this._queryAll([
    '[class*="source"] a[href^="http"]',
    '[class*="citation"] a[href^="http"]',
    'a[class*="source"]',
    '[data-testid*="source"] a'
  ]);

  for (var i = 0; i < sourceCards.length; i++) {
    var link = sourceCards[i].closest('a') || sourceCards[i];
    var href = link.href;
    if (href && href.indexOf('perplexity.ai') === -1) {
      citations.push({
        index: citations.length + 1,
        url: href,
        title: link.textContent.trim() || link.title || this._getDomain(href)
      });
    }
  }

  // 备选：查找所有编号引用
  if (citations.length === 0) {
    var allRefs = document.querySelectorAll('a[href^="http"]');
    for (var j = 0; j < allRefs.length; j++) {
      var a = allRefs[j];
      if (a.href.indexOf('perplexity.ai') === -1 &&
          a.closest('[class*="prose"], [class*="answer"], [class*="response"]')) {
        citations.push({
          index: citations.length + 1,
          url: a.href,
          title: a.textContent.trim() || this._getDomain(a.href)
        });
      }
    }
  }

  return this._dedup(citations);
};

window.GEO.PerplexityAdapter.prototype.isResponseComplete = function() {
  var loading = this._queryFirst([
    '[class*="cursor-blink"]',
    '[class*="animate-pulse"]',
    '[class*="loading"]',
    '[class*="streaming"]'
  ]);
  return !loading;
};

window.GEO.PerplexityAdapter.prototype._getDomain = function(url) {
  try {
    return new URL(url).hostname;
  } catch (e) {
    return url;
  }
};
