window.GEO = window.GEO || {};

window.GEO.Observer = function(adapter) {
  this.adapter = adapter;
  this.observer = null;
  this.debounceTimer = null;
  this.lastResult = null;
  this.DEBOUNCE_MS = 1500;
};

window.GEO.Observer.prototype.start = function() {
  var self = this;
  var target = this.adapter.getObserverTarget();
  if (!target) return;

  this.observer = new MutationObserver(function(mutations) {
    self._onMutations(mutations);
  });

  this.observer.observe(target, {
    childList: true,
    subtree: true,
    characterData: true
  });
};

window.GEO.Observer.prototype._onMutations = function(mutations) {
  var self = this;
  clearTimeout(this.debounceTimer);
  this.debounceTimer = setTimeout(function() {
    if (self.adapter.isResponseComplete()) {
      self._doExtraction();
    }
  }, this.DEBOUNCE_MS);
};

window.GEO.Observer.prototype._doExtraction = function() {
  var result = this.adapter.extract();
  this.lastResult = result;
  if (chrome.storage && chrome.storage.session) {
    chrome.storage.session.set({ lastExtraction: result });
  }
};

window.GEO.Observer.prototype.stop = function() {
  if (this.observer) {
    this.observer.disconnect();
    this.observer = null;
  }
  clearTimeout(this.debounceTimer);
};
