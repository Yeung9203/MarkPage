/**
 * AI 分类通知组件
 *
 * 右下角浮出通知，显示 AI 对新书签的分类建议。
 *
 * 功能：
 *   - 显示网页信息（标题 + URL）
 *   - 推荐分类（带置信度百分比）
 *   - 备选分类
 *   - 确认/选择其他按钮
 *   - 5 秒自动确认倒计时（仅置信度 > 80%）
 *
 * 使用示例：
 *   import { showAIToast } from './ai-toast';
 *   showAIToast(classifyResult, bookmark);
 */

import { h, on } from '@/utils/dom';
import type { Bookmark, ClassifyResult, Category } from '@/types';
import { moveBookmark, getBookmarkTree, extractCategories, createFolder } from '@/services/bookmarks';
import { saveClassifyHistory } from '@/services/ai';
import { iconClose } from './icons';

/** Toast 元素引用 */
let toastEl: HTMLElement | null = null;
/** 倒计时定时器 */
let timerInterval: ReturnType<typeof setInterval> | null = null;

/**
 * 获取或创建 Toast 容器
 *
 * @returns Toast DOM 元素
 */
function getToast(): HTMLElement {
  if (!toastEl) {
    toastEl = h('div', {
      class: 'ai-toast',
      id: 'aiToast',
    });
    document.body.appendChild(toastEl);
  }
  return toastEl;
}

/**
 * 确认分类并执行移动
 *
 * @param bookmark - 要移动的书签
 * @param categoryName - 目标分类名称
 */
async function confirmClassification(bookmark: Bookmark, categoryName: string): Promise<void> {
  try {
    // 获取分类树，查找目标文件夹 ID
    const tree = await getBookmarkTree();
    const categories = extractCategories(tree);

    let targetFolderId: string | null = null;

    // 在分类树中查找匹配的文件夹 ID
    const findCategoryId = (cats: Category[]): string | null => {
      for (const cat of cats) {
        if (cat.name === categoryName) return cat.id;
        if (cat.children) {
          const found = findCategoryId(cat.children);
          if (found) return found;
        }
      }
      return null;
    };

    targetFolderId = findCategoryId(categories);

    // 如果找不到分类，创建新文件夹
    if (!targetFolderId) {
      const folder = await createFolder(categoryName);
      targetFolderId = folder.id;
    }

    // 执行移动
    await moveBookmark(bookmark.id, targetFolderId);

    // 保存分类历史
    await saveClassifyHistory(bookmark, categoryName);

    console.log(`[MarkPage] 已将 "${bookmark.title}" 移动到 "${categoryName}"`);
  } catch (error) {
    console.error('[MarkPage] 确认分类失败:', error);
  }

  hideAIToast();
}

/**
 * 显示分类选择器（选择其他分类）
 *
 * @param bookmark - 要分类的书签
 */
async function showCategorySelector(bookmark: Bookmark): Promise<void> {
  // 清除倒计时
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  const toast = getToast();
  if (!toast) return;

  // 移除现有的选择器（如果有的话）
  const existingSelector = toast.querySelector('.toast-category-selector');
  if (existingSelector) existingSelector.remove();

  // 创建选择器容器
  const selector = h('div', {
    class: 'toast-category-selector',
    style: 'margin-top:8px;max-height:150px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;background:var(--bg-0)',
  });

  try {
    const tree = await getBookmarkTree();
    const categories = extractCategories(tree);

    if (categories.length === 0) {
      selector.appendChild(h('div', {
        style: 'padding:8px;font-size:12px;color:var(--text-3)',
      }, '暂无分类'));
    } else {
      categories.forEach(cat => {
        const catBtn = h('button', {
          style: 'display:block;width:100%;padding:6px 10px;font-family:var(--font);font-size:12px;color:var(--text-1);background:none;border:none;border-bottom:1px solid var(--border);cursor:pointer;text-align:left;transition:background var(--fast)',
        }, cat.name);

        on(catBtn, 'mouseenter', () => { catBtn.style.background = 'var(--bg-hover)'; });
        on(catBtn, 'mouseleave', () => { catBtn.style.background = ''; });

        on(catBtn, 'click', () => {
          confirmClassification(bookmark, cat.name);
        });

        selector.appendChild(catBtn);
      });
    }
  } catch (error) {
    console.error('[MarkPage] 获取分类列表失败:', error);
    selector.appendChild(h('div', {
      style: 'padding:8px;font-size:12px;color:var(--text-3)',
    }, '加载分类失败'));
  }

  // 移除倒计时文字和操作按钮区域
  const timerEl = document.getElementById('aiToastTimer');
  if (timerEl) timerEl.remove();

  toast.appendChild(selector);
}

/**
 * 显示 AI 分类通知
 *
 * @param result - AI 分类结果
 * @param bookmark - 被分类的书签
 *
 * 使用示例：
 *   showAIToast({
 *     category: '技术文档',
 *     confidence: 0.92,
 *     alternatives: [{ category: '开发工具', confidence: 0.71 }]
 *   }, { id: '1', title: 'MDN Web Docs', url: 'https://developer.mozilla.org' });
 */
export function showAIToast(result: ClassifyResult, bookmark: Bookmark): void {
  const toast = getToast();

  // 清除之前的倒计时
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  // 获取书签首字母和颜色
  const letter = bookmark.title.charAt(0).toUpperCase();
  const shortUrl = (() => {
    try {
      const u = new URL(bookmark.url.startsWith('http') ? bookmark.url : 'https://' + bookmark.url);
      return u.hostname.replace(/^www\./, '');
    } catch {
      return bookmark.url;
    }
  })();

  // 置信度百分比
  const confPct = Math.round(result.confidence * 100);
  const autoConfirm = confPct > 80;

  // 构建内容
  toast.innerHTML = '';

  // 头部
  const header = h('div', {
    style: 'display:flex;align-items:center;gap:6px;margin-bottom:10px',
  });
  header.innerHTML = `
    <span style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--accent);background:var(--accent-soft);padding:2px 6px;border-radius:3px">AI 分类</span>
    <span style="font-size:11px;color:var(--text-3)">已为你找到最佳分类</span>
  `;
  const closeBtn = h('button', {
    style: 'margin-left:auto;width:20px;height:20px;display:flex;align-items:center;justify-content:center;background:none;border:none;cursor:pointer;color:var(--text-4);border-radius:4px',
  });
  closeBtn.innerHTML = iconClose(14);
  on(closeBtn, 'click', hideAIToast);
  header.appendChild(closeBtn);
  toast.appendChild(header);

  // 网页信息
  const pageInfo = h('div', {
    style: 'display:flex;align-items:center;gap:8px;padding:8px;background:var(--bg-0);border-radius:6px;margin-bottom:10px',
  });
  pageInfo.innerHTML = `
    <span class="f-blue" style="width:24px;height:24px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0">${letter}</span>
    <div>
      <div style="font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${bookmark.title}</div>
      <div style="font-size:11px;color:var(--text-4)">${shortUrl}</div>
    </div>
  `;
  toast.appendChild(pageInfo);

  // 分类建议
  const suggestions = h('div', {
    style: 'display:flex;flex-direction:column;gap:4px;margin-bottom:10px',
  });

  // 主推荐
  const primarySug = h('div', {
    style: 'display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px solid var(--accent);background:var(--accent-soft);border-radius:6px;cursor:pointer;transition:all var(--fast);font-size:12px',
  });
  primarySug.innerHTML = `
    <span>\uD83D\uDCC2</span>
    <span style="flex:1;font-weight:500">${result.category}</span>
    <span style="font-size:11px;color:var(--accent);font-weight:600;font-variant-numeric:tabular-nums">${confPct}%</span>
  `;
  // 点击主推荐也可以直接确认
  on(primarySug, 'click', () => {
    confirmClassification(bookmark, result.category);
  });
  suggestions.appendChild(primarySug);

  // 备选分类
  result.alternatives.forEach(alt => {
    const altPct = Math.round(alt.confidence * 100);
    const altSug = h('div', {
      style: 'display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;cursor:pointer;transition:all var(--fast);font-size:12px',
    });
    altSug.innerHTML = `
      <span>\uD83D\uDCC2</span>
      <span style="flex:1;font-weight:500">${alt.category}</span>
      <span style="font-size:11px;color:var(--accent);font-weight:600;font-variant-numeric:tabular-nums">${altPct}%</span>
    `;
    on(altSug, 'click', () => {
      // 选择备选分类并执行移动
      confirmClassification(bookmark, alt.category);
    });
    suggestions.appendChild(altSug);
  });

  toast.appendChild(suggestions);

  // 操作按钮
  const actions = h('div', {
    style: 'display:flex;gap:6px',
  });
  const confirmBtn = h('button', {
    style: 'flex:1;padding:6px;font-family:var(--font);font-size:12px;font-weight:500;border:none;border-radius:6px;cursor:pointer;color:white;background:var(--accent);transition:all var(--fast)',
  }, '确认分类');
  on(confirmBtn, 'click', () => {
    confirmClassification(bookmark, result.category);
  });

  const otherBtn = h('button', {
    style: 'flex:1;padding:6px;font-family:var(--font);font-size:12px;font-weight:500;border:none;border-radius:6px;cursor:pointer;color:var(--text-2);background:var(--bg-3);transition:all var(--fast)',
  }, '选择其他');
  on(otherBtn, 'click', () => {
    showCategorySelector(bookmark);
  });

  actions.appendChild(confirmBtn);
  actions.appendChild(otherBtn);
  toast.appendChild(actions);

  // 自动确认倒计时（仅 confidence > 80%）
  if (autoConfirm) {
    const timerEl = h('div', {
      id: 'aiToastTimer',
      style: 'text-align:center;font-size:11px;color:var(--text-4);margin-top:6px',
    }, '5 秒后自动确认');
    toast.appendChild(timerEl);

    let countdown = 5;
    timerInterval = setInterval(() => {
      countdown--;
      if (timerEl) timerEl.textContent = `${countdown} 秒后自动确认`;
      if (countdown <= 0) {
        // 自动确认：执行分类移动
        confirmClassification(bookmark, result.category);
      }
    }, 1000);
  }

  // 显示 toast
  toast.classList.add('visible');
}

/**
 * 隐藏 AI 分类通知
 */
export function hideAIToast(): void {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  if (toastEl) {
    toastEl.classList.remove('visible');
  }
}
