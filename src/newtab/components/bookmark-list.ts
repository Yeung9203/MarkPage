/**
 * 书签列表组件
 *
 * 按分类分组展示书签，每组有 sticky header 和折叠功能。
 * 每行显示 favicon + 标题 + URL + 标签 + 操作按钮。
 *
 * 使用示例：
 *   import { renderBookmarkList } from './bookmark-list';
 *   const list = renderBookmarkList(bookmarks, categories);
 *   document.querySelector('.main-content')?.appendChild(list);
 */

import { h, on, openLink } from '@/utils/dom';
import type { Bookmark, Category, TagDef } from '@/types';
import { iconChevron, iconMore } from './icons';
import { showContextMenu } from './context-menu';
import { getAllTagDefs } from '@/services/tags';
import { getFrequentIds } from '@/services/storage';
import { getCategoryIcon } from './category-icons';
import { showTagPopover } from './tag-popover';

/** 分类名到图标样式的映射 */
const categoryStyleMap: Record<string, { cssClass: string; letter: string; inlineStyle?: string }> = {
  '开发工具': { cssClass: 'gi-dev', letter: 'D' },
  '技术文档': { cssClass: 'gi-doc', letter: 'D' },
  '设计': { cssClass: 'gi-design', letter: 'D' },
  'AI 工具': { cssClass: 'gi-ai', letter: 'A' },
  '社交媒体': { cssClass: 'gi-social', letter: 'S' },
  '影音娱乐': { cssClass: '', letter: 'M', inlineStyle: 'background:#ec489920;color:#ec4899' },
  '未分类': { cssClass: 'gi-uncategorized', letter: '?' },
};

/**
 * 额外颜色的内联样式（CSS 文件中未定义的颜色）
 *
 * f-teal 和 f-pink 在设计稿中使用，但未包含在 bookmarks.css 中
 */
const EXTRA_COLOR_STYLES: Record<string, string> = {
  'f-teal': 'background:#14b8a618;color:#14b8a6',
  'f-pink': 'background:#ec489918;color:#ec4899',
};

/** 书签标题到颜色 class 的映射 */
const bookmarkColorMap: Record<string, { color: string; letter: string }> = {
  'GitHub': { color: 'f-gray', letter: 'G' },
  'Vercel': { color: 'f-teal', letter: 'V' },
  'Linear': { color: 'f-purple', letter: 'L' },
  'Netlify': { color: 'f-blue', letter: 'N' },
  'CodePen': { color: 'f-amber', letter: 'C' },
  'StackOverflow': { color: 'f-blue', letter: 'S' },
  'MDN Web Docs': { color: 'f-blue', letter: 'M' },
  'React Documentation': { color: 'f-blue', letter: 'R' },
  'Next.js Docs': { color: 'f-green', letter: 'N' },
  'Tailwind CSS': { color: 'f-teal', letter: 'T' },
  'TypeScript Handbook': { color: 'f-amber', letter: 'T' },
  'Figma': { color: 'f-red', letter: 'F' },
  'Dribbble': { color: 'f-pink', letter: 'D' },
  'Awwwards': { color: 'f-amber', letter: 'A' },
  'Claude': { color: 'f-amber', letter: 'C' },
  'ChatGPT': { color: 'f-green', letter: 'C' },
  'Midjourney': { color: 'f-gray', letter: 'M' },
  'Twitter / X': { color: 'f-blue', letter: 'T' },
  '知乎': { color: 'f-green', letter: 'Z' },
  '微博': { color: 'f-red', letter: 'W' },
  'V2EX': { color: 'f-blue', letter: 'V' },
  'YouTube': { color: 'f-red', letter: 'Y' },
  'Bilibili': { color: 'f-blue', letter: 'B' },
  'Spotify': { color: 'f-green', letter: 'S' },
  'Notion': { color: 'f-blue', letter: 'N' },
  'Slack': { color: 'f-green', letter: 'S' },
  'Gmail': { color: 'f-amber', letter: 'G' },
};

/**
 * 获取书签的颜色和字母
 *
 * @param title - 书签标题
 * @returns 颜色 class 和首字母
 */
function getBookmarkStyle(title: string): { color: string; letter: string } {
  if (bookmarkColorMap[title]) return bookmarkColorMap[title];
  const colors = ['f-gray', 'f-blue', 'f-green', 'f-amber', 'f-red', 'f-purple', 'f-teal', 'f-pink'];
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = ((hash << 5) - hash) + title.charCodeAt(i);
    hash |= 0;
  }
  return {
    color: colors[Math.abs(hash) % colors.length],
    letter: title.charAt(0).toUpperCase(),
  };
}

/**
 * 提取书签 URL 的简短域名
 *
 * @param url - 完整 URL
 * @returns 简短域名
 *
 * 使用示例：
 *   shortenUrl('https://github.com/user/repo') // 'github.com'
 */
function shortenUrl(url: string): string {
  try {
    const u = new URL(url.startsWith('http') ? url : 'https://' + url);
    return u.hostname.replace(/^www\./, '') + (u.pathname !== '/' ? u.pathname : '');
  } catch {
    return url;
  }
}

/**
 * 渲染书签列表
 *
 * @param bookmarks - 书签数据列表
 * @param categories - 分类列表
 * @returns 书签列表 DOM 元素
 */
export async function renderBookmarkList(
  bookmarks: Bookmark[],
  categories: Category[],
): Promise<HTMLElement> {
  // 读取常用标记集合（用户手动标记的书签 ID）
  const frequentIds = new Set<string>(await getFrequentIds());

  const content = h('div', {
    class: 'content',
    style: 'flex:1;overflow-y:auto;padding:0',
  });

  // 预先加载一次标签定义，构建 id → name 映射
  let tagDefs: TagDef[] = [];
  try {
    tagDefs = await getAllTagDefs();
  } catch (error) {
    console.error('[MarkPage] 加载标签定义失败:', error);
  }
  const tagNameMap = new Map<string, string>(tagDefs.map((d) => [d.id, d.name]));

  // 按分类分组（递归初始化所有层级的分类，保证子文件夹也出现）
  const groups = new Map<string, Bookmark[]>();
  const initCategoryGroups = (cats: Category[]): void => {
    cats.forEach((c) => {
      groups.set(c.name, []);
      if (c.children?.length) initCategoryGroups(c.children);
    });
  };
  initCategoryGroups(categories);

  bookmarks.forEach(bk => {
    const catName = bk.category || '未分类';
    if (!groups.has(catName)) groups.set(catName, []);
    groups.get(catName)!.push(bk);
  });

  // 渲染每个分组
  groups.forEach((groupBookmarks, categoryName) => {
    if (groupBookmarks.length === 0) return;

    const group = h('div', {
      class: 'group',
      'data-category': categoryName,
      draggable: 'true',
    });

    // 分组头（图标与侧边栏分类保持一致：优先使用用户自定义 icon）
    const iconHtml = getCategoryIcon(categoryName);
    const groupHeader = h('div', {
      class: 'group-header',
      'data-cat': categoryName,
    });

    groupHeader.innerHTML = `
      <span class="group-chevron">${iconChevron()}</span>
      <span class="group-icon">${iconHtml}</span>
      <span class="group-name">${categoryName}</span>
      <span class="group-count">${groupBookmarks.length}</span>
    `;

    // 折叠/展开
    const groupItems = h('div', { class: 'group-items' });

    on(groupHeader, 'click', () => {
      const isCollapsed = groupHeader.classList.toggle('collapsed');
      groupItems.style.display = isCollapsed ? 'none' : 'block';
      // 旋转箭头
      const chevron = groupHeader.querySelector('.group-chevron') as HTMLElement;
      if (chevron) {
        chevron.style.transform = isCollapsed ? 'rotate(-90deg)' : '';
      }
    });

    group.appendChild(groupHeader);

    // 渲染书签行
    groupBookmarks.forEach(bk => {
      const style = getBookmarkStyle(bk.title);
      const shortUrl = shortenUrl(bk.url);
      const extraStyle = EXTRA_COLOR_STYLES[style.color] || '';

      const row = h('div', {
        class: 'bk-row',
        'data-bookmark-id': bk.id,
        'data-title': bk.title,
        'data-parent-id': bk.parentId || '',
        'data-date-added': String(bk.dateAdded || 0),
        'data-url': bk.url,
        'data-frequent': frequentIds.has(bk.id) ? 'true' : 'false',
        tabindex: '0',
      });
      // 写入当前标签 ID 列表（供筛选使用）
      row.setAttribute('data-tag-ids', (bk.tags ?? []).join(','));

      row.innerHTML = `
        <span class="bk-fav ${style.color}"${extraStyle ? ' style="'+extraStyle+'"' : ''}>${style.letter}</span>
        <span class="bk-title">${bk.title}</span>
        <span class="bk-url">${shortUrl}</span>
        <span class="bk-tag" data-role="tags"></span>
        <span class="bk-actions">
          <button class="bk-act">${iconMore()}</button>
        </span>
      `;

      // 渲染标签 chips
      const tagCell = row.querySelector('[data-role="tags"]') as HTMLElement;
      renderTagChips(tagCell, bk, tagNameMap);

      // hover 时显示操作按钮
      on(row, 'mouseenter', () => {
        const actions = row.querySelector('.bk-actions') as HTMLElement;
        if (actions) actions.style.opacity = '1';
      });
      on(row, 'mouseleave', () => {
        const actions = row.querySelector('.bk-actions') as HTMLElement;
        if (actions) actions.style.opacity = '0';
      });

      // hover 时显示背景
      on(row, 'mouseenter', () => {
        row.style.background = 'var(--bg-hover)';
      });
      on(row, 'mouseleave', () => {
        row.style.background = '';
      });

      // 点击行打开链接：默认在当前标签页，按住 Cmd/Ctrl/中键则新开
      on(row, 'click', (e) => {
        if ((e.target as HTMLElement).closest('.bk-act')) return;
        openLink(bk.url, e as MouseEvent);
      });
      on(row, 'auxclick', (e) => {
        if ((e as MouseEvent).button !== 1) return;
        if ((e.target as HTMLElement).closest('.bk-act')) return;
        e.preventDefault();
        window.open(bk.url, '_blank');
      });

      // 三点菜单按钮
      const actBtn = row.querySelector('.bk-act');
      if (actBtn) {
        on(actBtn as HTMLElement, 'click', (e) => {
          e.stopPropagation();
          const rect = (actBtn as HTMLElement).getBoundingClientRect();
          showContextMenu(rect.bottom + 4, Math.min(rect.left, window.innerWidth - 180), bk);
        });
      }

      // 按 t 快速打开标签面板（行 focus 或 hover 态时）
      let rowHovered = false;
      on(row, 'mouseenter', () => { rowHovered = true; });
      on(row, 'mouseleave', () => { rowHovered = false; });
      on(row, 'keydown', (e: KeyboardEvent) => {
        if (e.key === 't' || e.key === 'T') {
          // 若焦点在输入框则忽略
          const active = document.activeElement;
          const tag = active?.tagName;
          if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
          e.preventDefault();
          e.stopPropagation();
          showTagPopover(tagCell, bk, () => {
            refreshRowTags(row, bk, tagNameMap);
          });
        }
      });
      // 全局 t 键：当鼠标悬停在行上时触发
      on(document, 'keydown', (e: KeyboardEvent) => {
        if (!rowHovered) return;
        if (e.key !== 't' && e.key !== 'T') return;
        const active = document.activeElement;
        const tagName = active?.tagName;
        if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return;
        // 已有其它 popover 则不重复打开
        if (document.querySelector('.tag-popover')) return;
        e.preventDefault();
        showTagPopover(tagCell, bk, () => {
          refreshRowTags(row, bk, tagNameMap);
        });
      });

      groupItems.appendChild(row);
    });

    group.appendChild(groupItems);
    content.appendChild(group);
  });

  // ---- 分组拖拽排序 ----
  initGroupDragSort(content);

  return content;
}

/**
 * 按分类筛选书签组的可见性
 *
 * @param filter - 筛选条件
 *   - 'all': 显示所有书签
 *   - 'frequent': 只显示书签栏中的书签（parentId === '1'）
 *   - 'recent': 只显示最近 30 天添加的书签，按 dateAdded 倒序
 *   - 'category:xxx': 只显示指定分类
 */
export function filterBookmarkGroups(filter: string): void {
  const groups = document.querySelectorAll('.group');
  const headerCount = document.getElementById('headerCount');

  // 切换筛选时清除可能残留的顶部筛选 bar
  document.getElementById('tagFilterBar')?.remove();

  if (filter === 'all') {
    // 显示所有分组和所有书签行
    groups.forEach(g => {
      (g as HTMLElement).style.display = '';
      g.querySelectorAll('.bk-row').forEach(row => {
        (row as HTMLElement).style.display = '';
      });
    });
    if (headerCount) headerCount.textContent = `${countAllBookmarks()} 个书签`;

  } else if (filter === 'frequent') {
    // 只显示用户手动标记为常用的书签（data-frequent="true"）
    let visibleCount = 0;
    groups.forEach(g => {
      const rows = g.querySelectorAll('.bk-row');
      let groupHasVisible = false;
      rows.forEach(row => {
        const marked = row.getAttribute('data-frequent') === 'true';
        if (marked) {
          (row as HTMLElement).style.display = '';
          groupHasVisible = true;
          visibleCount++;
        } else {
          (row as HTMLElement).style.display = 'none';
        }
      });
      (g as HTMLElement).style.display = groupHasVisible ? '' : 'none';
    });
    if (headerCount) headerCount.textContent = `${visibleCount} 个常用`;

  } else if (filter === 'recent') {
    // 只显示最近 30 天添加的书签，按 dateAdded 倒序
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    let visibleCount = 0;

    // 收集所有行及其 dateAdded，用于排序
    const allRows: { row: HTMLElement; dateAdded: number }[] = [];
    groups.forEach(g => {
      g.querySelectorAll('.bk-row').forEach(row => {
        const dateAdded = parseInt(row.getAttribute('data-date-added') || '0', 10);
        allRows.push({ row: row as HTMLElement, dateAdded });
      });
    });

    // 按时间倒序排列
    allRows.sort((a, b) => b.dateAdded - a.dateAdded);

    // 隐藏/显示行
    groups.forEach(g => {
      const rows = g.querySelectorAll('.bk-row');
      let groupHasVisible = false;
      rows.forEach(row => {
        const dateAdded = parseInt(row.getAttribute('data-date-added') || '0', 10);
        if (dateAdded > thirtyDaysAgo) {
          (row as HTMLElement).style.display = '';
          groupHasVisible = true;
          visibleCount++;
        } else {
          (row as HTMLElement).style.display = 'none';
        }
      });
      (g as HTMLElement).style.display = groupHasVisible ? '' : 'none';
    });
    if (headerCount) headerCount.textContent = `${visibleCount} 个最近添加`;

  } else if (filter.startsWith('tag:')) {
    // 按标签 ID 筛选
    const tagId = filter.replace('tag:', '');
    let visibleCount = 0;
    groups.forEach(g => {
      const rows = g.querySelectorAll('.bk-row');
      let groupHasVisible = false;
      rows.forEach(row => {
        const ids = (row.getAttribute('data-tag-ids') || '').split(',').filter(Boolean);
        if (ids.includes(tagId)) {
          (row as HTMLElement).style.display = '';
          groupHasVisible = true;
          visibleCount++;
        } else {
          (row as HTMLElement).style.display = 'none';
        }
      });
      (g as HTMLElement).style.display = groupHasVisible ? '' : 'none';
    });
    if (headerCount) headerCount.textContent = `${visibleCount} 个书签`;

  } else if (filter.startsWith('category:')) {
    // 支持多分类（含子孙）匹配，名称用 | 分隔
    const raw = filter.replace('category:', '');
    const nameSet = new Set(raw.split('|').filter(Boolean));
    let visibleCount = 0;
    groups.forEach(g => {
      const name = g.getAttribute('data-category') || '';
      if (nameSet.has(name)) {
        (g as HTMLElement).style.display = '';
        g.querySelectorAll('.bk-row').forEach(row => {
          (row as HTMLElement).style.display = '';
        });
        visibleCount += g.querySelectorAll('.bk-row').length;
      } else {
        (g as HTMLElement).style.display = 'none';
      }
    });
    if (headerCount) headerCount.textContent = `${visibleCount} 个书签`;
  }
}

/**
 * 统计所有可见书签行数
 *
 * @returns 总书签数
 */
function countAllBookmarks(): number {
  return document.querySelectorAll('.bk-row').length;
}

/**
 * 初始化分组拖拽排序
 *
 * 使用原生 HTML5 Drag & Drop API，仅在分组头（group-header）上触发拖拽，
 * 整个分组（含内部书签）作为一个整体移动。
 *
 * @param container - 书签列表容器
 */
function initGroupDragSort(container: HTMLElement): void {
  let draggedGroup: HTMLElement | null = null;

  container.addEventListener('dragstart', (e: DragEvent) => {
    // 只允许从分组头开始拖拽
    const target = e.target as HTMLElement;
    const group = target.closest('.group') as HTMLElement;
    if (!group) return;

    draggedGroup = group;
    group.classList.add('group-dragging');

    // 设置拖拽数据和效果
    e.dataTransfer!.effectAllowed = 'move';
    e.dataTransfer!.setData('text/plain', group.getAttribute('data-category') || '');

    // 延迟添加透明度，避免拖拽镜像也变透明
    requestAnimationFrame(() => {
      if (draggedGroup) draggedGroup.style.opacity = '0.4';
    });
  });

  container.addEventListener('dragend', () => {
    if (draggedGroup) {
      draggedGroup.style.opacity = '';
      draggedGroup.classList.remove('group-dragging');
      draggedGroup = null;
    }
    // 清除所有放置指示器
    container.querySelectorAll('.group').forEach(g => {
      (g as HTMLElement).classList.remove('group-drag-over-top', 'group-drag-over-bottom');
    });
  });

  container.addEventListener('dragover', (e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'move';

    if (!draggedGroup) return;

    const target = (e.target as HTMLElement).closest('.group') as HTMLElement;
    if (!target || target === draggedGroup) return;

    // 清除所有指示器
    container.querySelectorAll('.group').forEach(g => {
      (g as HTMLElement).classList.remove('group-drag-over-top', 'group-drag-over-bottom');
    });

    // 判断鼠标在目标组的上半部还是下半部
    const rect = target.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    if (e.clientY < midY) {
      target.classList.add('group-drag-over-top');
    } else {
      target.classList.add('group-drag-over-bottom');
    }
  });

  container.addEventListener('dragleave', (e: DragEvent) => {
    const target = (e.target as HTMLElement).closest('.group') as HTMLElement;
    if (target) {
      target.classList.remove('group-drag-over-top', 'group-drag-over-bottom');
    }
  });

  container.addEventListener('drop', (e: DragEvent) => {
    e.preventDefault();
    if (!draggedGroup) return;

    const target = (e.target as HTMLElement).closest('.group') as HTMLElement;
    if (!target || target === draggedGroup) return;

    // 判断插入位置
    const rect = target.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;

    if (e.clientY < midY) {
      // 插入到目标前面
      container.insertBefore(draggedGroup, target);
    } else {
      // 插入到目标后面
      container.insertBefore(draggedGroup, target.nextSibling);
    }

    // 清除指示器
    container.querySelectorAll('.group').forEach(g => {
      (g as HTMLElement).classList.remove('group-drag-over-top', 'group-drag-over-bottom');
    });
  });
}

// ============================================================
// 标签 Chip 渲染与筛选条
// ============================================================

/**
 * 渲染某行的标签 chips
 *
 * 规则：
 *   - 0 个：显示占位 `+`（点击唤起 Popover）
 *   - 1 个 / 2 个：逐个 chip
 *   - ≥3 个：前 2 个 + "+N"（title 显示全部）
 *
 * @param cell - 标签单元格 span
 * @param bk - 书签
 * @param tagNameMap - tagId → name 映射
 *
 * 使用示例：
 *   renderTagChips(cell, bookmark, map);
 */
function renderTagChips(
  cell: HTMLElement,
  bk: Bookmark,
  tagNameMap: Map<string, string>,
): void {
  cell.innerHTML = '';
  Object.assign(cell.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    overflow: 'hidden',
  } as CSSStyleDeclaration);

  const ids = bk.tags ?? [];
  const names = ids.map((id) => tagNameMap.get(id)).filter((n): n is string => !!n);

  // 空态：占位按钮
  if (names.length === 0) {
    const placeholder = document.createElement('button');
    placeholder.type = 'button';
    placeholder.textContent = '＋';
    placeholder.title = '添加标签';
    Object.assign(placeholder.style, {
      height: '18px',
      padding: '0 6px',
      borderRadius: '4px',
      background: 'transparent',
      border: '1px dashed var(--border)',
      color: 'var(--text-4)',
      fontSize: '10px',
      fontWeight: '500',
      cursor: 'pointer',
      lineHeight: '1',
      transition: 'all var(--fast)',
    } as CSSStyleDeclaration);
    placeholder.addEventListener('mouseenter', () => {
      placeholder.style.color = 'var(--text-2)';
      placeholder.style.borderColor = 'var(--border-strong)';
    });
    placeholder.addEventListener('mouseleave', () => {
      placeholder.style.color = 'var(--text-4)';
      placeholder.style.borderColor = 'var(--border)';
    });
    placeholder.addEventListener('click', (e) => {
      e.stopPropagation();
      showTagPopover(placeholder, bk, () => {
        refreshRowTags(cell.closest('.bk-row') as HTMLElement, bk, tagNameMap);
      });
    });
    cell.appendChild(placeholder);
    return;
  }

  const visible = names.slice(0, 2);
  visible.forEach((name, idx) => {
    const chip = makeChip(name, ids[idx]);
    cell.appendChild(chip);
  });

  if (names.length > 2) {
    const overflow = document.createElement('span');
    const restCount = names.length - 2;
    overflow.textContent = `+${restCount}`;
    overflow.title = names.join(', ');
    Object.assign(overflow.style, {
      height: '18px',
      padding: '0 6px',
      borderRadius: '4px',
      background: 'var(--bg-3)',
      color: 'var(--text-2)',
      fontSize: '10px',
      fontWeight: '500',
      display: 'inline-flex',
      alignItems: 'center',
      lineHeight: '1',
      cursor: 'pointer',
    } as CSSStyleDeclaration);
    overflow.addEventListener('click', (e) => {
      e.stopPropagation();
      showTagPopover(overflow, bk, () => {
        refreshRowTags(cell.closest('.bk-row') as HTMLElement, bk, tagNameMap);
      });
    });
    cell.appendChild(overflow);
  }
}

/**
 * 生成单个标签 chip 元素
 *
 * @param name - 标签名
 * @param tagId - 标签 ID（点击筛选用）
 * @returns chip 元素
 */
function makeChip(name: string, tagId: string): HTMLElement {
  const chip = document.createElement('span');
  chip.textContent = name;
  chip.title = `筛选 #${name}`;
  chip.setAttribute('data-tag-id', tagId);
  Object.assign(chip.style, {
    height: '18px',
    padding: '0 6px',
    borderRadius: '4px',
    background: 'var(--bg-3)',
    color: 'var(--text-2)',
    fontSize: '10px',
    fontWeight: '500',
    display: 'inline-flex',
    alignItems: 'center',
    lineHeight: '1',
    cursor: 'pointer',
    maxWidth: '80px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    transition: 'background var(--fast)',
  } as CSSStyleDeclaration);
  chip.addEventListener('mouseenter', () => {
    chip.style.background = 'var(--bg-hover)';
  });
  chip.addEventListener('mouseleave', () => {
    chip.style.background = 'var(--bg-3)';
  });
  chip.addEventListener('click', (e) => {
    e.stopPropagation();
    enterTagFilter(tagId, name);
  });
  return chip;
}

/**
 * 刷新某一行的标签 chips（tag popover 变动后回调）
 *
 * 会读取最新的 tag map 与 defs，并更新 data-tag-ids + chips。
 *
 * @param row - 书签行元素
 * @param bk - 书签数据（原地更新 bk.tags）
 * @param tagNameMap - 当前 name map（会按需刷新）
 */
/**
 * 刷新当前列表中所有行的标签 chip
 *
 * 批量操作（如 AI 补标全部）结束后调用，让 UI 与 storage 同步
 */
export async function refreshAllRowTags(): Promise<void> {
  try {
    const { getAllBookmarkTagMap, getAllTagDefs } = await import('@/services/tags');
    const [tagMap, defs] = await Promise.all([getAllBookmarkTagMap(), getAllTagDefs()]);
    const nameMap = new Map<string, string>(defs.map((d) => [d.id, d.name]));

    document.querySelectorAll('.bk-row').forEach((el) => {
      const row = el as HTMLElement;
      const bkId = row.getAttribute('data-bookmark-id') || '';
      const ids = tagMap[bkId] ?? [];
      row.setAttribute('data-tag-ids', ids.join(','));
      const cell = row.querySelector('[data-role="tags"]') as HTMLElement;
      if (cell) {
        const fakeBk = { id: bkId, tags: ids } as Bookmark;
        renderTagChips(cell, fakeBk, nameMap);
      }
    });
  } catch (error) {
    console.error('[MarkPage] 批量刷新标签 chip 失败:', error);
  }
}

async function refreshRowTags(
  row: HTMLElement,
  bk: Bookmark,
  tagNameMap: Map<string, string>,
): Promise<void> {
  if (!row) return;
  try {
    const { getBookmarkTagIds, getAllTagDefs } = await import('@/services/tags');
    const ids = await getBookmarkTagIds(bk.id);
    bk.tags = ids;
    row.setAttribute('data-tag-ids', ids.join(','));

    // 刷新 name map（可能创建了新标签）
    const defs = await getAllTagDefs();
    tagNameMap.clear();
    defs.forEach((d) => tagNameMap.set(d.id, d.name));

    const cell = row.querySelector('[data-role="tags"]') as HTMLElement;
    if (cell) renderTagChips(cell, bk, tagNameMap);
  } catch (error) {
    console.error('[MarkPage] 刷新行标签失败:', error);
  }
}

/**
 * 进入标签筛选模式
 *
 * 在列表顶部插入固定 bar，并调用 filterBookmarkGroups('tag:xxx')。
 *
 * @param tagId - 标签 ID
 * @param tagName - 标签名（展示用）
 *
 * 使用示例：
 *   enterTagFilter('tag_abc', '待读');
 */
export function enterTagFilter(tagId: string, _tagName: string): void {
  // 优先模拟侧边栏对应标签项的点击，保证 active 状态统一
  const sidebarBtn = document.querySelector(
    `.sidebar-item[data-filter="tag:${tagId}"]`,
  ) as HTMLElement | null;

  if (sidebarBtn) {
    // 若该项在折叠区，先展开让用户看见高亮
    const restWrap = sidebarBtn.closest('.sidebar-tag-rest') as HTMLElement | null;
    if (restWrap && restWrap.style.display === 'none') {
      restWrap.style.display = 'block';
    }
    sidebarBtn.click();
    return;
  }

  // 兜底：侧边栏未渲染时直接筛选
  filterBookmarkGroups(`tag:${tagId}`);
}

/**
 * 退出标签筛选
 *
 * 使用示例：
 *   exitTagFilter();
 */
export function exitTagFilter(): void {
  document.getElementById('tagFilterBar')?.remove();
  filterBookmarkGroups('all');
}
