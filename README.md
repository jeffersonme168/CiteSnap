# CiteSnap

一键提取 AI 搜索引擎回答中的**搜索关键词**和**引用文章链接**，用于 GEO（Generative Engine Optimization）分析。

## 解决什么问题

当你使用 AI 搜索引擎（豆包、DeepSeek 等）进行搜索时，AI 会联网搜索关键词并引用多篇文章来生成回答。但这些引用链接**无法直接批量复制**，只能逐个手动打开、复制 URL——这对需要大量分析 AI 搜索引用数据的 GEO 从业者来说极其低效。

CiteSnap 让你**一键提取**所有搜索关键词和引用链接，并支持导出为结构化数据。

## 支持平台

| 平台 | 状态 | 说明 |
|------|------|------|
| 豆包 (Doubao) | ✅ 已适配 | 自动展开折叠的思考框 |
| DeepSeek | ✅ 已适配 | 支持聊天页和分享页 |
| Perplexity | ✅ 已适配 | 多轮对话，data-pplx-citation-url 提取 |
| 千问 (Qianwen) | ✅ 已适配 | 从嵌入式 JSON 提取视频/笔记引用 |
| Kimi | 🚧 占位 | 需根据实际 DOM 调试 |
| 秘塔搜索 (Metaso) | 🚧 占位 | 需根据实际 DOM 调试 |

> 标记为"占位"的平台已有基础适配器代码，需要在浏览器中配合 DevTools 校准 DOM 选择器。欢迎贡献 PR。

## 功能特性

- **多轮对话提取** — 正确配对每一轮用户提问与对应的搜索关键词、引用链接
- **多格式导出** — CSV / JSON / Markdown 一键下载
- **实时检测** — MutationObserver 监听页面变化，支持流式输出完成后自动提取
- **SPA 导航感知** — 单页应用内切换对话时自动重新提取
- **手动刷新** — 随时点击刷新按钮重新提取最新内容

## 安装

### 从源码安装（开发者模式）

1. 克隆仓库：
   ```bash
   git clone https://github.com/jeffersonme168/CiteSnap.git
   ```

2. 打开浏览器扩展管理页面：
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`

3. 开启「开发者模式」

4. 点击「加载已解压的扩展程序」，选择 `CiteSnap` 目录

5. 访问支持的 AI 搜索引擎页面，点击扩展图标即可使用

## 使用方法

1. 在支持的 AI 搜索引擎中进行一次带联网搜索的对话
2. 等待 AI 回答完毕
3. 点击浏览器工具栏中的 CiteSnap 图标
4. 查看提取结果 — 每轮对话的提问、搜索关键词、引用链接
5. 点击 CSV / JSON / Markdown 按钮导出数据

## 导出数据格式

### JSON 结构

```json
{
  "platform": "deepseek",
  "conversations": [
    {
      "query": "用户的提问内容",
      "searchKeywords": ["搜索到 32 个网页"],
      "citations": [
        {
          "index": 1,
          "url": "https://example.com/article",
          "title": "文章标题"
        }
      ],
      "hasSearch": true
    }
  ],
  "pageUrl": "https://chat.deepseek.com/...",
  "timestamp": "2026-06-09T12:00:00.000Z"
}
```

### CSV 格式

```
轮次, 用户提问, 搜索关键词, 引用序号, 引用标题, 引用URL
1, "问题内容", "关键词1; 关键词2", 1, "标题", https://...
```

## 项目结构

```
CiteSnap/
├── manifest.json              # Chrome Extension MV3 配置
├── popup/
│   ├── popup.html             # 弹出面板 UI
│   ├── popup.css              # 样式
│   └── popup.js               # 面板逻辑与导出功能
├── content/
│   ├── main.js                # 内容脚本入口：平台检测、消息监听
│   ├── observer.js            # MutationObserver 防抖封装
│   └── adapters/
│       ├── base.js            # 适配器基类（通用工具方法）
│       ├── doubao.js          # 豆包适配器
│       ├── deepseek.js        # DeepSeek 适配器
│       ├── perplexity.js      # Perplexity 适配器
│       ├── qianwen.js         # 千问适配器
│       ├── kimi.js            # Kimi 适配器（待完善）
│       └── metaso.js          # 秘塔搜索适配器（待完善）
├── shared/
│   ├── data-model.js          # 统一数据结构定义
│   └── export.js              # CSV/JSON/Markdown 导出工具
├── background/
│   └── service-worker.js      # 后台服务（极简）
└── icons/                     # 扩展图标
```

## 架构设计

### 适配器模式

每个 AI 平台实现独立的适配器，继承 `BaseAdapter` 并实现平台特定的 DOM 解析逻辑：

```javascript
window.GEO.YourAdapter.prototype.extract = function() {
  // 1. 遍历消息容器
  // 2. 区分用户消息和 AI 回复
  // 3. 从 AI 回复中提取搜索关键词和引用链接
  // 4. 返回结构化的 conversations 数组
};
```

### 新增平台适配

1. 在 `content/adapters/` 下新建适配器文件
2. 实现 `matches(url)` 静态方法和 `extract()` 实例方法
3. 在 `content/main.js` 的适配器注册表中添加
4. 在 `manifest.json` 的 `matches` 和 `host_permissions` 中添加域名

## 应用场景

- **GEO 分析** — 批量收集 AI 搜索引擎的引用数据，分析哪些网站/内容被 AI 优先引用
- **竞品监控** — 追踪竞品在 AI 搜索结果中的曝光情况
- **内容优化** — 了解 AI 搜索的关键词偏好，优化内容以获得更多 AI 引用
- **学术研究** — 研究 AI 搜索引擎的信息来源偏向性

## 技术栈

- Chrome Extension Manifest V3
- 原生 JavaScript（无框架依赖，零构建步骤）
- MutationObserver API
- Chrome Storage API / Tabs API

## 贡献指南

欢迎提交 PR，特别是以下方面：

1. **完善平台适配器** — Perplexity、Kimi、秘塔搜索的 DOM 选择器校准
2. **新增平台支持** — ChatGPT Search、Google AI Overview 等
3. **Bug 修复** — 各平台 DOM 结构更新后的选择器修复

### 调试适配器

1. 打开目标 AI 搜索引擎，进行一次联网搜索
2. 按 F12 打开 DevTools
3. 在 Console 中执行 `document.querySelectorAll('.your-selector')` 验证选择器
4. 修改对应的适配器文件，重新加载扩展测试

> 注意：AI 平台的 CSS class 名可能使用哈希值（如 `._04ab7b1`），这些可能在平台更新后变化。适配器应尽量提供多个备选策略。

## 许可证

MIT

## 致谢

- 灵感来源于 GEO（Generative Engine Optimization）领域的实际分析需求
