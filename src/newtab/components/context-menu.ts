/**
 * 右键操作菜单组件
 *
 * 点击书签行的三点按钮时弹出操作菜单。
 *
 * 菜单项：
 *   - 打开链接
 *   - 复制链接
 *   - 编辑书签
 *   - 移动到...
 *   - 设为常用
 *   - 删除（红色危险操作）
 *
 * 使用示例：
 *   import { showContextMenu } from './context-menu';
 *   showContextMenu(event.clientY, event.clientX, bookmark);
 */

import { h, on } from '@/utils/dom';
import type { Bookmark } from '@/types';
import {
  updateBookmark, moveBookmark, removeBookmark, getBookmarkTree, extractCategories,
} from '@/services/bookmarks';
import {
  addFrequent, removeFrequent, isFrequent,
} from '@/services/storage';
import {
  ensureTag, addBookmarkTag, getBookmarkTagIds, resolveTagNames,
} from '@/services/tags';
import { showTagPopover } from './tag-popover';
import {
  iconExternalLink, iconCopy, iconEdit,
  iconMove, iconStar, iconStarFilled, iconTrash
} from './icons';

/** 菜单容器（单例，复用同一个 DOM 元素） */
let menuEl: HTMLElement | null = null;

/**
 * 获取或创建菜单容器
 *
 * @returns 菜单 DOM 元素
 */
function getMenu(): HTMLElement {
  if (!menuEl) {
    menuEl = h('div', {
      class: 'ctx-menu',
      id: 'ctxMenu',
    });
    document.body.appendChild(menuEl);

    // 点击空白处关闭
    on(document, 'click', (e: MouseEvent) => {
      if (
        menuEl &&
        !(e.target as HTMLElement).closest('.ctx-menu') &&
        !(e.target as HTMLElement).closest('.bk-act') &&
        !(e.target as HTMLElement).closest('.ctx-edit-form') &&
        !(e.target as HTMLElement).closest('.ctx-move-panel')
      ) {
        hideContextMenu();
        removeEditForm();
        removeMovePanel();
      }
    });
  }
  return menuEl;
}

/**
 * 显示右键操作菜单
 *
 * @param top - 菜单顶部 Y 坐标
 * @param left - 菜单左侧 X 坐标
 * @param bookmark - 目标书签数据
 */
export async function showContextMenu(top: number, left: number, bookmark: Bookmark): Promise<void> {
  const menu = getMenu();

  // 先移除可能残留的编辑表单和移动面板
  removeEditForm();
  removeMovePanel();

  // 预读常用标记状态（异步）
  const markedFrequent = await isFrequent(bookmark.id);

  // 菜单项定义
  const items = [
    {
      icon: iconCopy(),
      label: '复制链接',
      action: () => {
        navigator.clipboard.writeText(bookmark.url).catch(() => {
          // 静默失败
        });
      },
    },
    {
      icon: iconEdit(),
      label: '编辑书签',
      action: () => {
        showEditForm(bookmark);
      },
    },
    {
      // 编辑标签：弹出标签 popover，锚定书签所在行
      icon: iconEdit(),
      label: '编辑标签',
      action: async () => {
        const row = document.querySelector(
          `.bk-row[data-bookmark-id="${bookmark.id}"]`,
        ) as HTMLElement | null;
        if (!row) return;
        // 锚定到该行右侧的标签 chip 区，而非整行最左侧
        const tagsCell = row.querySelector('[data-role="tags"]') as HTMLElement | null;
        const anchor = tagsCell ?? row;
        showTagPopover(anchor, bookmark, async () => {
          // 标签变化后刷新行上的 chip（保证与数据一致）
          try {
            const ids = await getBookmarkTagIds(bookmark.id);
            const names = await resolveTagNames(ids);
            updateRowTagChips(row, names);
          } catch (err) {
            console.error('[MarkPage] 刷新标签 chip 失败:', err);
          }
        });
      },
    },
    {
      icon: iconMove(),
      label: '移动到...',
      action: () => {
        showMovePanel(bookmark);
      },
    },
    {
      icon: markedFrequent ? iconStarFilled() : iconStar(),
      starred: markedFrequent,
      label: markedFrequent ? '取消常用' : '设为常用',
      action: async () => {
        // 切换常用标记（存储到 storage，不移动书签）
        try {
          if (markedFrequent) {
            await removeFrequent(bookmark.id);
          } else {
            await addFrequent(bookmark.id);
          }
          const row = document.querySelector(
            `.bk-row[data-bookmark-id="${bookmark.id}"]`,
          ) as HTMLElement;
          if (row) {
            row.setAttribute('data-frequent', markedFrequent ? 'false' : 'true');
          }
          // 如果当前处于"常用"筛选视图，重新应用筛选以实时更新可见行
          const activeNav = document.querySelector(
            '.sidebar-item.active[data-filter]',
          ) as HTMLElement | null;
          const currentFilter = activeNav?.getAttribute('data-filter');
          if (currentFilter === 'frequent') {
            const { filterBookmarkGroups } = await import('./bookmark-list');
            filterBookmarkGroups('frequent');
          }
          // 同步侧边栏常用计数
          try {
            const { updateNavCounts } = await import('./sidebar');
            updateNavCounts?.();
          } catch {
            /* 可选调用 */
          }
          // 刷新顶部常用站点条
          try {
            const [{ refreshHeaderPins }, { getAllBookmarks }, { getFrequentIds }] = await Promise.all([
              import('./header'),
              import('@/services/bookmarks'),
              import('@/services/storage'),
            ]);
            const [allBks, freqIds] = await Promise.all([getAllBookmarks(), getFrequentIds()]);
            const marked = allBks.filter((b) => freqIds.includes(b.id));
            // 复用 main.ts 中 buildPinnedSites 的逻辑（这里简化）
            const COLOR_POOL = ['f-gray', 'f-blue', 'f-green', 'f-amber', 'f-red', 'f-purple', 'f-teal', 'f-pink'];
            const pins = marked.slice(0, 12).map((b) => {
              let letter = (b.title.trim().charAt(0) || '?').toUpperCase();
              let hash = 0;
              for (let i = 0; i < b.title.length; i++) hash = ((hash << 5) - hash + b.title.charCodeAt(i)) | 0;
              const colorClass = COLOR_POOL[Math.abs(hash) % COLOR_POOL.length];
              let url = b.url;
              try { url = new URL(b.url).hostname.replace(/^www\./, ''); } catch { /* keep */ }
              return { title: b.title || url, url, letter, colorClass };
            });
            refreshHeaderPins(pins);
          } catch (err) {
            console.warn('[MarkPage] 刷新顶部常用站点条失败:', err);
          }
          console.log(
            `[MarkPage] 已${markedFrequent ? '取消' : '设为'}常用："${bookmark.title}"`,
          );
        } catch (error) {
          console.error('[MarkPage] 切换常用失败:', error);
        }
      },
    },
    { divider: true },
    {
      icon: iconTrash(),
      label: '删除',
      danger: true,
      action: async () => {
        // 执行删除操作
        try {
          await removeBookmark(bookmark.id);
          // 从 DOM 中移除对应行
          const row = document.querySelector(`.bk-row[data-bookmark-id="${bookmark.id}"]`);
          if (row) {
            const group = row.closest('.group');
            row.remove();
            // 更新分组计数
            if (group) {
              const remainingRows = group.querySelectorAll('.bk-row');
              const countEl = group.querySelector('.group-count');
              if (countEl) countEl.textContent = String(remainingRows.length);
              // 如果分组为空则隐藏
              if (remainingRows.length === 0) {
                (group as HTMLElement).style.display = 'none';
              }
            }
            // 更新头部总数
            const headerCount = document.getElementById('headerCount');
            if (headerCount) {
              const total = document.querySelectorAll('.bk-row').length;
              headerCount.textContent = `${total} 个书签`;
            }
          }
          console.log(`[MarkPage] 已删除书签 "${bookmark.title}"`);
        } catch (error) {
          console.error('[MarkPage] 删除书签失败:', error);
        }
      },
    },
  ];

  // 构建菜单内容
  menu.innerHTML = '';

  items.forEach(item => {
    if ('divider' in item && item.divider) {
      menu.appendChild(h('div', { class: 'ctx-divider' }));
      return;
    }

    const menuItem = h('button', {
      class: `ctx-item${'danger' in item && item.danger ? ' danger' : ''}${'starred' in item && item.starred ? ' starred' : ''}`,
    });
    menuItem.innerHTML = `<span style="width:14px;height:14px;display:flex;align-items:center">${item.icon}</span>${item.label}`;

    on(menuItem, 'click', () => {
      hideContextMenu();
      if ('action' in item && item.action) item.action();
    });

    menu.appendChild(menuItem);
  });

  // 定位菜单
  menu.style.top = `${top}px`;
  menu.style.left = `${left}px`;
  menu.classList.add('visible');
}

/**
 * 隐藏右键操作菜单
 */
export function hideContextMenu(): void {
  if (menuEl) {
    menuEl.classList.remove('visible');
  }
}

/**
 * 显示内联编辑表单
 *
 * 在书签行上方覆盖一个编辑表单，包含标题和 URL 输入框 + 保存/取消按钮
 *
 * @param bookmark - 要编辑的书签
 */
function showEditForm(bookmark: Bookmark): void {
  // 先移除已有的编辑表单
  removeEditForm();

  const row = document.querySelector(`.bk-row[data-bookmark-id="${bookmark.id}"]`) as HTMLElement;
  if (!row) return;

  // 创建编辑表单覆盖在行上
  const form = h('div', {
    class: 'ctx-edit-form',
    style: 'display:flex;align-items:center;gap:6px;padding:6px 12px;background:var(--bg-1);border:1px solid var(--accent);border-radius:6px;position:absolute;left:0;right:0;top:0;bottom:0;z-index:10',
  });
  // 阻止表单内的任何点击冒泡到行（避免触发"打开链接"）
  on(form, 'click', (e: MouseEvent) => e.stopPropagation());
  on(form, 'mousedown', (e: MouseEvent) => e.stopPropagation());

  // 标题输入框
  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.value = bookmark.title;
  titleInput.placeholder = '标题';
  titleInput.style.cssText = 'flex:1;min-width:0;padding:4px 8px;font-family:var(--font);font-size:12px;color:var(--text-1);background:var(--bg-2);border:1px solid var(--border);border-radius:4px;outline:none';

  // URL 输入框
  const urlInput = document.createElement('input');
  urlInput.type = 'text';
  urlInput.value = bookmark.url;
  urlInput.placeholder = 'URL';
  urlInput.style.cssText = 'flex:1;min-width:0;padding:4px 8px;font-family:var(--font);font-size:12px;color:var(--text-1);background:var(--bg-2);border:1px solid var(--border);border-radius:4px;outline:none';

  // 保存按钮
  const saveBtn = h('button', {
    style: 'padding:4px 10px;font-family:var(--font);font-size:11px;font-weight:500;border:none;border-radius:4px;cursor:pointer;color:white;background:var(--accent);white-space:nowrap',
  }, '保存');

  // 取消按钮
  const cancelBtn = h('button', {
    style: 'padding:4px 10px;font-family:var(--font);font-size:11px;font-weight:500;border:none;border-radius:4px;cursor:pointer;color:var(--text-2);background:var(--bg-3);white-space:nowrap',
  }, '取消');

  on(saveBtn, 'click', async () => {
    const newTitle = titleInput.value.trim();
    const newUrl = urlInput.value.trim();
    if (!newTitle || !newUrl) return;

    try {
      await updateBookmark(bookmark.id, { title: newTitle, url: newUrl });
      // 更新 DOM 中的显示
      const titleEl = row.querySelector('.bk-title');
      const urlEl = row.querySelector('.bk-url');
      if (titleEl) titleEl.textContent = newTitle;
      if (urlEl) {
        try {
          const u = new URL(newUrl.startsWith('http') ? newUrl : 'https://' + newUrl);
          urlEl.textContent = u.hostname.replace(/^www\./, '') + (u.pathname !== '/' ? u.pathname : '');
        } catch {
          urlEl.textContent = newUrl;
        }
      }
      row.setAttribute('data-title', newTitle);
      row.setAttribute('data-url', newUrl);
      console.log(`[MarkPage] 已更新书签 "${newTitle}"`);
    } catch (error) {
      console.error('[MarkPage] 更新书签失败:', error);
    }
    removeEditForm();
  });

  on(cancelBtn, 'click', () => {
    removeEditForm();
  });

  form.appendChild(titleInput);
  form.appendChild(urlInput);
  form.appendChild(saveBtn);
  form.appendChild(cancelBtn);

  // 将行设为相对定位以容纳绝对定位的表单
  row.style.position = 'relative';
  row.appendChild(form);

  // 聚焦标题输入框
  setTimeout(() => titleInput.focus(), 0);
}

/**
 * 移除编辑表单
 */
function removeEditForm(): void {
  const form = document.querySelector('.ctx-edit-form');
  if (form) {
    const row = form.parentElement;
    form.remove();
    if (row) row.style.position = '';
  }
}

/**
 * 显示移动到面板
 *
 * 弹出一个浮层，显示所有分类文件夹，点击某个分类执行移动
 *
 * @param bookmark - 要移动的书签
 */
async function showMovePanel(bookmark: Bookmark): Promise<void> {
  // 先移除已有面板
  removeMovePanel();

  const row = document.querySelector(`.bk-row[data-bookmark-id="${bookmark.id}"]`) as HTMLElement;
  if (!row) return;

  // 锚定到该行右侧的标签 chip 区，与"编辑标签"浮层保持一致
  const anchor =
    (row.querySelector('[data-role="tags"]') as HTMLElement | null) ?? row;
  const rect = anchor.getBoundingClientRect();
  const PANEL_W = 240;
  const margin = 8;
  let left = rect.right - PANEL_W; // 右对齐到 chip 区尾部
  if (left < margin) left = margin;
  if (left + PANEL_W + margin > window.innerWidth) {
    left = window.innerWidth - PANEL_W - margin;
  }

  // 创建浮层
  const panel = h('div', {
    class: 'ctx-move-panel',
    style: `position:fixed;top:${rect.bottom + 6}px;left:${left}px;width:${PANEL_W}px;max-height:320px;overflow-y:auto;background:var(--bg-1);border:1px solid var(--border);border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,0.28),0 2px 8px rgba(0,0,0,0.12);z-index:500;padding:6px;font-family:var(--font);backdrop-filter:blur(8px)`,
  });

  // 标题
  const title = h('div', {
    style: 'display:flex;align-items:center;gap:6px;font-size:11px;font-weight:600;color:var(--text-3);padding:6px 10px 8px;letter-spacing:0.02em;text-transform:uppercase',
  }, '移动到');
  panel.appendChild(title);

  // 获取分类列表
  try {
    const tree = await getBookmarkTree();
    const categories = extractCategories(tree);

    if (categories.length === 0) {
      // 没有分类时显示提示
      panel.appendChild(h('div', {
        style: 'font-size:12px;color:var(--text-3);padding:8px',
      }, '暂无可用分类'));
    } else {
      /**
       * 递归渲染一个分类项（含所有后代）
       *
       * @param cat - 分类节点
       * @param depth - 缩进层级（0 = 顶层）
       */
      const renderCat = (cat: import('@/types').Category, depth: number): void => {
        const basePad = 10 + depth * 14;
        const isTop = depth === 0;
        const catBtn = h('button', {
          style: `display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;padding:${isTop ? 7 : 6}px 10px ${isTop ? 7 : 6}px ${basePad}px;font-family:var(--font);font-size:${isTop ? 12.5 : 12}px;font-weight:${isTop ? 500 : 400};color:${isTop ? 'var(--text-1)' : 'var(--text-2)'};background:none;border:none;border-radius:6px;cursor:pointer;text-align:left;transition:background var(--fast)`,
        });
        catBtn.innerHTML = `<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(cat.name)}</span><span style="color:var(--text-4);font-size:11px;flex-shrink:0">${cat.count}</span>`;

        on(catBtn, 'mouseenter', () => { catBtn.style.background = 'var(--bg-hover)'; });
        on(catBtn, 'mouseleave', () => { catBtn.style.background = ''; });

        on(catBtn, 'click', async () => {
          try {
            await moveBookmark(bookmark.id, cat.id);
            if (row) row.setAttribute('data-parent-id', cat.id);
            // 记录目标分类名，reload 后 main.ts 读取它自动跳转到对应分类筛选
            try {
              sessionStorage.setItem('markpage-pending-filter', `category:${cat.name}`);
            } catch { /* 忽略 */ }
            console.log(`[MarkPage] 已将 "${bookmark.title}" 移动到 "${cat.name}"`);
          } catch (error) {
            console.error('[MarkPage] 移动书签失败:', error);
          }
          removeMovePanel();
        });
        panel.appendChild(catBtn);

        // 递归渲染后代
        cat.children?.forEach((child) => renderCat(child, depth + 1));
      };

      categories.forEach((cat) => renderCat(cat, 0));
    }
  } catch (error) {
    console.error('[MarkPage] 获取分类失败:', error);
    panel.appendChild(h('div', {
      style: 'font-size:12px;color:var(--text-3);padding:8px',
    }, '加载分类失败'));
  }

  document.body.appendChild(panel);
}

/**
 * 移除移动面板
 */
function removeMovePanel(): void {
  const panel = document.querySelector('.ctx-move-panel');
  if (panel) panel.remove();
}

/**
 * 更新书签行上的标签 chip 显示
 *
 * 使用示例：
 *   const names = await resolveTagNames(await getBookmarkTagIds(bk.id));
 *   updateRowTagChips(row, names);
 *
 * @param row - 书签行元素
 * @param tagNames - 要展示的标签名数组
 */
function updateRowTagChips(row: HTMLElement, tagNames: string[]): void {
  const cell = row.querySelector('[data-role="tags"]') as HTMLElement | null;
  if (!cell) return;
  if (tagNames.length === 0) {
    cell.textContent = '';
    return;
  }
  cell.textContent = tagNames.map((n) => `#${n}`).join(' ');
}

/**
 * HTML 转义，避免分类名中的特殊字符破坏 innerHTML
 *
 * @param s - 原始字符串
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
