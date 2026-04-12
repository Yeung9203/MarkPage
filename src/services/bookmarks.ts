/**
 * Chrome 书签 API 封装
 *
 * 提供对 chrome.bookmarks API 的统一封装，
 * 包含树形结构获取、扁平化查询、搜索、移动等操作
 *
 * 使用示例：
 *   import { getAllBookmarks, getBookmarkTree } from '@/services/bookmarks';
 *   const bookmarks = await getAllBookmarks();
 *   const tree = await getBookmarkTree();
 */

import type { Bookmark, Category } from '@/types';
import { getAllBookmarkTagMap } from '@/services/tags';

// ============================================================
// Mock 数据（Chrome API 不可用时使用）
// ============================================================

/** 模拟书签数据，用于开发环境 */
const MOCK_BOOKMARKS: Bookmark[] = [
  { id: '1', title: 'GitHub', url: 'https://github.com', parentId: '100', dateAdded: Date.now() - 86400000, category: '开发工具' },
  { id: '2', title: 'Google', url: 'https://google.com', parentId: '101', dateAdded: Date.now() - 172800000, category: '搜索引擎' },
  { id: '3', title: 'Stack Overflow', url: 'https://stackoverflow.com', parentId: '100', dateAdded: Date.now() - 259200000, category: '开发工具' },
  { id: '4', title: 'MDN Web Docs', url: 'https://developer.mozilla.org', parentId: '100', dateAdded: Date.now() - 345600000, category: '开发工具' },
  { id: '5', title: '掘金', url: 'https://juejin.cn', parentId: '102', dateAdded: Date.now() - 432000000, category: '技术社区' },
  { id: '6', title: 'Bilibili', url: 'https://bilibili.com', parentId: '103', dateAdded: Date.now() - 518400000, category: '娱乐' },
  { id: '7', title: 'Twitter / X', url: 'https://x.com', parentId: '104', dateAdded: Date.now() - 604800000, category: '社交媒体' },
  { id: '8', title: 'YouTube', url: 'https://youtube.com', parentId: '103', dateAdded: Date.now() - 691200000, category: '娱乐' },
];

/** 模拟分类数据 */
const MOCK_CATEGORIES: Category[] = [
  { id: '100', name: '开发工具', icon: '🛠', count: 3 },
  { id: '101', name: '搜索引擎', icon: '🔍', count: 1 },
  { id: '102', name: '技术社区', icon: '💬', count: 1 },
  { id: '103', name: '娱乐', icon: '🎮', count: 2 },
  { id: '104', name: '社交媒体', icon: '📱', count: 1 },
];

// ============================================================
// 工具函数
// ============================================================

/**
 * 检查 Chrome 书签 API 是否可用
 *
 * @returns 是否在 Chrome 扩展环境中运行
 */
function isChromeAvailable(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.bookmarks;
}

/**
 * 将书签树节点转换为 Bookmark 类型
 *
 * @param node - Chrome 书签树节点
 * @returns 转换后的 Bookmark 对象
 */
function toBookmark(node: chrome.bookmarks.BookmarkTreeNode): Bookmark {
  return {
    id: node.id,
    title: node.title,
    url: node.url ?? '',
    parentId: node.parentId,
    dateAdded: node.dateAdded,
  };
}

/**
 * 批量为书签列表填充 tags 字段（从 storage 读取真实数据）
 *
 * @param bookmarks - 待填充的书签列表
 * @returns 同一数组引用（已原地更新 tags）
 *
 * 使用示例：
 *   await joinTags(bookmarks);
 */
async function joinTags(bookmarks: Bookmark[]): Promise<Bookmark[]> {
  try {
    const map = await getAllBookmarkTagMap();
    for (const bk of bookmarks) {
      bk.tags = map[bk.id] ?? [];
    }
  } catch (error) {
    console.error('[MarkPage] 加载书签标签映射失败:', error);
    for (const bk of bookmarks) {
      if (!bk.tags) bk.tags = [];
    }
  }
  return bookmarks;
}

/**
 * 构建文件夹 ID → 文件夹名称 的映射表
 *
 * @param nodes - 书签树节点列表
 * @param map - 映射表
 */
function buildFolderMap(nodes: chrome.bookmarks.BookmarkTreeNode[], map: Map<string, string>): void {
  for (const node of nodes) {
    if (!node.url && node.children) {
      // 这是文件夹，记录 id → name
      map.set(node.id, node.title || '未命名');
      buildFolderMap(node.children, map);
    }
  }
}

/**
 * 递归遍历书签树，收集所有书签（排除文件夹），并填充 category 字段
 *
 * @param nodes - 书签树节点列表
 * @param result - 收集结果的数组
 * @param folderMap - 文件夹 ID → 名称 映射
 */
function flattenTree(
  nodes: chrome.bookmarks.BookmarkTreeNode[],
  result: Bookmark[],
  folderMap: Map<string, string>,
): void {
  for (const node of nodes) {
    if (node.url) {
      const bk = toBookmark(node);
      // 用父文件夹名称作为分类
      bk.category = folderMap.get(node.parentId || '') || '未分类';
      result.push(bk);
    }
    if (node.children) {
      flattenTree(node.children, result, folderMap);
    }
  }
}

// ============================================================
// 公开 API
// ============================================================

/**
 * 获取完整的书签树结构
 *
 * @returns 书签树根节点数组
 *
 * 使用示例：
 *   const tree = await getBookmarkTree();
 *   console.log(tree); // [{ id: '0', title: '', children: [...] }]
 */
export async function getBookmarkTree(): Promise<chrome.bookmarks.BookmarkTreeNode[]> {
  if (!isChromeAvailable()) {
    // 开发环境返回模拟树结构
    console.warn('[MarkPage] Chrome API 不可用，返回 mock 数据');
    return [];
  }

  try {
    return await chrome.bookmarks.getTree();
  } catch (error) {
    console.error('[MarkPage] 获取书签树失败:', error);
    return [];
  }
}

/**
 * 获取所有书签（扁平化列表，不含文件夹）
 *
 * @returns 扁平化的书签列表
 *
 * 使用示例：
 *   const bookmarks = await getAllBookmarks();
 *   console.log(bookmarks.length); // 书签总数
 */
export async function getAllBookmarks(): Promise<Bookmark[]> {
  if (!isChromeAvailable()) {
    console.warn('[MarkPage] Chrome API 不可用，返回 mock 数据');
    return joinTags(MOCK_BOOKMARKS.map((b) => ({ ...b })));
  }

  try {
    const tree = await chrome.bookmarks.getTree();
    // 先构建文件夹 ID → 名称映射
    const folderMap = new Map<string, string>();
    buildFolderMap(tree, folderMap);
    const result: Bookmark[] = [];
    flattenTree(tree, result, folderMap);
    return joinTags(result);
  } catch (error) {
    console.error('[MarkPage] 获取所有书签失败:', error);
    return [];
  }
}

/**
 * 从书签树中提取分类列表
 *
 * @param tree - 书签树根节点
 * @returns 分类列表（以文件夹为分类）
 *
 * 使用示例：
 *   const tree = await getBookmarkTree();
 *   const categories = extractCategories(tree);
 */
export function extractCategories(tree: chrome.bookmarks.BookmarkTreeNode[]): Category[] {
  if (!tree || tree.length === 0) {
    return [...MOCK_CATEGORIES];
  }

  const categories: Category[] = [];

  /**
   * 递归处理文件夹节点，统计书签数量
   *
   * @param nodes - 子节点列表
   */
  function processFolder(nodes: chrome.bookmarks.BookmarkTreeNode[]): void {
    for (const node of nodes) {
      if (!node.url && node.children) {
        // 这是一个文件夹，计算其下书签数量
        const bookmarkCount = countBookmarks(node.children);
        const childCategories = extractChildCategories(node.children);

        categories.push({
          id: node.id,
          name: node.title || '未命名',
          count: bookmarkCount,
          children: childCategories.length > 0 ? childCategories : undefined,
        });
      }
    }
  }

  /**
   * 计算节点下的直接书签数量
   *
   * @param nodes - 子节点列表
   * @returns 书签数量
   */
  function countBookmarks(nodes: chrome.bookmarks.BookmarkTreeNode[]): number {
    let count = 0;
    for (const node of nodes) {
      if (node.url) {
        count++;
      }
      if (node.children) {
        count += countBookmarks(node.children);
      }
    }
    return count;
  }

  /**
   * 提取子分类
   *
   * @param nodes - 子节点列表
   * @returns 子分类列表
   */
  function extractChildCategories(nodes: chrome.bookmarks.BookmarkTreeNode[]): Category[] {
    const children: Category[] = [];
    for (const node of nodes) {
      if (!node.url && node.children) {
        const bookmarkCount = countBookmarks(node.children);
        const subChildren = extractChildCategories(node.children);
        children.push({
          id: node.id,
          name: node.title || '未命名',
          count: bookmarkCount,
          children: subChildren.length > 0 ? subChildren : undefined,
        });
      }
    }
    return children;
  }

  // Chrome 书签树结构：root(id=0) → [书签栏(id=1), 其他书签(id=2), 移动设备书签(id=3)]
  // 我们需要跳过这些系统文件夹，提取它们下面的用户创建的子文件夹
  for (const root of tree) {
    if (root.children) {
      for (const systemFolder of root.children) {
        // 系统文件夹（书签栏、其他书签等），遍历它们的子节点
        if (systemFolder.children) {
          processFolder(systemFolder.children);
        }
      }
    }
  }

  // 保留所有分类（包含空文件夹，方便用户创建新分组后立即看见）
  return categories;
}

/**
 * 搜索书签（使用 Chrome 原生搜索）
 *
 * @param query - 搜索关键词
 * @returns 匹配的书签列表
 *
 * 使用示例：
 *   const results = await searchBookmarks('github');
 */
export async function searchBookmarks(query: string): Promise<Bookmark[]> {
  if (!isChromeAvailable()) {
    // 开发环境使用简单过滤
    const q = query.toLowerCase();
    const filtered = MOCK_BOOKMARKS.filter(
      (b) => b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q),
    ).map((b) => ({ ...b }));
    return joinTags(filtered);
  }

  try {
    const results = await chrome.bookmarks.search(query);
    // 只返回有 URL 的结果（排除文件夹）
    const mapped = results.filter((node) => !!node.url).map(toBookmark);
    return joinTags(mapped);
  } catch (error) {
    console.error('[MarkPage] 搜索书签失败:', error);
    return [];
  }
}

/**
 * 移动书签到指定文件夹
 *
 * @param bookmarkId - 书签 ID
 * @param parentId - 目标文件夹 ID
 *
 * 使用示例：
 *   await moveBookmark('123', '456');
 */
export async function moveBookmark(bookmarkId: string, parentId: string): Promise<void> {
  if (!isChromeAvailable()) {
    console.warn('[MarkPage] Chrome API 不可用，跳过移动操作');
    return;
  }

  try {
    await chrome.bookmarks.move(bookmarkId, { parentId });
  } catch (error) {
    console.error(`[MarkPage] 移动书签 ${bookmarkId} 失败:`, error);
    throw new Error(`移动书签失败: ${(error as Error).message}`);
  }
}

/**
 * 创建书签
 *
 * @param title - 书签标题
 * @param url - 书签 URL
 * @param parentId - 父级文件夹 ID（可选）
 * @returns 新创建的书签节点
 *
 * 使用示例：
 *   const bookmark = await createBookmark('GitHub', 'https://github.com');
 */
export async function createBookmark(
  title: string,
  url: string,
  parentId?: string,
): Promise<chrome.bookmarks.BookmarkTreeNode> {
  if (!isChromeAvailable()) {
    console.warn('[MarkPage] Chrome API 不可用，返回模拟数据');
    return {
      id: String(Date.now()),
      title,
      url,
      parentId,
      dateAdded: Date.now(),
    } as chrome.bookmarks.BookmarkTreeNode;
  }

  try {
    return await chrome.bookmarks.create({ title, url, parentId });
  } catch (error) {
    console.error('[MarkPage] 创建书签失败:', error);
    throw new Error(`创建书签失败: ${(error as Error).message}`);
  }
}

/**
 * 创建书签文件夹
 *
 * @param title - 文件夹名称
 * @param parentId - 父级文件夹 ID（默认为书签栏根目录）
 * @returns 新创建的文件夹节点
 *
 * 使用示例：
 *   const folder = await createFolder('AI 工具');
 */
export async function createFolder(
  title: string,
  parentId?: string,
): Promise<chrome.bookmarks.BookmarkTreeNode> {
  if (!isChromeAvailable()) {
    console.warn('[MarkPage] Chrome API 不可用，返回模拟数据');
    return {
      id: String(Date.now()),
      title,
      parentId,
      dateAdded: Date.now(),
      children: [],
    } as chrome.bookmarks.BookmarkTreeNode;
  }

  try {
    // 不传 url 参数则创建文件夹
    return await chrome.bookmarks.create({ title, parentId });
  } catch (error) {
    console.error('[MarkPage] 创建文件夹失败:', error);
    throw new Error(`创建文件夹失败: ${(error as Error).message}`);
  }
}

/**
 * 删除书签
 *
 * @param bookmarkId - 书签 ID
 *
 * 使用示例：
 *   await removeBookmark('123');
 */
export async function removeBookmark(bookmarkId: string): Promise<void> {
  if (!isChromeAvailable()) {
    console.warn('[MarkPage] Chrome API 不可用，跳过删除操作');
    return;
  }

  try {
    await chrome.bookmarks.remove(bookmarkId);
  } catch (error) {
    console.error(`[MarkPage] 删除书签 ${bookmarkId} 失败:`, error);
    throw new Error(`删除书签失败: ${(error as Error).message}`);
  }
}

/**
 * 删除文件夹（连同其下所有子书签/子文件夹）
 *
 * 使用 chrome.bookmarks.removeTree，适用于非空文件夹。
 *
 * @param folderId - 文件夹 ID
 *
 * 使用示例：
 *   await removeFolder('123');
 */
export async function removeFolder(folderId: string): Promise<void> {
  if (!isChromeAvailable()) {
    console.warn('[MarkPage] Chrome API 不可用，跳过删除文件夹操作');
    return;
  }

  try {
    await chrome.bookmarks.removeTree(folderId);
  } catch (error) {
    console.error(`[MarkPage] 删除文件夹 ${folderId} 失败:`, error);
    throw new Error(`删除文件夹失败: ${(error as Error).message}`);
  }
}

/**
 * 更新书签的标题或 URL
 *
 * @param bookmarkId - 书签 ID
 * @param changes - 要更新的字段
 *
 * 使用示例：
 *   await updateBookmark('123', { title: '新标题' });
 */
export async function updateBookmark(
  bookmarkId: string,
  changes: { title?: string; url?: string },
): Promise<void> {
  if (!isChromeAvailable()) {
    console.warn('[MarkPage] Chrome API 不可用，跳过更新操作');
    return;
  }

  try {
    await chrome.bookmarks.update(bookmarkId, changes);
  } catch (error) {
    console.error(`[MarkPage] 更新书签 ${bookmarkId} 失败:`, error);
    throw new Error(`更新书签失败: ${(error as Error).message}`);
  }
}

/**
 * 获取"书签栏"下的前 N 个书签作为常用站点
 *
 * @param limit - 最大返回数量，默认 8
 * @returns 常用站点书签列表
 *
 * 使用示例：
 *   const pinnedSites = await getPinnedSites(6);
 */
export async function getPinnedSites(limit: number = 8): Promise<Bookmark[]> {
  if (!isChromeAvailable()) {
    return joinTags(MOCK_BOOKMARKS.slice(0, limit).map((b) => ({ ...b })));
  }

  try {
    const tree = await chrome.bookmarks.getTree();
    // 书签栏通常是根节点的第一个子节点（id 为 '1'）
    const bookmarkBar = tree[0]?.children?.[0];
    if (!bookmarkBar || !bookmarkBar.children) {
      return [];
    }

    const pinned: Bookmark[] = [];
    for (const node of bookmarkBar.children) {
      if (node.url && pinned.length < limit) {
        pinned.push(toBookmark(node));
      }
    }
    return joinTags(pinned);
  } catch (error) {
    console.error('[MarkPage] 获取常用站点失败:', error);
    return [];
  }
}

/**
 * 按添加时间排序返回最近添加的书签
 *
 * @param limit - 最大返回数量，默认 10
 * @returns 按时间倒序排列的书签列表
 *
 * 使用示例：
 *   const recent = await getRecentBookmarks(5);
 */
export async function getRecentBookmarks(limit: number = 10): Promise<Bookmark[]> {
  if (!isChromeAvailable()) {
    const mock = [...MOCK_BOOKMARKS]
      .sort((a, b) => (b.dateAdded ?? 0) - (a.dateAdded ?? 0))
      .slice(0, limit)
      .map((b) => ({ ...b }));
    return joinTags(mock);
  }

  try {
    const results = await chrome.bookmarks.getRecent(limit);
    const mapped = results.filter((node) => !!node.url).map(toBookmark);
    return joinTags(mapped);
  } catch (error) {
    console.error('[MarkPage] 获取最近书签失败:', error);
    return [];
  }
}
