/**
 * Service Worker — 后台服务
 *
 * 职责：
 *   1. 监听书签变化（新增、删除、移动）
 *   2. 触发 AI 自动分类（如果用户开启）
 *   3. 管理插件生命周期事件
 *
 * 使用示例：
 *   该文件由 manifest.json 的 background.service_worker 自动加载
 */

import { classify } from '@/services/ai';
import { extractCategories, getBookmarkTree, moveBookmark } from '@/services/bookmarks';
import { getSettings, saveSettings, getDefaultSettings } from '@/services/storage';
import { getAllTagDefs, ensureTag, setBookmarkTags } from '@/services/tags';
import { suggestTagsForBookmark } from '@/services/tag-ai';
import type { Bookmark, AIConfig, ClassifyResult } from '@/types';

// ============================================================
// 插件安装/更新事件
// ============================================================

/**
 * 插件安装或更新时触发
 *
 * 用于初始化默认设置、显示欢迎页等
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // 初始化默认设置
    try {
      const defaults = getDefaultSettings();
      await saveSettings(defaults);
      console.log('[MarkPage] 插件已安装，默认设置已初始化');
    } catch (error) {
      console.error('[MarkPage] 初始化设置失败:', error);
    }
  } else if (details.reason === 'update') {
    // 版本升级时合并新增字段
    try {
      const settings = await getSettings();
      await saveSettings(settings);
      console.log('[MarkPage] 插件已更新，设置已迁移');
    } catch (error) {
      console.error('[MarkPage] 迁移设置失败:', error);
    }
  }
});

// ============================================================
// 书签变化监听
// ============================================================

/**
 * 监听书签新增事件
 *
 * 当用户通过浏览器原生方式添加书签时：
 *   1. 检查 AI 分类是否启用
 *   2. 如果启用，调用 AI 分类服务
 *   3. 根据 autoConfirm 设置决定是否自动移动书签
 */
chrome.bookmarks.onCreated.addListener(async (id: string, bookmark: chrome.bookmarks.BookmarkTreeNode) => {
  console.log(`[MarkPage] 新书签: ${bookmark.title} (${bookmark.url})`);

  // 忽略文件夹创建
  if (!bookmark.url) return;

  try {
    // 获取用户设置
    const settings = await getSettings();

    // 检查 AI 是否启用
    if (!settings.ai.enabled || !settings.ai.apiKey) {
      // AI 未启用，只通知前端刷新
      notifyFrontend('bookmark-created', { id, bookmark });
      return;
    }

    // 并行执行 AI 分类 和 AI 自动打标（互不阻塞）
    await Promise.all([
      handleAutoClassify(bookmark, settings.ai).catch((error) => {
        console.error('[MarkPage] 自动分类失败:', error);
      }),
      handleAutoTag(bookmark, settings.ai).catch((error) => {
        console.error('[MarkPage] 后台自动打标失败:', error);
      }),
    ]);
  } catch (error) {
    console.error('[MarkPage] 处理新书签事件失败:', error);
  }
});

/**
 * 对新书签执行 AI 自动打标
 *
 * 流程：
 *   1. 拉取已有标签名列表（供 AI 优先复用）
 *   2. 调用 suggestTagsForBookmark 获取推荐标签
 *   3. 逐个 ensureTag 得到 tagId
 *   4. setBookmarkTags 写入关联
 *
 * 使用示例：
 *   await handleAutoTag(node, settings.ai);
 *
 * @param bookmark - 新增的书签节点
 * @param aiConfig - AI 配置
 */
async function handleAutoTag(
  bookmark: chrome.bookmarks.BookmarkTreeNode,
  aiConfig: AIConfig,
): Promise<void> {
  try {
    // 转换为 Bookmark 类型
    const bookmarkData: Bookmark = {
      id: bookmark.id,
      title: bookmark.title,
      url: bookmark.url ?? '',
      parentId: bookmark.parentId,
      dateAdded: bookmark.dateAdded,
    };

    // 拉取已有标签名（供 AI 优先复用）
    const defs = await getAllTagDefs();
    const existingNames = defs.map((d) => d.name);

    // 调用 AI 获取推荐标签
    const suggested = await suggestTagsForBookmark(bookmarkData, existingNames, aiConfig);
    if (!suggested || suggested.length === 0) {
      return;
    }

    // ensureTag 得到 ID 数组
    const tagIds: string[] = [];
    for (const name of suggested) {
      try {
        const id = await ensureTag(name);
        tagIds.push(id);
      } catch (error) {
        console.error('[MarkPage] 后台自动打标 ensureTag 失败:', error);
      }
    }

    if (tagIds.length === 0) return;

    await setBookmarkTags(bookmark.id, tagIds);
    console.log(`[MarkPage] 后台自动打标成功: ${bookmark.title} → [${suggested.join(', ')}]`);
  } catch (error) {
    console.error('[MarkPage] 后台自动打标失败:', error);
  }
}

/**
 * 监听书签删除事件
 */
chrome.bookmarks.onRemoved.addListener((id: string, removeInfo: chrome.bookmarks.BookmarkRemoveInfo) => {
  console.log(`[MarkPage] 书签已删除: ${id}`);
  // 通知前端刷新数据
  notifyFrontend('bookmark-removed', { id, removeInfo });
});

/**
 * 监听书签移动事件
 */
chrome.bookmarks.onMoved.addListener((id: string, moveInfo: chrome.bookmarks.BookmarkMoveInfo) => {
  console.log(`[MarkPage] 书签已移动: ${id}`);
  // 通知前端刷新数据
  notifyFrontend('bookmark-moved', { id, moveInfo });
});

/**
 * 监听书签修改事件（标题或 URL 变更）
 */
chrome.bookmarks.onChanged.addListener((id: string, changeInfo: chrome.bookmarks.BookmarkChangeInfo) => {
  console.log(`[MarkPage] 书签已修改: ${id}`);
  // 通知前端刷新数据
  notifyFrontend('bookmark-changed', { id, changeInfo });
});

// ============================================================
// AI 分类辅助函数
// ============================================================

/**
 * 对新书签执行 AI 自动分类
 *
 * @param bookmark - 新增的书签节点
 * @param aiConfig - AI 配置
 */
async function handleAutoClassify(
  bookmark: chrome.bookmarks.BookmarkTreeNode,
  aiConfig: AIConfig,
): Promise<void> {
  try {
    // 获取当前分类列表
    const tree = await getBookmarkTree();
    const categories = extractCategories(tree);

    // 将 BookmarkTreeNode 转为 Bookmark 类型
    const bookmarkData: Bookmark = {
      id: bookmark.id,
      title: bookmark.title,
      url: bookmark.url ?? '',
      parentId: bookmark.parentId,
      dateAdded: bookmark.dateAdded,
    };

    // 调用 AI 分类
    const result: ClassifyResult = await classify(bookmarkData, categories, aiConfig);

    console.log(`[MarkPage] AI 分类结果: ${result.category} (置信度: ${result.confidence})`);

    // 判断是否自动确认
    if (aiConfig.autoConfirm && result.confidence >= aiConfig.autoConfirmThreshold) {
      // 置信度足够高且开启了自动确认，直接移动书签
      const targetFolder = categories.find((c) => c.name === result.category);
      if (targetFolder) {
        await moveBookmark(bookmark.id, targetFolder.id);
        console.log(`[MarkPage] 书签已自动移动到: ${result.category}`);

        // 通知前端：已自动分类
        notifyFrontend('auto-classified', {
          bookmarkId: bookmark.id,
          bookmarkTitle: bookmark.title,
          result,
          autoMoved: true,
        });
      } else if (result.newCategory) {
        // 需要创建新分类，通知用户确认
        notifyClassifyResult(bookmark.title, result.category, result.confidence);
        notifyFrontend('classify-suggestion', {
          bookmarkId: bookmark.id,
          bookmarkTitle: bookmark.title,
          result,
          autoMoved: false,
        });
      }
    } else {
      // 需要用户确认
      notifyClassifyResult(bookmark.title, result.category, result.confidence);
      notifyFrontend('classify-suggestion', {
        bookmarkId: bookmark.id,
        bookmarkTitle: bookmark.title,
        result,
        autoMoved: false,
      });
    }
  } catch (error) {
    console.error('[MarkPage] 自动分类失败:', error);
    // 分类失败不影响书签创建，只通知前端
    notifyFrontend('classify-error', {
      bookmarkId: bookmark.id,
      error: (error as Error).message,
    });
  }
}

/**
 * 发送通知给用户确认分类
 *
 * 使用 Chrome Action Badge 显示分类建议数量
 *
 * @param bookmarkTitle - 书签标题
 * @param suggestedCategory - 建议分类
 * @param confidence - 置信度
 */
function notifyClassifyResult(
  bookmarkTitle: string,
  suggestedCategory: string,
  confidence: number,
): void {
  try {
    // 设置 Badge 提示用户有待确认的分类
    chrome.action.setBadgeText({ text: '1' });
    chrome.action.setBadgeBackgroundColor({ color: '#8b5cf6' });

    // 显示通知（如果有权限）
    if (chrome.notifications) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: '/icons/icon128.png',
        title: 'MarkPage 分类建议',
        message: `"${bookmarkTitle}" → ${suggestedCategory} (${Math.round(confidence * 100)}%)`,
      });
    }
  } catch (error) {
    console.error('[MarkPage] 发送通知失败:', error);
  }
}

// ============================================================
// 消息通信
// ============================================================

/**
 * 向前端页面（newtab / popup）发送消息
 *
 * @param type - 消息类型
 * @param data - 消息数据
 */
function notifyFrontend(type: string, data: Record<string, unknown>): void {
  try {
    chrome.runtime.sendMessage({ type, data }).catch(() => {
      // 没有活跃的接收者时会报错，静默忽略
    });
  } catch {
    // 消息发送失败时静默处理
  }
}
