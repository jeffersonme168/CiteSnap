window.GEO = window.GEO || {};

window.GEO.MetasoAdapter = function() {
  window.GEO.BaseAdapter.call(this);
  this.platformId = 'metaso';
};

window.GEO.MetasoAdapter.prototype = Object.create(window.GEO.BaseAdapter.prototype);
window.GEO.MetasoAdapter.prototype.constructor = window.GEO.MetasoAdapter;

window.GEO.MetasoAdapter.matches = function(url) {
  return /metaso\.cn/.test(url);
};

window.GEO.MetasoAdapter.prototype.extractQuery = function() {
  // 秘塔搜索的搜索框或页面标题
  var el = this._queryFirst([
    'input[type="text"]',
    'input[type="search"]',
    'textarea',
    '[class*="query"]',
    '[class*="question"]',
    'h1'
  ]);

  if (el) {
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      return (el.value || '').trim();
    }
    return el.textContent.trim();
  }

  // 从页面 title 提取
  var title = document.title;
  if (title && title !== '秘塔AI搜索') {
    return title.replace(/\s*[-–—]\s*秘塔.*$/, '').trim();
  }
  return '';
};

window.GEO.MetasoAdapter.prototype.extractKeywords = function() {
  var keywords = [];

  // 秘塔会显示搜索使用的关键词
  var searchEls = this._queryAll([
    '[class*="search-keyword"]',
    '[class*="search-query"]',
    '[class*="query-tag"]',
    '[class*="related-query"]'
  ]);

  for (var i = 0; i < searchEls.length; i++) {
    var text = searchEls[i].textContent.trim();
    if (text && text.length < 100 && keywords.indexOf(text) === -1) {
      keywords.push(text);
    }
  }

  return keywords;
};

window.GEO.MetasoAdapter.prototype.extractCitations = function() {
  var citations = [];

  // 秘塔搜索的参考来源面板
  var refLinks = this._queryAll([
    '[class*="source"] a[href^="http"]',
    '[class*="reference"] a[href^="http"]',
    '[class*="citation"] a[href^="http"]',
    '[class*="result-item"] a[href^="http"]'
  ]);

  for (var i = 0; i < refLinks.length; i++) {
    var link = refLinks[i];
    var href = link.href;
    if (href && href.indexOf('metaso.cn') === -1) {
      citations.push({
        index: citations.length + 1,
        url: href,
        title: link.textContent.trim() || link.title || this._getDomain(href)
      });
    }
  }

  // 备选：页面中所有外链
  if (citations.length === 0) {
    var mainContent = this._queryFirst([
      '[class*="answer"]',
      '[class*="response"]',
      '[class*="result"]',
      'main',
      'article'
    ]);

    var container = mainContent || document.body;
    var links = container.querySelectorAll('a[href^="http"]');
    for (var j = 0; j < links.length; j++) {
      var a = links[j];
      if (a.href.indexOf('metaso.cn') === -1) {
        citations.push({
          index: citations.length + 1,
          url: a.href,
          title: a.textContent.trim() || a.title || this._getDomain(a.href)
        });
      }
    }
  }

  return this._dedup(citations);
};

window.GEO.MetasoAdapter.prototype.isResponseComplete = function() {
  var loading = this._queryFirst([
    '[class*="loading"]',
    '[class*="typing"]',
    '[class*="generating"]'
  ]);
  return !loading;
};

window.GEO.MetasoAdapter.prototype._getDomain = function(url) {
  try {
    return new URL(url).hostname;
  } catch (e) {
    return url;
  }
};
