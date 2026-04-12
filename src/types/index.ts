/**
 * MarkPage 类型定义
 *
 * 包含书签、分类、AI 配置、设置等核心类型
 */

// ============================================================
// 书签相关类型
// ============================================================

/** 书签数据结构 */
export interface Bookmark {
  /** 书签唯一标识 */
  id: string;
  /** 书签标题 */
  title: string;
  /** 书签链接 */
  url: string;
  /** 网站图标地址 */
  favicon?: string;
  /** 父级文件夹 ID */
  parentId?: string;
  /** 添加时间戳 */
  dateAdded?: number;
  /** 所属分类名称 */
  category?: string;
  /** 网站标签列表（标签 ID 数组，解析后展示名称） */
  tags?: string[];
}

/** 标签定义（存储于 chrome.storage.local） */
export interface TagDef {
  /** 标签唯一标识（nanoid） */
  id: string;
  /** 标签显示名 */
  name: string;
  /** 创建时间戳 */
  createdAt: number;
  /** 合并历史留痕，老名仍可被搜索命中 */
  aliases?: string[];
}

/** 分类数据结构 */
export interface Category {
  /** 分类唯一标识 */
  id: string;
  /** 分类名称 */
  name: string;
  /** 分类图标（emoji 或 URL） */
  icon?: string;
  /** 该分类下的书签数量 */
  count: number;
  /** 子分类列表 */
  children?: Category[];
}

// ============================================================
// AI 相关类型
// ============================================================

/** AI 服务提供商类型 */
export type AIProvider = 'openai' | 'anthropic' | 'deepseek' | 'custom';

/** AI 配置 */
export interface AIConfig {
  /** 服务提供商 */
  provider: AIProvider;
  /** API 密钥 */
  apiKey: string;
  /** 模型名称 */
  model: string;
  /** 自定义 API 地址（provider 为 custom 时使用） */
  baseUrl?: string;
  /** 是否启用 AI 分类 */
  enabled: boolean;
  /** 是否自动确认分类（无需用户确认） */
  autoConfirm: boolean;
  /** 自动确认的置信度阈值（0-1） */
  autoConfirmThreshold: number;
}

/** AI 分类结果 */
export interface ClassifyResult {
  /** 推荐分类名称 */
  category: string;
  /** 置信度（0-1） */
  confidence: number;
  /** 备选分类列表 */
  alternatives: { category: string; confidence: number }[];
  /** 如果建议创建新分类，返回新分类名 */
  newCategory?: string;
}

// ============================================================
// 搜索相关类型
// ============================================================

/** 搜索匹配字段 */
export type MatchField = 'title' | 'url' | 'tag' | 'pinyin';

/** 搜索结果 */
export interface SearchResult {
  /** 匹配到的书签 */
  bookmark: Bookmark;
  /** 匹配分数（越高越匹配） */
  score: number;
  /** 匹配的字段 */
  matchField: MatchField;
}

// ============================================================
// 设置相关类型
// ============================================================

/** 主题模式 */
export type ThemeMode = 'light' | 'dark' | 'system';

/** 搜索引擎选项 */
export type SearchEngine = 'google' | 'bing' | 'duckduckgo' | 'baidu';

/** 用户设置 */
export interface Settings {
  /** 主题模式 */
  theme: ThemeMode;
  /** 主题强调色（十六进制颜色值） */
  accentColor: string;
  /** 默认搜索引擎 */
  searchEngine: SearchEngine;
  /** 打开新标签页时是否自动聚焦搜索框 */
  autoFocusSearch: boolean;
  /** 紧凑模式（减小间距） */
  compactMode: boolean;
  /** AI 分类配置 */
  ai: AIConfig;
}

// ============================================================
// 常用站点类型
// ============================================================

/** 常用站点 */
export interface FrequentSite {
  /** 站点标题 */
  title: string;
  /** 站点链接 */
  url: string;
  /** 站点图标 */
  favicon?: string;
  /** 访问次数 */
  visitCount: number;
}
