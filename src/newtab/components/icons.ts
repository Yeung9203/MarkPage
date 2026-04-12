/**
 * SVG 图标集合
 *
 * 所有 UI 中使用的 SVG 图标，以函数形式提供，
 * 返回 SVGElement 或 innerHTML 字符串。
 *
 * 使用示例：
 *   import { iconSearch, iconChevron } from './icons';
 *   const svg = iconSearch();
 */

/**
 * 创建 SVG 元素的通用方法
 *
 * @param innerHTML - SVG 内部 HTML
 * @param size - 图标尺寸（默认 16）
 * @returns SVG HTML 字符串
 */
function svg(innerHTML: string, size = 16): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${innerHTML}</svg>`;
}

/** 搜索图标 */
export const iconSearch = (size = 16) => svg(
  '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  size
);

/** 全局/地球图标 */
export const iconGlobe = (size = 16) => svg(
  '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  size
);

/** 星标图标（描边） */
export const iconStar = (size = 16) => svg(
  '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  size
);

/** 星标图标（填充：已标记常用态） */
export const iconStarFilled = (size = 16) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;

/** 时钟图标 */
export const iconClock = (size = 16) => svg(
  '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  size
);

/** 设置图标 */
export const iconSettings = (size = 16) => svg(
  '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  size
);

/** AI/机器人图标 */
export const iconAI = (size = 16) => svg(
  '<path d="M12 2a4 4 0 0 1 4 4v2a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z"/><path d="M16 14a4 4 0 0 0-8 0v4a4 4 0 0 0 8 0v-4z"/>',
  size
);

/** 折叠箭头图标 */
export const iconChevron = (size = 16) => svg(
  '<polyline points="6 9 12 15 18 9"/>',
  size
);

/** 三点菜单图标 */
export const iconMore = (size = 14) => svg(
  '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  size
);

/** 关闭图标 */
export const iconClose = (size = 16) => svg(
  '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  size
);

/** 太阳图标（亮色主题） */
export const iconSun = (size = 16) => svg(
  '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
  size
);

/** 月亮图标（暗色主题） */
export const iconMoon = (size = 16) => svg(
  '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  size
);

/** 外部链接图标 */
export const iconExternalLink = (size = 14) => svg(
  '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
  size
);

/** 复制图标 */
export const iconCopy = (size = 14) => svg(
  '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  size
);

/** 编辑图标 */
export const iconEdit = (size = 14) => svg(
  '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
  size
);

/** 移动图标 */
export const iconMove = (size = 14) => svg(
  '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  size
);

/** 删除图标 */
export const iconTrash = (size = 14) => svg(
  '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  size
);

/** 播放图标 */
export const iconPlay = (size = 16) => svg(
  '<polygon points="5 3 19 12 5 21 5 3"/>',
  size
);

/** 文档图标 */
export const iconDoc = (size = 16) => svg(
  '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
  size
);

/** 开发工具图标 */
export const iconDev = (size = 16) => svg(
  '<rect x="3" y="3" width="7" height="7" rx="1.5" fill="#3b82f620" stroke="#3b82f6"/><rect x="14" y="3" width="7" height="7" rx="1.5" fill="none"/><rect x="3" y="14" width="7" height="7" rx="1.5" fill="none"/><rect x="14" y="14" width="7" height="7" rx="1.5" fill="none"/>',
  size
);

/** 聊天图标 */
export const iconChat = (size = 16) => svg(
  '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  size
);

/** 显示器图标 */
export const iconMonitor = (size = 16) => svg(
  '<rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
  size
);

/** 笑脸图标 */
export const iconSmile = (size = 16) => svg(
  '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>',
  size
);

/** 信息图标 */
export const iconInfo = (size = 16) => svg(
  '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
  size
);

/** AI 闪光图标（用于 AI 建议标识） */
export const iconSparkle = (size = 12) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2zm6 10l1 2.8L22 16l-2.8 1L18 20l-1-3-3-1 3-1 1-3z"/></svg>`;
