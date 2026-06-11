(function() {
  'use strict';

  var url = window.location.href;

  // 适配器注册表
  var adapters = [
    window.GEO.DoubaoAdapter,
    window.GEO.DeepSeekAdapter,
    window.GEO.PerplexityAdapter,
    window.GEO.KimiAdapter,
    window.GEO.MetasoAdapter,
    window.GEO.QianwenAdapter,
    window.GEO.YuanbaoAdapter,
    window.GEO.ChatGPTAdapter,
    window.GEO.YiyanAdapter
  ];

  // 匹配当前平台
  var AdapterClass = null;
  for (var i = 0; i < adapters.length; i++) {
    if (adapters[i].matches(url)) {
      AdapterClass = adapters[i];
      break;
    }
  }

  if (!AdapterClass) {
    console.log('[CiteSnap] No adapter found for:', url);
    return;
  }

  var adapter = new AdapterClass();
  console.log('[CiteSnap] Loaded adapter:', adapter.platformId);

  // 启动 MutationObserver
  var observer = new window.GEO.Observer(adapter);
  observer.start();

  // 初始提取（延迟等待页面完全渲染）
  setTimeout(function() {
    if (adapter.isResponseComplete()) {
      var result = adapter.extract();
      if (chrome.storage && chrome.storage.session) {
        chrome.storage.session.set({ lastExtraction: result });
      }
      console.log('[CiteSnap] Initial extraction:', result);
    }
  }, 3000);

  // SPA 导航检测（URL 变化但不刷新页面）
  var lastUrl = location.href;
  var navObserver = new MutationObserver(function() {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      console.log('[CiteSnap] SPA navigation detected:', lastUrl);
      // 等待新内容加载后重新提取
      setTimeout(function() {
        if (adapter.isResponseComplete()) {
          var result = adapter.extract();
          if (chrome.storage && chrome.storage.session) {
            chrome.storage.session.set({ lastExtraction: result });
          }
        }
      }, 3000);
    }
  });
  navObserver.observe(document.body, { childList: true, subtree: true });

  // 监听来自 popup 的消息
  chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
    if (msg.action === 'extract') {
      // 先触发展开（如果适配器支持）
      if (adapter._expandThinkingBoxes) {
        adapter._expandThinkingBoxes();
      }
      if (adapter._expandReferencePanels) {
        adapter._expandReferencePanels();
      }
      // 延迟 800ms 等待展开动画和 DOM 更新完成后再提取
      setTimeout(function() {
        var result = adapter.extract();
        if (chrome.storage && chrome.storage.session) {
          chrome.storage.session.set({ lastExtraction: result });
        }
        console.log('[CiteSnap] Manual extraction:', result);
        sendResponse(result);
      }, 800);
    }
    if (msg.action === 'getStatus') {
      sendResponse({
        platform: adapter.platformId,
        ready: adapter.isResponseComplete()
      });
    }
    return true; // 异步响应
  });

})();
