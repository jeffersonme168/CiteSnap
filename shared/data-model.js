/**
 * GEO Extractor - Data Model
 *
 * ExtractionResult {
 *   platform: string              - 平台标识
 *   conversations: Conversation[] - 多轮对话列表（一一配对）
 *   pageUrl: string               - 当前页面 URL
 *   timestamp: string             - 提取时间 ISO 格式
 * }
 *
 * Conversation {
 *   query: string                 - 用户原始提问
 *   searchKeywords: string[]      - AI 搜索关键词（无搜索则为空数组）
 *   citations: Citation[]         - 引用链接列表（无引用则为空数组）
 *   hasSearch: boolean            - 是否触发了联网搜索
 * }
 *
 * Citation {
 *   index: number                 - 序号 (1-based)
 *   url: string                   - 链接地址
 *   title: string                 - 标题
 * }
 */

window.GEO = window.GEO || {};

window.GEO.createResult = function(platform) {
  return {
    platform: platform || 'unknown',
    conversations: [],
    pageUrl: window.location.href,
    timestamp: new Date().toISOString()
  };
};

window.GEO.createConversation = function(query) {
  return {
    query: query || '',
    searchKeywords: [],
    citations: [],
    hasSearch: false
  };
};
