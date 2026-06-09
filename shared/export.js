window.GEO = window.GEO || {};

window.GEO.exportCSV = function(data) {
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
        '',
        '',
        ''
      ]);
    }
  });

  var csv = '# 平台: ' + data.platform + '\n';
  csv += '# 页面URL: ' + data.pageUrl + '\n';
  csv += '# 提取时间: ' + data.timestamp + '\n';
  csv += '# 有效对话轮次: ' + data.conversations.length + '\n\n';
  csv += rows.map(function(r) { return r.join(','); }).join('\n');

  return BOM + csv;
};

window.GEO.exportJSON = function(data) {
  return JSON.stringify(data, null, 2);
};

window.GEO.exportMarkdown = function(data) {
  var md = '# CiteSnap Extraction: ' + data.platform + '\n\n';
  md += '**页面URL:** ' + data.pageUrl + '\n\n';
  md += '**提取时间:** ' + data.timestamp + '\n\n';
  md += '**有效对话轮次:** ' + data.conversations.length + '\n\n';
  md += '---\n\n';

  data.conversations.forEach(function(conv, idx) {
    md += '## 第 ' + (idx + 1) + ' 轮\n\n';
    md += '**提问:** ' + conv.query + '\n\n';
    md += '**搜索关键词:** ' + conv.searchKeywords.join(' | ') + '\n\n';

    if (conv.citations.length > 0) {
      md += '**引用来源 (' + conv.citations.length + '):**\n\n';
      md += '| 序号 | 标题 | URL |\n';
      md += '|------|------|-----|\n';
      conv.citations.forEach(function(c) {
        md += '| ' + c.index + ' | ' + c.title + ' | ' + c.url + ' |\n';
      });
    }
    md += '\n---\n\n';
  });

  return md;
};
