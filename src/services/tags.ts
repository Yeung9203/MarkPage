/**
 * 标签数据层
 *
 * 统一管理标签定义和书签-标签关联关系，存储于 chrome.storage.local。
 * 存储两个键：
 *   - markpage_tag_defs:  TagDef[]                           —— 所有标签定义
 *   - markpage_tag_map:   Record<bookmarkId, string[]>       —— 书签 → 标签 ID 数组
 *
 * 使用示例：
 *   import { getBookmarkTagIds, setBookmarkTags, createTag } from '@/services/tags';
 *   const tagIds = await getBookmarkTagIds('bk_123');
 *   const tagId = await createTag('待读');
 *   await setBookmarkTags('bk_123', [tagId]);
 */

import type { TagDef } from '@/types';
import { get, set } from '@/services/storage';

/** 标签定义存储键 */
const TAG_DEFS_KEY = 'markpage_tag_defs';
/** 书签标签关联存储键 */
const TAG_MAP_KEY = 'markpage_tag_map';

/** 书签 → 标签 ID 映射 */
type TagMap = Record<string, string[]>;

// ============================================================
// 内部缓存（避免频繁读 storage）
// ============================================================

let defsCache: TagDef[] | null = null;
let mapCache: TagMap | null = null;

/** 清空内存缓存 */
function invalidateCache(): void {
  defsCache = null;
  mapCache = null;
}

/**
 * 生成简易唯一 ID
 *
 * @returns 12 位 base36 字符串
 */
function generateId(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  );
}

/**
 * 加载所有标签定义（带缓存）
 *
 * @returns 标签定义数组
 */
async function loadDefs(): Promise<TagDef[]> {
  if (defsCache) return defsCache;
  const stored = (await get<TagDef[]>(TAG_DEFS_KEY)) ?? [];
  defsCache = stored;
  return stored;
}

/**
 * 加载书签 → 标签关联表（带缓存）
 *
 * @returns 关联映射
 */
async function loadMap(): Promise<TagMap> {
  if (mapCache) return mapCache;
  const stored = (await get<TagMap>(TAG_MAP_KEY)) ?? {};
  mapCache = stored;
  return stored;
}

// ============================================================
// 标签 CRUD
// ============================================================

/**
 * 获取所有标签定义
 *
 * @returns 标签定义数组（按名称排序）
 *
 * 使用示例：
 *   const tags = await getAllTagDefs();
 */
export async function getAllTagDefs(): Promise<TagDef[]> {
  const defs = await loadDefs();
  return [...defs].sort((a, b) => a.name.localeCompare(b.name, 'zh'));
}

/**
 * 根据 ID 查找标签定义
 *
 * @param id - 标签 ID
 * @returns 标签定义（不存在返回 null）
 */
export async function getTagDef(id: string): Promise<TagDef | null> {
  const defs = await loadDefs();
  return defs.find((d) => d.id === id) ?? null;
}

/**
 * 根据名称查找或创建标签
 *
 * 会匹配 name 或 aliases；名称大小写与空格不敏感。
 *
 * @param name - 标签名
 * @returns 标签 ID
 *
 * 使用示例：
 *   const tagId = await ensureTag('待读');
 */
export async function ensureTag(name: string): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('标签名不能为空');

  const defs = await loadDefs();
  const key = trimmed.toLowerCase();

  const existed = defs.find((d) => {
    if (d.name.toLowerCase() === key) return true;
    if (d.aliases?.some((a) => a.toLowerCase() === key)) return true;
    return false;
  });
  if (existed) return existed.id;

  return createTag(trimmed);
}

/**
 * 创建一个新标签（不检查重名，调用方已确认）
 *
 * @param name - 标签名
 * @returns 新标签 ID
 */
export async function createTag(name: string): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('标签名不能为空');

  const defs = await loadDefs();
  const newDef: TagDef = {
    id: generateId(),
    name: trimmed,
    createdAt: Date.now(),
  };
  const next = [...defs, newDef];
  await set(TAG_DEFS_KEY, next);
  defsCache = next;
  return newDef.id;
}

/**
 * 重命名标签
 *
 * 老名自动写入 aliases，保证历史搜索仍能命中
 *
 * @param id - 标签 ID
 * @param newName - 新名称
 */
export async function renameTag(id: string, newName: string): Promise<void> {
  const trimmed = newName.trim();
  if (!trimmed) throw new Error('标签名不能为空');

  const defs = await loadDefs();
  const idx = defs.findIndex((d) => d.id === id);
  if (idx < 0) return;

  const old = defs[idx];
  const aliases = new Set(old.aliases ?? []);
  if (old.name !== trimmed) aliases.add(old.name);

  const updated: TagDef = { ...old, name: trimmed, aliases: Array.from(aliases) };
  const next = [...defs];
  next[idx] = updated;
  await set(TAG_DEFS_KEY, next);
  defsCache = next;
}

/**
 * 删除标签
 *
 * 同时从所有书签的关联中移除该标签
 *
 * @param id - 标签 ID
 */
export async function deleteTag(id: string): Promise<void> {
  const defs = await loadDefs();
  const nextDefs = defs.filter((d) => d.id !== id);
  await set(TAG_DEFS_KEY, nextDefs);
  defsCache = nextDefs;

  // 从关联表中移除该标签
  const map = await loadMap();
  const nextMap: TagMap = {};
  let changed = false;
  for (const [bkId, tagIds] of Object.entries(map)) {
    const filtered = tagIds.filter((t) => t !== id);
    if (filtered.length !== tagIds.length) changed = true;
    if (filtered.length > 0) nextMap[bkId] = filtered;
  }
  if (changed) {
    await set(TAG_MAP_KEY, nextMap);
    mapCache = nextMap;
  }
}

/**
 * 合并两个标签：source 的所有关联迁移到 target，source 被删除
 *
 * source 的 name 和 aliases 都写入 target 的 aliases
 *
 * @param sourceId - 被合并的标签 ID
 * @param targetId - 目标标签 ID
 */
export async function mergeTag(sourceId: string, targetId: string): Promise<void> {
  if (sourceId === targetId) return;

  const defs = await loadDefs();
  const source = defs.find((d) => d.id === sourceId);
  const target = defs.find((d) => d.id === targetId);
  if (!source || !target) return;

  // 迁移 aliases
  const aliases = new Set(target.aliases ?? []);
  aliases.add(source.name);
  source.aliases?.forEach((a) => aliases.add(a));
  const updatedTarget: TagDef = { ...target, aliases: Array.from(aliases) };

  const nextDefs = defs
    .filter((d) => d.id !== sourceId)
    .map((d) => (d.id === targetId ? updatedTarget : d));
  await set(TAG_DEFS_KEY, nextDefs);
  defsCache = nextDefs;

  // 迁移关联表中的 sourceId → targetId
  const map = await loadMap();
  const nextMap: TagMap = {};
  for (const [bkId, tagIds] of Object.entries(map)) {
    const replaced = tagIds.map((t) => (t === sourceId ? targetId : t));
    // 去重
    const unique = Array.from(new Set(replaced));
    nextMap[bkId] = unique;
  }
  await set(TAG_MAP_KEY, nextMap);
  mapCache = nextMap;
}

// ============================================================
// 书签-标签关联
// ============================================================

/**
 * 获取指定书签的标签 ID 列表
 *
 * @param bookmarkId - 书签 ID
 * @returns 标签 ID 数组
 */
export async function getBookmarkTagIds(bookmarkId: string): Promise<string[]> {
  const map = await loadMap();
  return map[bookmarkId] ?? [];
}

/**
 * 批量获取所有书签的标签关联
 *
 * @returns 完整关联映射（只读，调用方不应修改）
 */
export async function getAllBookmarkTagMap(): Promise<TagMap> {
  return loadMap();
}

/**
 * 覆盖式设置书签的标签
 *
 * @param bookmarkId - 书签 ID
 * @param tagIds - 新的标签 ID 数组（传空数组表示清空）
 */
export async function setBookmarkTags(bookmarkId: string, tagIds: string[]): Promise<void> {
  const map = await loadMap();
  const unique = Array.from(new Set(tagIds));
  const next: TagMap = { ...map };
  if (unique.length === 0) {
    delete next[bookmarkId];
  } else {
    next[bookmarkId] = unique;
  }
  await set(TAG_MAP_KEY, next);
  mapCache = next;
}

/**
 * 给书签追加一个标签（已存在则忽略）
 *
 * @param bookmarkId - 书签 ID
 * @param tagId - 要添加的标签 ID
 */
export async function addBookmarkTag(bookmarkId: string, tagId: string): Promise<void> {
  const existing = await getBookmarkTagIds(bookmarkId);
  if (existing.includes(tagId)) return;
  await setBookmarkTags(bookmarkId, [...existing, tagId]);
}

/**
 * 从书签移除一个标签
 *
 * @param bookmarkId - 书签 ID
 * @param tagId - 要移除的标签 ID
 */
export async function removeBookmarkTag(bookmarkId: string, tagId: string): Promise<void> {
  const existing = await getBookmarkTagIds(bookmarkId);
  const next = existing.filter((t) => t !== tagId);
  if (next.length === existing.length) return;
  await setBookmarkTags(bookmarkId, next);
}

/**
 * 统计每个标签的使用次数
 *
 * @returns 标签 ID → 被多少个书签使用
 */
export async function getTagUsageCount(): Promise<Record<string, number>> {
  const map = await loadMap();
  const counts: Record<string, number> = {};
  for (const tagIds of Object.values(map)) {
    for (const id of tagIds) {
      counts[id] = (counts[id] ?? 0) + 1;
    }
  }
  return counts;
}

// ============================================================
// 便捷解析函数（常用于 UI 渲染和搜索）
// ============================================================

/**
 * 把标签 ID 数组解析为标签名数组
 *
 * @param tagIds - 标签 ID 数组
 * @returns 对应的标签名数组（顺序保持，未找到的跳过）
 */
export async function resolveTagNames(tagIds: string[]): Promise<string[]> {
  if (tagIds.length === 0) return [];
  const defs = await loadDefs();
  const idMap = new Map(defs.map((d) => [d.id, d]));
  const out: string[] = [];
  for (const id of tagIds) {
    const d = idMap.get(id);
    if (d) out.push(d.name);
  }
  return out;
}

/**
 * 根据名称查找标签 ID（支持 alias，大小写与空格不敏感）
 *
 * @param name - 标签名
 * @returns 标签 ID（未找到返回 null）
 */
export async function findTagIdByName(name: string): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const defs = await loadDefs();
  const key = trimmed.toLowerCase();
  const hit = defs.find((d) => {
    if (d.name.toLowerCase() === key) return true;
    if (d.aliases?.some((a) => a.toLowerCase() === key)) return true;
    return false;
  });
  return hit?.id ?? null;
}

/**
 * 清理孤儿标签关联（关联到已不存在的书签）
 *
 * 调用方需传入当前有效的书签 ID 集合
 *
 * @param validBookmarkIds - 当前存在的书签 ID 集合
 */
export async function gcBookmarkTags(validBookmarkIds: Set<string>): Promise<void> {
  const map = await loadMap();
  const next: TagMap = {};
  let changed = false;
  for (const [bkId, tagIds] of Object.entries(map)) {
    if (validBookmarkIds.has(bkId)) {
      next[bkId] = tagIds;
    } else {
      changed = true;
    }
  }
  if (changed) {
    await set(TAG_MAP_KEY, next);
    mapCache = next;
  }
}

/**
 * 强制刷新缓存（设置页/外部修改后调用）
 */
export function refreshTagCache(): void {
  invalidateCache();
}
