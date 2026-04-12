/**
 * 分类图标系统
 *
 * 基于关键词匹配为书签分类推荐 SVG 图标，
 * 用户可手动覆盖，自定义映射存入 localStorage
 *
 * 使用示例：
 *   import { getCategoryIcon, setCustomIcon, getAllIcons } from './category-icons';
 *   const iconSvg = getCategoryIcon('开发工具'); // 返回 SVG 字符串
 */

/**
 * 创建 SVG 图标的通用方法
 */
function svg(inner: string, size = 16): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

/**
 * 图标库 — 每个图标一个 key，对应一个 SVG 渲染函数
 *
 * 覆盖 30+ 常见分类场景
 */
export const ICON_LIBRARY: Record<string, (size?: number) => string> = {
  // 工作 & 效率
  code: (s = 16) => svg('<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>', s),
  terminal: (s = 16) => svg('<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>', s),
  git: (s = 16) => svg('<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/>', s),
  bug: (s = 16) => svg('<rect x="8" y="6" width="8" height="14" rx="4"/><path d="M19 7l-3 2"/><path d="M5 7l3 2"/><path d="M19 13h-3"/><path d="M8 13H5"/><path d="M19 19l-3-2"/><path d="M5 19l3-2"/>', s),
  document: (s = 16) => svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>', s),
  book: (s = 16) => svg('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>', s),
  briefcase: (s = 16) => svg('<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>', s),
  clipboard: (s = 16) => svg('<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/>', s),

  // AI & 智能
  cpu: (s = 16) => svg('<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/>', s),
  sparkles: (s = 16) => svg('<path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"/><path d="M19 14l.75 2.25L22 17l-2.25.75L19 20l-.75-2.25L16 17l2.25-.75L19 14z"/>', s),
  bot: (s = 16) => svg('<rect x="3" y="7" width="18" height="12" rx="2"/><circle cx="8.5" cy="13" r="1"/><circle cx="15.5" cy="13" r="1"/><path d="M12 2v5"/><circle cx="12" cy="2" r="1"/>', s),

  // 设计
  design: (s = 16) => svg('<path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/>', s),
  palette: (s = 16) => svg('<circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>', s),
  image: (s = 16) => svg('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>', s),
  figma: (s = 16) => svg('<path d="M5 5.5A3.5 3.5 0 0 1 8.5 2H12v7H8.5A3.5 3.5 0 0 1 5 5.5z"/><path d="M12 2h3.5a3.5 3.5 0 1 1 0 7H12V2z"/><path d="M12 12.5a3.5 3.5 0 1 1 7 0 3.5 3.5 0 1 1-7 0z"/><path d="M5 19.5A3.5 3.5 0 0 1 8.5 16H12v3.5a3.5 3.5 0 1 1-7 0z"/><path d="M5 12.5A3.5 3.5 0 0 1 8.5 9H12v7H8.5A3.5 3.5 0 0 1 5 12.5z"/>', s),

  // 社交 & 通讯
  chat: (s = 16) => svg('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>', s),
  mail: (s = 16) => svg('<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>', s),
  users: (s = 16) => svg('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>', s),
  phone: (s = 16) => svg('<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>', s),

  // 媒体 & 娱乐
  video: (s = 16) => svg('<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>', s),
  music: (s = 16) => svg('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>', s),
  film: (s = 16) => svg('<rect x="2" y="2" width="20" height="20" rx="2"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/>', s),
  gamepad: (s = 16) => svg('<line x1="6" y1="11" x2="10" y2="11"/><line x1="8" y1="9" x2="8" y2="13"/><line x1="15" y1="12" x2="15.01" y2="12"/><line x1="18" y1="10" x2="18.01" y2="10"/><path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z"/>', s),
  headphones: (s = 16) => svg('<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>', s),

  // 信息 & 学习
  news: (s = 16) => svg('<path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6z"/>', s),
  education: (s = 16) => svg('<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 2 2 3 6 3s6-1 6-3v-5"/>', s),
  bookmark: (s = 16) => svg('<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>', s),
  graduation: (s = 16) => svg('<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>', s),

  // 生活 & 购物
  shopping: (s = 16) => svg('<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>', s),
  home: (s = 16) => svg('<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>', s),
  food: (s = 16) => svg('<path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>', s),
  heart: (s = 16) => svg('<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>', s),

  // 旅行 & 地点
  plane: (s = 16) => svg('<path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>', s),
  map: (s = 16) => svg('<polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>', s),
  location: (s = 16) => svg('<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>', s),

  // 金融 & 工作
  money: (s = 16) => svg('<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>', s),
  chart: (s = 16) => svg('<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>', s),

  // 工具
  tool: (s = 16) => svg('<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>', s),
  settings: (s = 16) => svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>', s),
  folder: (s = 16) => svg('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>', s),
  archive: (s = 16) => svg('<polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/>', s),
  star: (s = 16) => svg('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>', s),
  bell: (s = 16) => svg('<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>', s),
  globe: (s = 16) => svg('<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>', s),
};

/**
 * 关键词 → 图标 key 映射表
 *
 * 支持中英文关键词，命中即匹配
 */
const KEYWORD_MAP: { keywords: string[]; icon: string }[] = [
  // AI 相关（优先级最高）
  { keywords: ['ai', '人工智能', '智能', 'gpt', 'llm', 'copilot'], icon: 'sparkles' },
  { keywords: ['chatbot', '对话', 'chat'], icon: 'bot' },

  // 开发
  { keywords: ['code', 'coding', '编程', '开发', 'dev', 'develop', 'programming'], icon: 'code' },
  { keywords: ['terminal', 'cli', 'shell', '命令行'], icon: 'terminal' },
  { keywords: ['git', 'github', 'gitlab', 'bitbucket'], icon: 'git' },
  { keywords: ['bug', 'debug', 'issue', '问题'], icon: 'bug' },

  // 设计
  { keywords: ['design', '设计', 'ui', 'ux', 'user experience', 'user interface'], icon: 'design' },
  { keywords: ['palette', 'color', '配色', '调色'], icon: 'palette' },
  { keywords: ['image', 'photo', '图片', '图像', 'picture'], icon: 'image' },
  { keywords: ['figma'], icon: 'figma' },

  // 文档 & 学习
  { keywords: ['doc', 'document', '文档', 'manual', '手册', 'markdown'], icon: 'document' },
  { keywords: ['book', '书', 'reading', '阅读', 'library'], icon: 'book' },
  { keywords: ['learn', '学习', 'course', 'tutorial', 'education', '教程'], icon: 'education' },
  { keywords: ['school', '学校', 'college', 'university', '大学'], icon: 'graduation' },
  { keywords: ['bookmark', '收藏', 'favorite', 'fav'], icon: 'bookmark' },

  // 工作 & 效率
  { keywords: ['work', '工作', 'job', 'career', 'office'], icon: 'briefcase' },
  { keywords: ['product', '产品', 'project', '项目'], icon: 'clipboard' },
  { keywords: ['news', '新闻', '资讯', 'blog', '博客'], icon: 'news' },

  // 社交 & 通讯
  { keywords: ['social', '社交', 'social media', '社交媒体'], icon: 'users' },
  { keywords: ['mail', '邮件', 'email', 'gmail', '邮箱'], icon: 'mail' },
  { keywords: ['message', '消息', 'msg', 'im'], icon: 'chat' },
  { keywords: ['phone', 'tel', '电话'], icon: 'phone' },

  // 媒体 & 娱乐
  { keywords: ['video', '视频', 'youtube', 'bilibili', '影片', '影音'], icon: 'video' },
  { keywords: ['movie', '电影', 'film', '影视'], icon: 'film' },
  { keywords: ['music', '音乐', '歌曲', 'song', 'spotify'], icon: 'music' },
  { keywords: ['game', '游戏', 'gaming', 'gamepad', 'steam'], icon: 'gamepad' },
  { keywords: ['podcast', '播客', 'audio', '音频'], icon: 'headphones' },
  { keywords: ['entertainment', '娱乐', 'fun'], icon: 'film' },

  // 生活 & 购物
  { keywords: ['shop', '购物', 'shopping', 'store', '商店', 'taobao', 'amazon'], icon: 'shopping' },
  { keywords: ['home', '家', 'house', 'living'], icon: 'home' },
  { keywords: ['food', '美食', '餐饮', 'recipe', '食谱', 'cooking'], icon: 'food' },
  { keywords: ['love', '喜欢', 'like', '热门'], icon: 'heart' },

  // 旅行
  { keywords: ['travel', '旅行', '旅游', 'trip', 'tourism'], icon: 'plane' },
  { keywords: ['map', '地图', 'location', '位置', 'place', '地点'], icon: 'map' },

  // 金融 & 数据
  { keywords: ['money', '财务', 'finance', '金融', 'bank', '银行', 'pay'], icon: 'money' },
  { keywords: ['chart', 'data', '数据', 'stats', '统计', 'analytics'], icon: 'chart' },

  // 工具
  { keywords: ['tool', '工具', 'utility', 'util'], icon: 'tool' },
  { keywords: ['setting', '设置', 'config', '配置', 'preference'], icon: 'settings' },
  { keywords: ['folder', '文件夹', 'archive', '归档'], icon: 'folder' },
  { keywords: ['star', '星标', 'important', '重要'], icon: 'star' },
  { keywords: ['bell', 'notification', '通知'], icon: 'bell' },
  { keywords: ['web', '网站', 'website', 'site'], icon: 'globe' },
];

/** 用户自定义图标映射（分类名 → 图标 key） */
const STORAGE_KEY = 'markpage-category-icons';

/**
 * 获取用户自定义图标映射
 */
function getCustomMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * 保存用户自定义图标
 *
 * @param categoryName - 分类名称
 * @param iconKey - 图标 key（ICON_LIBRARY 的键）
 */
export function setCustomIcon(categoryName: string, iconKey: string): void {
  const map = getCustomMap();
  map[categoryName] = iconKey;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

/**
 * 根据分类名匹配图标 key（内部使用）
 *
 * 优先级：用户自定义 > 关键词匹配 > 默认 folder
 *
 * @param categoryName - 分类名称
 * @returns 图标 key
 */
export function getCategoryIconKey(categoryName: string): string {
  // 1. 用户自定义最优先
  const custom = getCustomMap()[categoryName];
  if (custom && ICON_LIBRARY[custom]) return custom;

  // 2. 关键词匹配
  const name = categoryName.toLowerCase().trim();
  for (const rule of KEYWORD_MAP) {
    for (const kw of rule.keywords) {
      if (name.includes(kw.toLowerCase())) return rule.icon;
    }
  }

  // 3. 默认文件夹图标
  return 'folder';
}

/**
 * 获取分类图标的 SVG 字符串
 *
 * @param categoryName - 分类名称
 * @param size - 图标尺寸
 * @returns SVG 字符串
 *
 * 使用示例：
 *   const svg = getCategoryIcon('开发工具'); // code 图标
 */
export function getCategoryIcon(categoryName: string, size = 16): string {
  const key = getCategoryIconKey(categoryName);
  return ICON_LIBRARY[key](size);
}

/**
 * 获取所有可选图标（用于图标选择器）
 *
 * @returns 图标 key 和渲染函数的列表
 */
export function getAllIconOptions(): { key: string; svg: string }[] {
  return Object.entries(ICON_LIBRARY).map(([key, fn]) => ({ key, svg: fn(20) }));
}

/**
 * 图标元数据 — 用于搜索和语义分组
 */
export interface IconMeta {
  key: string;
  label: string;        // 中文显示名（搜索用）
  aliases: string[];    // 英文搜索别名
  group: string;        // 所属语义分组
}

/** 图标元数据表 */
export const ICON_META: IconMeta[] = [
  // 开发
  { key: 'code', label: '代码', aliases: ['code', 'dev', 'programming'], group: '开发' },
  { key: 'terminal', label: '终端', aliases: ['terminal', 'cli', 'shell'], group: '开发' },
  { key: 'git', label: '版本控制', aliases: ['git', 'github'], group: '开发' },
  { key: 'bug', label: '调试', aliases: ['bug', 'debug', 'issue'], group: '开发' },

  // AI
  { key: 'sparkles', label: 'AI 智能', aliases: ['ai', 'sparkles', 'magic'], group: 'AI' },
  { key: 'bot', label: '机器人', aliases: ['bot', 'chatbot', 'robot'], group: 'AI' },
  { key: 'cpu', label: '芯片', aliases: ['cpu', 'chip', 'processor'], group: 'AI' },

  // 设计
  { key: 'design', label: '设计', aliases: ['design', 'pen', 'draw'], group: '设计' },
  { key: 'palette', label: '调色板', aliases: ['palette', 'color', 'paint'], group: '设计' },
  { key: 'image', label: '图片', aliases: ['image', 'photo', 'picture'], group: '设计' },
  { key: 'figma', label: 'Figma', aliases: ['figma'], group: '设计' },

  // 文档 & 学习
  { key: 'document', label: '文档', aliases: ['document', 'doc', 'file'], group: '文档' },
  { key: 'book', label: '书籍', aliases: ['book', 'reading'], group: '文档' },
  { key: 'education', label: '学习', aliases: ['education', 'learn', 'tutorial'], group: '文档' },
  { key: 'graduation', label: '学校', aliases: ['graduation', 'school', 'college'], group: '文档' },
  { key: 'bookmark', label: '书签', aliases: ['bookmark', 'favorite'], group: '文档' },
  { key: 'news', label: '新闻', aliases: ['news', 'blog'], group: '文档' },

  // 工作
  { key: 'briefcase', label: '工作', aliases: ['work', 'job', 'briefcase'], group: '工作' },
  { key: 'clipboard', label: '项目', aliases: ['project', 'clipboard'], group: '工作' },

  // 社交 & 通讯
  { key: 'chat', label: '聊天', aliases: ['chat', 'message', 'talk'], group: '社交' },
  { key: 'mail', label: '邮件', aliases: ['mail', 'email'], group: '社交' },
  { key: 'users', label: '用户', aliases: ['users', 'people', 'social'], group: '社交' },
  { key: 'phone', label: '电话', aliases: ['phone', 'tel'], group: '社交' },

  // 媒体
  { key: 'video', label: '视频', aliases: ['video', 'play'], group: '媒体' },
  { key: 'film', label: '电影', aliases: ['film', 'movie', 'cinema'], group: '媒体' },
  { key: 'music', label: '音乐', aliases: ['music', 'song'], group: '媒体' },
  { key: 'gamepad', label: '游戏', aliases: ['game', 'gaming', 'gamepad'], group: '媒体' },
  { key: 'headphones', label: '耳机', aliases: ['headphones', 'audio', 'podcast'], group: '媒体' },

  // 生活
  { key: 'shopping', label: '购物', aliases: ['shopping', 'cart', 'shop'], group: '生活' },
  { key: 'home', label: '家', aliases: ['home', 'house'], group: '生活' },
  { key: 'food', label: '美食', aliases: ['food', 'coffee', 'recipe'], group: '生活' },
  { key: 'heart', label: '喜欢', aliases: ['heart', 'love', 'like'], group: '生活' },

  // 旅行
  { key: 'plane', label: '旅行', aliases: ['travel', 'plane', 'trip'], group: '旅行' },
  { key: 'map', label: '地图', aliases: ['map'], group: '旅行' },
  { key: 'location', label: '位置', aliases: ['location', 'place', 'pin'], group: '旅行' },

  // 数据 & 金融
  { key: 'money', label: '财务', aliases: ['money', 'finance', 'bank'], group: '数据' },
  { key: 'chart', label: '图表', aliases: ['chart', 'stats', 'analytics'], group: '数据' },

  // 工具
  { key: 'tool', label: '工具', aliases: ['tool', 'wrench'], group: '工具' },
  { key: 'settings', label: '设置', aliases: ['settings', 'config', 'gear'], group: '工具' },
  { key: 'folder', label: '文件夹', aliases: ['folder'], group: '工具' },
  { key: 'archive', label: '归档', aliases: ['archive', 'box'], group: '工具' },
  { key: 'star', label: '星标', aliases: ['star', 'favorite'], group: '工具' },
  { key: 'bell', label: '通知', aliases: ['bell', 'notification'], group: '工具' },
  { key: 'globe', label: '网站', aliases: ['globe', 'web', 'site'], group: '工具' },
];

/** 热门图标 key 列表（按使用频率排序） */
export const POPULAR_ICONS = [
  'code', 'design', 'document', 'sparkles', 'folder',
  'video', 'music', 'star', 'bookmark', 'globe',
];

/**
 * 搜索图标
 *
 * @param query - 搜索关键词（支持中英文）
 * @returns 匹配的图标元数据列表
 */
export function searchIcons(query: string): IconMeta[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  return ICON_META.filter(m => {
    if (m.key.toLowerCase().includes(q)) return true;
    if (m.label.includes(query)) return true;
    return m.aliases.some(a => a.toLowerCase().includes(q));
  });
}

/**
 * 根据分类名获取 AI 推荐图标（基于关键词匹配的多个候选）
 *
 * @param categoryName - 分类名称
 * @param limit - 返回数量
 * @returns 推荐图标 key 列表
 */
export function recommendIcons(categoryName: string, limit = 5): string[] {
  const name = categoryName.toLowerCase().trim();
  const recommendations = new Set<string>();

  // 通过关键词匹配收集候选
  ICON_META.forEach(meta => {
    if (recommendations.size >= limit) return;
    if (meta.label && categoryName.includes(meta.label)) recommendations.add(meta.key);
    meta.aliases.forEach(alias => {
      if (name.includes(alias.toLowerCase())) recommendations.add(meta.key);
    });
  });

  // 不足则用热门图标补齐
  for (const icon of POPULAR_ICONS) {
    if (recommendations.size >= limit) break;
    recommendations.add(icon);
  }

  return Array.from(recommendations).slice(0, limit);
}
