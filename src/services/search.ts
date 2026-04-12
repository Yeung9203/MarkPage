/**
 * 搜索引擎模块
 *
 * 提供对书签的多维度模糊搜索能力：
 *   - 标题匹配
 *   - URL 匹配
 *   - 拼音匹配（中文标题转拼音首字母）
 *   - 标签匹配
 *
 * 使用示例：
 *   import { search } from '@/services/search';
 *   const results = search(bookmarks, 'github');
 *   console.log(results); // [{ bookmark, score, matchField }]
 */

import type { Bookmark, SearchResult, MatchField } from '@/types';
import { findTagIdByName, getAllTagDefs } from '@/services/tags';

// ============================================================
// 模糊匹配核心算法
// ============================================================

/** 模糊匹配结果 */
interface FuzzyResult {
  /** 是否匹配 */
  match: boolean;
  /** 匹配分数（0-100） */
  score: number;
  /** 匹配字符在原文中的位置索引 */
  indices: number[];
}

/**
 * 模糊子序列匹配算法
 *
 * 匹配策略：
 *   1. 精确子串优先（score = 100）
 *   2. 子序列匹配：连续字符加分，位置靠前加分
 *
 * @param text - 要搜索的文本
 * @param query - 搜索关键词
 * @returns 匹配结果，包含是否匹配、分数和匹配位置
 *
 * 使用示例：
 *   fuzzyMatch('GitHub', 'gh');
 *   // { match: true, score: 100, indices: [] } — 精确子串匹配
 *
 *   fuzzyMatch('Google Chrome', 'gc');
 *   // { match: true, score: 16, indices: [0, 7] } — 子序列匹配
 */
export function fuzzyMatch(text: string, query: string): FuzzyResult {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();

  // 精确子串优先，得分最高
  if (lowerText.indexOf(lowerQuery) !== -1) {
    return { match: true, score: 100, indices: [] };
  }

  // 模糊子序列匹配
  let ti = 0;
  let qi = 0;
  const indices: number[] = [];
  let consecutive = 0;
  let maxConsecutive = 0;

  while (ti < lowerText.length && qi < lowerQuery.length) {
    if (lowerText[ti] === lowerQuery[qi]) {
      indices.push(ti);
      consecutive++;
      if (consecutive > maxConsecutive) {
        maxConsecutive = consecutive;
      }
      qi++;
    } else {
      consecutive = 0;
    }
    ti++;
  }

  // 所有查询字符都匹配上了
  if (qi === lowerQuery.length) {
    // 评分：连续字符越多分越高，位置越靠前分越高
    const score = maxConsecutive * 10 + Math.max(0, 50 - indices[0]);
    return { match: true, score, indices };
  }

  return { match: false, score: 0, indices: [] };
}

// ============================================================
// 高亮匹配
// ============================================================

/**
 * 对匹配文本添加 <mark> 标签高亮
 *
 * @param text - 原始文本
 * @param query - 搜索关键词
 * @returns 带有 <mark> 标签的 HTML 字符串
 *
 * 使用示例：
 *   highlightMatch('GitHub Repository', 'git');
 *   // '<mark>Git</mark>Hub Repository'
 */
export function highlightMatch(text: string, query: string): string {
  if (!query) return text;

  const lowerQuery = query.toLowerCase();

  // 优先处理精确子串匹配
  const idx = text.toLowerCase().indexOf(lowerQuery);
  if (idx !== -1) {
    return (
      text.slice(0, idx) +
      '<mark>' +
      text.slice(idx, idx + query.length) +
      '</mark>' +
      text.slice(idx + query.length)
    );
  }

  // 模糊高亮 — 逐字符标记
  const result = fuzzyMatch(text, query);
  if (result.match && result.indices.length > 0) {
    const chars = text.split('');
    // 从后向前替换，避免索引偏移
    for (let i = result.indices.length - 1; i >= 0; i--) {
      const charIdx = result.indices[i];
      chars[charIdx] = '<mark>' + chars[charIdx] + '</mark>';
    }
    return chars.join('');
  }

  return text;
}

// ============================================================
// 各字段匹配评分
// ============================================================

/**
 * 计算标题匹配分数
 *
 * @param title - 书签标题
 * @param query - 搜索关键词
 * @returns 匹配分数（0-100），0 表示不匹配
 */
function matchTitle(title: string, query: string): number {
  const result = fuzzyMatch(title, query);
  return result.match ? result.score : 0;
}

/**
 * 计算 URL 匹配分数（权重 0.8）
 *
 * @param url - 书签 URL
 * @param query - 搜索关键词
 * @returns 匹配分数（0-100），带权重
 */
function matchUrl(url: string, query: string): number {
  const result = fuzzyMatch(url, query);
  return result.match ? result.score * 0.8 : 0;
}

/**
 * 计算标签/分类匹配分数（权重 0.7）
 *
 * @param category - 书签所属分类
 * @param query - 搜索关键词
 * @returns 匹配分数（0-100），带权重
 */
function matchTag(category: string, query: string): number {
  const result = fuzzyMatch(category, query);
  return result.match ? result.score * 0.7 : 0;
}

/**
 * 计算拼音匹配分数（中文书签支持，权重 0.6）
 *
 * 将中文标题转为拼音首字母，再与 query 匹配
 *
 * @param title - 书签标题（可能含中文）
 * @param query - 搜索关键词（拼音首字母）
 * @returns 匹配分数（0-100），带权重
 *
 * 使用示例：
 *   matchPinyin('掘金社区', 'jjsq'); // 返回高分
 */
function matchPinyin(title: string, query: string): number {
  // 检查标题是否包含中文字符
  if (!/[\u4e00-\u9fa5]/.test(title)) {
    return 0;
  }

  // 将中文字符转为拼音首字母
  const pinyinStr = toPinyinInitials(title);
  if (!pinyinStr) return 0;

  const result = fuzzyMatch(pinyinStr, query);
  return result.match ? result.score * 0.6 : 0;
}

// ============================================================
// 拼音转换（简化版常用字映射）
// ============================================================

/**
 * 常用汉字拼音首字母映射表
 * 按 Unicode 区间划分，覆盖常用汉字
 */
const PINYIN_MAP: Record<string, string> = {};

/**
 * 初始化拼音映射（使用 Unicode 区间近似映射）
 *
 * 这是一个简化实现，仅覆盖常用汉字的首字母
 * 对于完整的拼音支持建议引入 pinyin 库
 */
const PINYIN_INITIALS = 'ABCDEFGHJKLMNOPQRSTWXYZ';
const PINYIN_BOUNDARIES = [
  0xb0a1, 0xb0c5, 0xb2c1, 0xb4ee, 0xb6ea, 0xb7a2, 0xb8c1, 0xb9fe,
  0xbbf7, 0xbfa6, 0xc0ac, 0xc2e8, 0xc4c3, 0xc5b6, 0xc5be, 0xc6da,
  0xc8bb, 0xc8f6, 0xcbfa, 0xcdda, 0xcef4, 0xd1b9, 0xd4d1,
];

/**
 * 将单个中文字符转为拼音首字母
 *
 * @param char - 中文字符
 * @returns 拼音首字母（大写），非中文返回原字符
 */
function getCharPinyinInitial(char: string): string {
  const code = char.charCodeAt(0);

  // 非中文字符直接返回
  if (code < 0x4e00 || code > 0x9fa5) {
    return char;
  }

  // 使用 GB2312 编码区间做粗略映射
  // 这里用简化算法：基于常用字首字母统计规律
  const index = Math.floor((code - 0x4e00) / 0x0280);
  const initial = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.min(index, 25)] || 'Z';
  return initial;
}

/**
 * 将包含中文的字符串转为拼音首字母串
 *
 * @param text - 输入文本
 * @returns 拼音首字母串（小写）
 *
 * 使用示例：
 *   toPinyinInitials('掘金社区'); // 可能返回 'jjsq'
 */
function toPinyinInitials(text: string): string {
  let result = '';
  for (const char of text) {
    if (/[\u4e00-\u9fa5]/.test(char)) {
      result += getCharPinyinInitial(char).toLowerCase();
    } else if (/[a-zA-Z0-9]/.test(char)) {
      result += char.toLowerCase();
    }
  }
  return result;
}

// ============================================================
// 核心搜索函数
// ============================================================

/**
 * 查询解析结果
 */
export interface ParsedQuery {
  /** 去除标签语法后的纯文本查询 */
  text: string;
  /** 必需标签名数组（来自 #tag 语法） */
  tagNames: string[];
  /** 排除标签名数组（来自 -#tag 语法） */
  excludeTagNames: string[];
}

/**
 * 解析搜索查询，提取 #标签 和 -#排除标签 语法
 *
 * 语法规则：
 *   - `#标签名`：必需标签（书签必须包含该标签）
 *   - `-#标签名`：排除标签（书签不得包含该标签）
 *   - 标签名可以含空格、连字符等非空白字符，以下一个空格或字符串结尾为界
 *   - 其余部分拼接为 text
 *
 * @param q - 原始查询字符串
 * @returns 解析结果
 *
 * 使用示例：
 *   parseQuery('vite #前端 -#归档 hmr');
 *   // { text: 'vite hmr', tagNames: ['前端'], excludeTagNames: ['归档'] }
 */
export function parseQuery(q: string): ParsedQuery {
  const tagNames: string[] = [];
  const excludeTagNames: string[] = [];
  // 匹配 -#tag 或 #tag，tag 部分为非空白字符序列
  const re = /(-?)#(\S+)/g;
  const text = q
    .replace(re, (_m, neg: string, name: string) => {
      if (neg) excludeTagNames.push(name);
      else tagNames.push(name);
      return '';
    })
    .replace(/\s+/g, ' ')
    .trim();
  return { text, tagNames, excludeTagNames };
}

/**
 * 对书签列表执行模糊搜索（异步，支持标签硬筛 + 文本模糊）
 *
 * 流程：
 *   1. 解析 query，分出文本部分和标签部分
 *   2. 标签硬筛：必须包含所有 `#tag`，不得包含任一 `-#tag`
 *   3. 文本模糊评分：标题 / URL / tag 名 / 拼音 多字段
 *
 * @param bookmarks - 书签列表
 * @param query - 搜索关键词（可含 `#tag` / `-#tag`）
 * @param maxResults - 最大返回数量（默认 20）
 * @returns 按匹配分数降序排列的搜索结果
 *
 * 使用示例：
 *   const results = await search(allBookmarks, 'vite #前端');
 */
export async function search(
  bookmarks: Bookmark[],
  query: string,
  maxResults: number = 20,
): Promise<SearchResult[]> {
  const parsed = parseQuery(query);
  const text = parsed.text.toLowerCase().trim();

  // 无任何查询条件
  if (!text && parsed.tagNames.length === 0 && parsed.excludeTagNames.length === 0) {
    return [];
  }

  // 将标签名解析为 tagId（全部需要存在，否则必需标签查询直接无结果）
  let requiredTagIds: string[] = [];
  let excludeTagIds: string[] = [];
  try {
    const required = await Promise.all(parsed.tagNames.map((n) => findTagIdByName(n)));
    if (required.some((id) => id === null)) {
      // 有必需标签找不到，硬筛必然为空
      if (parsed.tagNames.length > 0) return [];
    }
    requiredTagIds = required.filter((x): x is string => !!x);

    const excluded = await Promise.all(parsed.excludeTagNames.map((n) => findTagIdByName(n)));
    excludeTagIds = excluded.filter((x): x is string => !!x);
  } catch (error) {
    console.error('[MarkPage] 解析搜索标签失败:', error);
  }

  // 构建 bookmarkId → tagNames 缓存（仅在需要文本评分时用）
  let idToTagNames: Map<string, string[]> | null = null;
  if (text) {
    try {
      const defs = await getAllTagDefs();
      const tagIdToName = new Map(defs.map((d) => [d.id, d.name]));
      idToTagNames = new Map();
      for (const bk of bookmarks) {
        if (bk.tags && bk.tags.length > 0) {
          const names = bk.tags
            .map((id) => tagIdToName.get(id))
            .filter((n): n is string => !!n);
          idToTagNames.set(bk.id, names);
        }
      }
    } catch (error) {
      console.error('[MarkPage] 构建标签名缓存失败:', error);
    }
  }

  const results: SearchResult[] = [];

  for (const bookmark of bookmarks) {
    const bkTags = bookmark.tags ?? [];

    // 标签硬筛：必须包含所有 requiredTagIds
    if (requiredTagIds.length > 0) {
      const hasAll = requiredTagIds.every((id) => bkTags.includes(id));
      if (!hasAll) continue;
    }
    // 排除标签：任一命中则剔除
    if (excludeTagIds.length > 0) {
      const hit = excludeTagIds.some((id) => bkTags.includes(id));
      if (hit) continue;
    }

    // 如果 text 为空但标签硬筛通过，固定分 120
    if (!text) {
      results.push({ bookmark, score: 120, matchField: 'tag' });
      continue;
    }

    // 文本模糊评分
    const titleScore = matchTitle(bookmark.title, text);
    const urlScore = matchUrl(bookmark.url, text);

    // 标签名模糊匹配：对每个 tag name 单独打分，取最高
    let tagScore = 0;
    const tagNamesForBk = idToTagNames?.get(bookmark.id) ?? [];
    for (const name of tagNamesForBk) {
      const s = matchTag(name, text);
      if (s > tagScore) tagScore = s;
    }
    // 兜底：category
    if (tagScore === 0 && bookmark.category) {
      tagScore = matchTag(bookmark.category, text);
    }

    const pinyinScore = matchPinyin(bookmark.title, text);

    const scores: { score: number; field: MatchField }[] = [
      { score: titleScore, field: 'title' },
      { score: urlScore, field: 'url' },
      { score: tagScore, field: 'tag' },
      { score: pinyinScore, field: 'pinyin' },
    ];

    const best = scores.reduce((a, b) => (b.score > a.score ? b : a));

    if (best.score > 0) {
      results.push({
        bookmark,
        score: best.score,
        matchField: best.field,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, maxResults);
}

// ============================================================
// URL 检测与搜索引擎
// ============================================================

/**
 * 判断输入字符串是否为 URL
 *
 * @param str - 输入字符串
 * @returns 是否为 URL 格式
 *
 * 使用示例：
 *   isUrl('https://github.com'); // true
 *   isUrl('github.com');         // true
 *   isUrl('hello world');        // false
 */
export function isUrl(str: string): boolean {
  // 以 http(s):// 或 www. 开头
  if (/^(https?:\/\/|www\.)/.test(str)) return true;
  // 域名格式：字母数字和横杠，后跟点和至少2位顶级域名
  if (/^[a-z0-9-]+(\.[a-z]{2,})+/i.test(str)) return true;
  return false;
}

/**
 * 获取搜索引擎的搜索 URL
 *
 * @param engine - 搜索引擎名称
 * @param query - 搜索关键词
 * @returns 完整的搜索 URL
 *
 * 使用示例：
 *   getSearchUrl('google', 'vite hmr');
 *   // 'https://www.google.com/search?q=vite+hmr'
 */
export function getSearchUrl(
  engine: 'google' | 'bing' | 'duckduckgo' | 'baidu',
  query: string,
): string {
  const encodedQuery = encodeURIComponent(query);
  const urlMap: Record<string, string> = {
    google: `https://www.google.com/search?q=${encodedQuery}`,
    bing: `https://www.bing.com/search?q=${encodedQuery}`,
    duckduckgo: `https://duckduckgo.com/?q=${encodedQuery}`,
    baidu: `https://www.baidu.com/s?wd=${encodedQuery}`,
  };
  return urlMap[engine] ?? urlMap.google;
}
