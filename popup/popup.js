document.addEventListener('DOMContentLoaded', async function() {
  var statusSection = document.getElementById('status-section');
  var resultsSection = document.getElementById('results-section');
  var actionsSection = document.getElementById('actions-section');
  var emptyState = document.getElementById('empty-state');
  var unsupportedSection = document.getElementById('unsupported-section');

  var currentData = null;

  var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  var tab = tabs[0];

  if (!tab) {
    showUnsupported();
    return;
  }

  try {
    var response = await chrome.tabs.sendMessage(tab.id, { action: 'extract' });
    if (response) {
      currentData = response;
      if (response.conversations && response.conversations.length > 0) {
        renderResults(response);
      } else {
        showEmpty();
      }
    } else {
      showUnsupported();
    }
  } catch (e) {
    showUnsupported();
  }

  function renderResults(data) {
    statusSection.classList.add('hidden');
    unsupportedSection.classList.add('hidden');
    emptyState.classList.add('hidden');
    resultsSection.classList.remove('hidden');
    actionsSection.classList.remove('hidden');

    var badge = document.getElementById('platform-badge');
    badge.textContent = getPlatformName(data.platform);
    badge.classList.remove('hidden');

    var container = document.getElementById('conversations-container');
    container.innerHTML = '';

    data.conversations.forEach(function(conv, idx) {
      var turnEl = document.createElement('div');
      turnEl.className = 'conversation-turn';

      // 轮次标题
      var header = document.createElement('div');
      header.className = 'turn-header';
      header.innerHTML = '<span class="turn-number">第 ' + (idx + 1) + ' 轮</span>' +
        '<span class="turn-stats">' + conv.searchKeywords.length + ' 关键词 · ' + conv.citations.length + ' 引用</span>';
      turnEl.appendChild(header);

      // 用户提问
      var queryEl = document.createElement('div');
      queryEl.className = 'turn-query';
      queryEl.textContent = conv.query;
      turnEl.appendChild(queryEl);

      // 搜索关键词
      if (conv.searchKeywords.length > 0) {
        var kwBox = document.createElement('div');
        kwBox.className = 'keywords-box';
        conv.searchKeywords.forEach(function(kw) {
          var tag = document.createElement('span');
          tag.className = 'keyword-tag';
          tag.textContent = kw;
          kwBox.appendChild(tag);
        });
        turnEl.appendChild(kwBox);
      }

      // 引用链接列表
      if (conv.citations.length > 0) {
        var citeList = document.createElement('ul');
        citeList.className = 'citations-list';
        conv.citations.forEach(function(c) {
          var li = document.createElement('li');
          li.innerHTML =
            '<span class="cite-index">[' + c.index + ']</span>' +
            '<span class="cite-info">' +
              '<span class="cite-title">' + escapeHtml(c.title) + '</span>' +
              '<span class="cite-url"><a href="' + escapeHtml(c.url) + '" target="_blank">' + escapeHtml(truncateUrl(c.url)) + '</a></span>' +
            '</span>';
          citeList.appendChild(li);
        });
        turnEl.appendChild(citeList);
      }

      container.appendChild(turnEl);
    });
  }

  function showEmpty() {
    statusSection.classList.add('hidden');
    unsupportedSection.classList.add('hidden');
    emptyState.classList.remove('hidden');

    var badge = document.getElementById('platform-badge');
    if (currentData && currentData.platform) {
      badge.textContent = getPlatformName(currentData.platform);
      badge.classList.remove('hidden');
    }
  }

  function showUnsupported() {
    statusSection.classList.add('hidden');
    unsupportedSection.classList.remove('hidden');
  }

  function getPlatformName(id) {
    var names = {
      'doubao': '豆包',
      'deepseek': 'DeepSeek',
      'perplexity': 'Perplexity',
      'kimi': 'Kimi',
      'metaso': '秘塔搜索'
    };
    return names[id] || id;
  }

  // 刷新
  document.getElementById('btn-refresh').addEventListener('click', async function() {
    try {
      var response = await chrome.tabs.sendMessage(tab.id, { action: 'extract' });
      if (response) {
        currentData = response;
        if (response.conversations && response.conversations.length > 0) {
          renderResults(response);
        } else {
          showEmpty();
        }
      }
    } catch (e) {
      console.error('[GEO] Refresh failed:', e);
    }
  });

  // 导出
  document.getElementById('btn-csv').addEventListener('click', function() {
    if (currentData) downloadFile(exportCSV(currentData), 'citesnap-' + currentData.platform + '.csv', 'text/csv');
  });
  document.getElementById('btn-json').addEventListener('click', function() {
    if (currentData) downloadFile(exportJSON(currentData), 'citesnap-' + currentData.platform + '.json', 'application/json');
  });
  document.getElementById('btn-md').addEventListener('click', function() {
    if (currentData) downloadFile(exportMD(currentData), 'citesnap-' + currentData.platform + '.md', 'text/markdown');
  });

  // --- Export functions ---

  function exportCSV(data) {
    var BOM = '\uFEFF';
    var rows = [['轮次', '用户提问', '搜索关键词', '引用序号', '引用标题', '引用URL']];
    data.conversations.forEach(function(conv, convIdx) {
      if (conv.citations.length > 0) {
        conv.citations.forEach(function(c) {
          rows.push([
            convIdx + 1,
            '"' + conv.query.replace(/"/g, '""') + '"',
            '"' + conv.searchKeywords.join('; ').replace(/"/g, '""') + '"',
            c.index,
            '"' + c.title.replace(/"/g, '""') + '"',
            c.url
          ]);
        });
      } else {
        rows.push([
          convIdx + 1,
          '"' + conv.query.replace(/"/g, '""') + '"',
          '"' + conv.searchKeywords.join('; ').replace(/"/g, '""') + '"',
          '', '', ''
        ]);
      }
    });
    var csv = '# 平台: ' + data.platform + '\n';
    csv += '# 页面URL: ' + data.pageUrl + '\n';
    csv += '# 提取时间: ' + data.timestamp + '\n\n';
    csv += rows.map(function(r) { return r.join(','); }).join('\n');
    return BOM + csv;
  }

  function exportJSON(data) {
    return JSON.stringify(data, null, 2);
  }

  function exportMD(data) {
    var md = '# CiteSnap Extraction: ' + data.platform + '\n\n';
    md += '**页面URL:** ' + data.pageUrl + '\n\n';
    md += '**提取时间:** ' + data.timestamp + '\n\n';
    md += '---\n\n';
    data.conversations.forEach(function(conv, idx) {
      md += '## 第 ' + (idx + 1) + ' 轮\n\n';
      md += '**提问:** ' + conv.query + '\n\n';
      md += '**搜索关键词:** ' + conv.searchKeywords.join(' | ') + '\n\n';
      if (conv.citations.length > 0) {
        md += '**引用来源 (' + conv.citations.length + '):**\n\n';
        conv.citations.forEach(function(c) {
          md += c.index + '. [' + c.title + '](' + c.url + ')\n';
        });
      }
      md += '\n---\n\n';
    });
    return md;
  }

  // --- Utilities ---

  function downloadFile(content, filename, mimeType) {
    var blob = new Blob([content], { type: mimeType });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function truncateUrl(url) {
    if (url.length > 60) return url.substring(0, 57) + '...';
    return url;
  }
});
