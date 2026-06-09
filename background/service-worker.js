// GEO Extractor - Background Service Worker (Minimal)

chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
  if (msg.action === 'updateBadge') {
    var count = msg.count || 0;
    chrome.action.setBadgeText({
      text: count > 0 ? String(count) : '',
      tabId: sender.tab ? sender.tab.id : undefined
    });
    chrome.action.setBadgeBackgroundColor({ color: '#4A90D9' });
  }
});
