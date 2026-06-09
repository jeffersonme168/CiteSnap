window.GEO = window.GEO || {};

window.GEO.BaseAdapter = function() {
  this.platformId = 'unknown';
  this.result = null;
};

window.GEO.BaseAdapter.matches = function(url) {
  return false;
};

window.GEO.BaseAdapter.prototype.extract = function() {
  this.result = window.GEO.createResult(this.platformId);

  // 默认实现：单轮对话模式（子类可覆盖为多轮）
  var query = this.extractQuery();
  var keywords = this.extractKeywords();
  var citations = this.extractCitations();

  if (query || keywords.length > 0 || citations.length > 0) {
    var conv = window.GEO.createConversation(query);
    conv.searchKeywords = keywords;
    conv.citations = citations;
    conv.hasSearch = keywords.length > 0 || citations.length > 0;
    this.result.conversations.push(conv);
  }

  return this.result;
};

window.GEO.BaseAdapter.prototype.extractQuery = function() {
  return '';
};

window.GEO.BaseAdapter.prototype.extractKeywords = function() {
  return [];
};

window.GEO.BaseAdapter.prototype.extractCitations = function() {
  return [];
};

window.GEO.BaseAdapter.prototype.getObserverTarget = function() {
  return document.body;
};

window.GEO.BaseAdapter.prototype.isResponseComplete = function() {
  return true;
};

// Utility: try multiple selectors, return first match
window.GEO.BaseAdapter.prototype._queryFirst = function(selectors) {
  for (var i = 0; i < selectors.length; i++) {
    try {
      var el = document.querySelector(selectors[i]);
      if (el) return el;
    } catch (e) {}
  }
  return null;
};

// Utility: try multiple selectors, return first non-empty NodeList
window.GEO.BaseAdapter.prototype._queryAll = function(selectors) {
  for (var i = 0; i < selectors.length; i++) {
    try {
      var els = document.querySelectorAll(selectors[i]);
      if (els.length > 0) return els;
    } catch (e) {}
  }
  return [];
};

// Utility: deduplicate citations by URL
window.GEO.BaseAdapter.prototype._dedup = function(citations) {
  var seen = {};
  var result = [];
  for (var i = 0; i < citations.length; i++) {
    var url = citations[i].url;
    if (!seen[url]) {
      seen[url] = true;
      result.push(citations[i]);
    }
  }
  // Re-index
  for (var j = 0; j < result.length; j++) {
    result[j].index = j + 1;
  }
  return result;
};
