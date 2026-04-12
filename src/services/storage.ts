/**
 * Chrome Storage 封装
 *
 * 统一管理用户设置、主题配置、缓存数据等的存储与读取。
 * 使用 chrome.storage.local 存储，支持变化监听。
 * 当 Chrome API 不可用时（开发环境），自动降级到 localStorage。
 *
 * 使用示例：
 *   import { getSettings, saveSettings } from '@/services/storage';
 *   const settings = await getSettings();
 *   settings.theme = 'dark';
 *   await saveSettings(settings);
 */

import type { Settings, Bookmark } from '@/types';

/** 存储键名常量 */
const STORAGE_KEYS = {
  /** 用户设置 */
  SETTINGS: 'markpage_settings',
  /** 常用站点缓存 */
  FREQUENT_SITES: 'markpage_frequent_sites',
  /** AI 分类历史 */
  CLASSIFY_HISTORY: 'markpage_classify_history',
  /** 搜索历史 */
  SEARCH_HISTORY: 'markpage_search_history',
  /** 最近访问记录 */
  RECENT_VISITS: 'markpage_recent_visits',
} as const;

/** 默认用户设置 */
const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  accentColor: '#8b5cf6',
  searchEngine: 'google',
  autoFocusSearch: true,
  compactMode: false,
  ai: {
    provider: 'openai',
    apiKey: '',
    model: 'gpt-4o-mini',
    enabled: false,
    autoConfirm: true,
    autoConfirmThreshold: 0.8,
  },
};

// ============================================================
// 工具函数
// ============================================================

/**
 * 检查 Chrome Storage API 是否可用
 *
 * @returns 是否在 Chrome 扩展环境中运行
 */
function isChromeStorageAvailable(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.storage?.local;
}

// ============================================================
// 通用存储方法
// ============================================================

/**
 * 通用存储读取方法
 *
 * 优先使用 chrome.storage.local，不可用时降级到 localStorage
 *
 * @param key - 存储键名
 * @returns 存储的值，不存在则返回 null
 *
 * 使用示例：
 *   const data = await get<string[]>('my_key');
 */
export async function get<T>(key: string): Promise<T | null> {
  if (isChromeStorageAvailable()) {
    try {
      const result = await chrome.storage.local.get(key);
      return (result[key] as T) ?? null;
    } catch (error) {
      console.error(`[MarkPage] 读取存储 "${key}" 失败:`, error);
      return null;
    }
  }

  // 降级到 localStorage
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  } catch (error) {
    console.error(`[MarkPage] 从 localStorage 读取 "${key}" 失败:`, error);
    return null;
  }
}

/**
 * 通用存储写入方法
 *
 * 优先使用 chrome.storage.local，不可用时降级到 localStorage
 *
 * @param key - 存储键名
 * @param value - 要存储的值
 *
 * 使用示例：
 *   await set('my_key', ['a', 'b', 'c']);
 */
export async function set<T>(key: string, value: T): Promise<void> {
  if (isChromeStorageAvailable()) {
    try {
      await chrome.storage.local.set({ [key]: value });
    } catch (error) {
      console.error(`[MarkPage] 写入存储 "${key}" 失败:`, error);
    }
    return;
  }

  // 降级到 localStorage
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`[MarkPage] 写入 localStorage "${key}" 失败:`, error);
  }
}

/**
 * 清除指定键的存储
 *
 * @param key - 要清除的键名
 *
 * 使用示例：
 *   await remove('markpage_classify_history');
 */
export async function remove(key: string): Promise<void> {
  if (isChromeStorageAvailable()) {
    try {
      await chrome.storage.local.remove(key);
    } catch (error) {
      console.error(`[MarkPage] 删除存储 "${key}" 失败:`, error);
    }
    return;
  }

  // 降级到 localStorage
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.error(`[MarkPage] 从 localStorage 删除 "${key}" 失败:`, error);
  }
}

// ============================================================
// 设置管理
// ============================================================

/**
 * 获取用户设置
 *
 * 从存储中读取设置并与默认值合并，确保新增字段有默认值
 *
 * @returns 用户设置对象
 *
 * 使用示例：
 *   const settings = await getSettings();
 *   console.log(settings.theme); // 'system'
 */
export async function getSettings(): Promise<Settings> {
  const stored = await get<Partial<Settings>>(STORAGE_KEYS.SETTINGS);

  if (!stored) {
    return { ...DEFAULT_SETTINGS };
  }

  // 深度合并：确保嵌套的 ai 配置也有默认值
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    ai: {
      ...DEFAULT_SETTINGS.ai,
      ...(stored.ai ?? {}),
    },
  };
}

/**
 * 保存用户设置
 *
 * @param settings - 要保存的设置对象
 *
 * 使用示例：
 *   await saveSettings({ ...settings, theme: 'dark' });
 */
export async function saveSettings(settings: Settings): Promise<void> {
  await set(STORAGE_KEYS.SETTINGS, settings);
}

/**
 * 更新部分设置（合并式更新）
 *
 * @param partial - 要更新的部分设置
 *
 * 使用示例：
 *   await updateSettings({ theme: 'dark', accentColor: '#3b82f6' });
 */
export async function updateSettings(partial: Partial<Settings>): Promise<void> {
  const current = await getSettings();
  const updated: Settings = {
    ...current,
    ...partial,
    ai: {
      ...current.ai,
      ...(partial.ai ?? {}),
    },
  };
  await saveSettings(updated);
}

/**
 * 获取默认设置对象
 *
 * @returns 默认设置的副本
 *
 * 使用示例：
 *   const defaults = getDefaultSettings();
 */
export function getDefaultSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ai: { ...DEFAULT_SETTINGS.ai } };
}

// ============================================================
// 常用书签标记 — 独立于 Chrome 书签结构，仅作标签
// ============================================================

/**
 * 获取用户标记为"常用"的书签 ID 列表
 *
 * @returns 常用书签 ID 数组
 */
export async function getFrequentIds(): Promise<string[]> {
  const ids = await get<string[]>(STORAGE_KEYS.FREQUENT_SITES);
  return Array.isArray(ids) ? ids : [];
}

/**
 * 标记书签为常用
 *
 * @param bookmarkId - 书签 ID
 */
export async function addFrequent(bookmarkId: string): Promise<void> {
  const ids = await getFrequentIds();
  if (!ids.includes(bookmarkId)) {
    ids.push(bookmarkId);
    await set(STORAGE_KEYS.FREQUENT_SITES, ids);
  }
}

/**
 * 取消书签的常用标记
 *
 * @param bookmarkId - 书签 ID
 */
export async function removeFrequent(bookmarkId: string): Promise<void> {
  const ids = await getFrequentIds();
  const next = ids.filter((id) => id !== bookmarkId);
  if (next.length !== ids.length) {
    await set(STORAGE_KEYS.FREQUENT_SITES, next);
  }
}

/**
 * 判断书签是否已标记为常用
 *
 * @param bookmarkId - 书签 ID
 */
export async function isFrequent(bookmarkId: string): Promise<boolean> {
  const ids = await getFrequentIds();
  return ids.includes(bookmarkId);
}

/**
 * 监听设置变化
 *
 * 当设置被修改时（包括其他页面修改的），触发回调
 *
 * @param callback - 设置变化回调
 *
 * 使用示例：
 *   onSettingsChange((newSettings) => {
 *     applyTheme(newSettings);
 *   });
 */
export function onSettingsChange(callback: (settings: Settings) => void): void {
  if (isChromeStorageAvailable() && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      // 只关注 local 区域的设置变化
      if (areaName !== 'local') return;

      if (changes[STORAGE_KEYS.SETTINGS]?.newValue) {
        const newSettings: Settings = {
          ...DEFAULT_SETTINGS,
          ...changes[STORAGE_KEYS.SETTINGS].newValue,
          ai: {
            ...DEFAULT_SETTINGS.ai,
            ...(changes[STORAGE_KEYS.SETTINGS].newValue.ai ?? {}),
          },
        };
        callback(newSettings);
      }
    });
  } else {
    // 开发环境：使用 storage 事件监听 localStorage 变化
    window.addEventListener('storage', (event) => {
      if (event.key === STORAGE_KEYS.SETTINGS && event.newValue) {
        try {
          const parsed = JSON.parse(event.newValue);
          const settings: Settings = {
            ...DEFAULT_SETTINGS,
            ...parsed,
            ai: {
              ...DEFAULT_SETTINGS.ai,
              ...(parsed.ai ?? {}),
            },
          };
          callback(settings);
        } catch (error) {
          console.error('[MarkPage] 解析设置变化失败:', error);
        }
      }
    });
  }
}

// ============================================================
// 搜索历史
// ============================================================

/**
 * 获取搜索历史（最近 10 条）
 *
 * @returns 搜索关键词列表
 *
 * 使用示例：
 *   const history = await getSearchHistory();
 *   console.log(history); // ['github', 'react', ...]
 */
export async function getSearchHistory(): Promise<string[]> {
  const history = await get<string[]>(STORAGE_KEYS.SEARCH_HISTORY);
  return history ?? [];
}

/**
 * 保存搜索记录
 *
 * 自动去重，保留最近 10 条
 *
 * @param query - 搜索关键词
 *
 * 使用示例：
 *   await saveSearchHistory('react hooks');
 */
export async function saveSearchHistory(query: string): Promise<void> {
  const trimmed = query.trim();
  if (!trimmed) return;

  const history = await getSearchHistory();

  // 去重：如果已存在则移到最前面
  const filtered = history.filter((h) => h !== trimmed);
  filtered.unshift(trimmed);

  // 只保留最近 10 条
  const limited = filtered.slice(0, 10);

  await set(STORAGE_KEYS.SEARCH_HISTORY, limited);
}

// ============================================================
// 最近访问记录
// ============================================================

/** 最近访问条目 */
interface RecentVisitEntry {
  /** 书签 ID */
  id: string;
  /** 页面标题 */
  title: string;
  /** 页面 URL */
  url: string;
  /** 网站图标 */
  favicon?: string;
  /** 访问时间戳 */
  visitedAt: number;
}

/**
 * 获取最近访问记录（最近 20 条）
 *
 * @returns 最近访问的书签列表
 *
 * 使用示例：
 *   const visits = await getRecentVisits();
 */
export async function getRecentVisits(): Promise<RecentVisitEntry[]> {
  const visits = await get<RecentVisitEntry[]>(STORAGE_KEYS.RECENT_VISITS);
  return visits ?? [];
}

/**
 * 保存访问记录
 *
 * 自动去重（同 URL），保留最近 20 条
 *
 * @param bookmark - 被访问的书签
 *
 * 使用示例：
 *   await saveRecentVisit(bookmark);
 */
export async function saveRecentVisit(bookmark: Bookmark): Promise<void> {
  const visits = await getRecentVisits();

  // 去重：移除相同 URL 的旧记录
  const filtered = visits.filter((v) => v.url !== bookmark.url);

  // 添加到最前面
  filtered.unshift({
    id: bookmark.id,
    title: bookmark.title,
    url: bookmark.url,
    favicon: bookmark.favicon,
    visitedAt: Date.now(),
  });

  // 只保留最近 20 条
  const limited = filtered.slice(0, 20);

  await set(STORAGE_KEYS.RECENT_VISITS, limited);
}
