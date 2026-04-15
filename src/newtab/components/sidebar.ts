/**
 * 侧边栏组件
 *
 * 渲染左侧导航栏，包含：
 *   - 品牌 Logo + 名称
 *   - 导航项：全部书签、常用、最近添加
 *   - 分类列表（动态生成，显示计数）
 *   - 底部：整理书签（AI badge）、设置按钮
 *
 * 使用示例：
 *   import { renderSidebar } from './sidebar';
 *   const sidebar = renderSidebar(categories);
 *   document.getElementById('app')?.appendChild(sidebar);
 */

import { h, on } from '@/utils/dom';
import { t } from '@/utils/i18n';
import type { Category, Bookmark, TagDef } from '@/types';
import { getPinnedSites, getRecentBookmarks, getAllBookmarks, createFolder, removeFolder, updateBookmark } from '@/services/bookmarks';
import { getFrequentIds } from '@/services/storage';
import {
  getAllTagDefs, getTagUsageCount, ensureTag, setBookmarkTags,
} from '@/services/tags';
import { batchSuggestTags, cleanupTagSuggest } from '@/services/tag-ai';
import { renameTag, deleteTag, mergeTag, findTagIdByName } from '@/services/tags';
import { getSettings } from '@/services/storage';
import {
  iconGlobe, iconStar, iconClock, iconSettings, iconAI, iconSparkle
} from './icons';
import {
  getCategoryIcon, getCategoryIconKey, setCustomIcon,
  ICON_LIBRARY, ICON_META, POPULAR_ICONS, searchIcons, recommendIcons,
} from './category-icons';

/** 侧边栏导航切换回调 */
type NavCallback = (filter: string) => void;
/** 设置按钮回调 */
type SettingsCallback = () => void;
/** AI 整理按钮回调 */
type AICallback = () => void;

/**
 * 显示图标选择器浮层（Notion 风格命令面板）
 *
 * 功能：
 *   - 顶部搜索框（自动聚焦，中英文实时过滤）
 *   - AI 推荐区（基于分类名的智能匹配）
 *   - 热门区（高频图标）
 *   - 按语义分组的全部图标
 *   - 当前选中图标高亮
 *
 * @param anchor - 定位锚点元素（图标所在的 span）
 * @param categoryName - 分类名称
 * @param btn - 分类按钮（用于更新图标显示）
 */
function showIconPicker(anchor: HTMLElement, categoryName: string, btn: HTMLElement): void {
  // 先移除已存在的选择器
  document.querySelector('.icon-picker')?.remove();

  const currentKey = getCategoryIconKey(categoryName);
  const recommendations = recommendIcons(categoryName, 5);

  // 构建面板容器
  const picker = h('div', { class: 'icon-picker' });

  // 搜索框
  const searchWrap = h('div', { class: 'ip-search-wrap' });
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = t('sidebar_iconPickerSearchPlaceholder');
  searchInput.className = 'ip-search-input';
  searchWrap.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
  searchWrap.appendChild(searchInput);
  picker.appendChild(searchWrap);

  // 内容区
  const body = h('div', { class: 'ip-body' });
  picker.appendChild(body);

  /**
   * 创建一个图标单元格
   */
  function createCell(key: string): HTMLElement {
    const cell = h('button', {
      class: 'ip-cell' + (key === currentKey ? ' active' : ''),
      title: ICON_META.find(m => m.key === key)?.label || key,
      'data-key': key,
    });
    cell.innerHTML = ICON_LIBRARY[key](18);
    cell.addEventListener('click', () => {
      setCustomIcon(categoryName, key);
      const iconSpan = btn.querySelector('.sidebar-item-icon');
      if (iconSpan) iconSpan.innerHTML = getCategoryIcon(categoryName);
      picker.remove();
    });
    return cell;
  }

  /**
   * 创建一个区块（标题 + 网格）
   */
  function createSection(title: string, keys: string[]): HTMLElement {
    const section = h('div', { class: 'ip-section' });
    section.innerHTML = `<div class="ip-label">${title}</div>`;
    const grid = h('div', { class: 'ip-grid' });
    keys.forEach(key => grid.appendChild(createCell(key)));
    section.appendChild(grid);
    return section;
  }

  /**
   * 渲染默认视图（推荐 + 热门 + 分组）
   */
  function renderDefault() {
    body.innerHTML = '';
    // AI 推荐区
    body.appendChild(createSection(t('sidebar_iconPickerRecommended', [categoryName]), recommendations));

    // 热门区
    body.appendChild(createSection(t('sidebar_iconPickerPopular'), POPULAR_ICONS));

    // 按 group 分组
    const groups = new Map<string, string[]>();
    ICON_META.forEach(m => {
      if (!groups.has(m.group)) groups.set(m.group, []);
      groups.get(m.group)!.push(m.key);
    });
    groups.forEach((keys, groupName) => {
      body.appendChild(createSection(groupName, keys));
    });
  }

  /**
   * 渲染搜索结果视图
   */
  function renderSearchResults(query: string) {
    body.innerHTML = '';
    const results = searchIcons(query);
    if (results.length === 0) {
      body.innerHTML = `<div class="ip-empty">${t('sidebar_iconPickerNoResults')}</div>`;
      return;
    }
    body.appendChild(createSection(t('sidebar_iconPickerSearchResults', [String(results.length)]), results.map(r => r.key)));
  }

  // 搜索输入事件
  searchInput.addEventListener('input', () => {
    const v = searchInput.value.trim();
    if (v) renderSearchResults(v);
    else renderDefault();
  });

  // 回车选中第一个结果
  searchInput.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      picker.remove();
    } else if (e.key === 'Enter') {
      const firstCell = body.querySelector('.ip-cell') as HTMLElement;
      if (firstCell) firstCell.click();
    }
  });

  // 首次渲染
  renderDefault();

  // ---- 定位 ----
  document.body.appendChild(picker);

  // 先测量自身尺寸
  const pickerRect = picker.getBoundingClientRect();
  const anchorRect = anchor.getBoundingClientRect();

  // 默认在图标右侧
  let left = anchorRect.right + 8;
  let top = anchorRect.top - 4;

  // 右侧空间不够则翻转到左侧（弹到 sidebar 外）
  if (left + pickerRect.width > window.innerWidth - 16) {
    left = anchorRect.left - pickerRect.width - 8;
  }
  // 下方空间不够则上移
  if (top + pickerRect.height > window.innerHeight - 16) {
    top = Math.max(16, window.innerHeight - pickerRect.height - 16);
  }
  // 上方溢出防护
  if (top < 16) top = 16;

  picker.style.left = left + 'px';
  picker.style.top = top + 'px';

  // 聚焦搜索框
  searchInput.focus();

  // 点击外部关闭
  const closeOnOutside = (e: MouseEvent) => {
    if (!picker.contains(e.target as Node)) {
      picker.remove();
      document.removeEventListener('mousedown', closeOnOutside);
    }
  };
  setTimeout(() => document.addEventListener('mousedown', closeOnOutside), 0);
}

/**
 * 渲染侧边栏
 *
 * @param categories - 分类列表
 * @param totalCount - 书签总数
 * @param onNav - 导航切换回调
 * @param onSettings - 设置按钮回调
 * @param onAI - AI 整理按钮回调
 * @returns 侧边栏 DOM 元素
 *
 * 使用示例：
 *   const sidebar = renderSidebar(categories, 47, filter => console.log(filter));
 */
export function renderSidebar(
  categories: Category[],
  totalCount: number,
  onNav: NavCallback,
  onSettings: SettingsCallback,
  onAI: AICallback,
): HTMLElement {
  const sidebar = h('nav', { class: 'sidebar' });

  // 品牌区域
  const brand = h('div', { class: 'sidebar-logo' }, [
    h('div', { class: 'sidebar-logo-icon' }),
    h('span', { class: 'sidebar-logo-text' }, 'MarkPage'),
  ]);
  sidebar.appendChild(brand);

  // 导航项容器
  const navSection = h('div', { class: 'sidebar-categories' });

  // 主导航项（常用和最近添加使用占位数量，稍后异步更新）
  const navItems = [
    { label: t('sidebar_allBookmarks'), icon: iconGlobe(), count: totalCount, filter: 'all', countId: 'nav-count-all' },
    { label: t('sidebar_frequent'), icon: iconStar(), count: 0, filter: 'frequent', countId: 'nav-count-frequent' },
    { label: t('sidebar_recent'), icon: iconClock(), count: 0, filter: 'recent', countId: 'nav-count-recent' },
  ];

  navItems.forEach((item, idx) => {
    const btn = h('button', {
      class: `sidebar-item${idx === 0 ? ' active' : ''}`,
      'data-filter': item.filter,
    });
    btn.innerHTML = `
      <span class="sidebar-item-icon">${item.icon}</span>
      ${item.label}
      <span class="sidebar-item-count" id="${item.countId}">${item.count}</span>
    `;
    on(btn, 'click', () => {
      // 更新选中状态
      sidebar.querySelectorAll('.sidebar-item').forEach(el =>
        el.classList.remove('active')
      );
      btn.classList.add('active');
      onNav(item.filter);
    });
    navSection.appendChild(btn);
  });

  // 异步获取常用和最近添加的真实数量
  updateNavCounts();

  // 分类标签（右侧带"+"新增一级文件夹按钮）
  const label = h('div', {
    class: 'sidebar-section-label sidebar-section-label-with-action',
  });
  label.innerHTML = `
    <span>${t('sidebar_categoriesLabel')}</span>
    <button class="sidebar-section-add" title="${t('sidebar_addTopFolderTitle')}" aria-label="${t('sidebar_addTopFolderTitle')}">+</button>
  `;
  const addTopFolderBtn = label.querySelector('.sidebar-section-add') as HTMLElement;
  on(addTopFolderBtn, 'click', async (e: MouseEvent) => {
    e.stopPropagation();
    try {
      // 默认创建在书签栏（id='1'）下，占位名称 "新文件夹"
      const folder = await createFolder(t('sidebar_newFolderName'), '1');
      window.location.reload();
      void folder;
    } catch (error) {
      console.error('[MarkPage] 创建文件夹失败:', error);
      showInlineToast(t('sidebar_createFolderFailed', [(error as Error).message]));
    }
  });
  navSection.appendChild(label);

  // 分类列表（支持嵌套子分类）
  categories.forEach(cat => {
    renderCategoryTree(navSection, cat, 0, sidebar, onNav);
  });

  // —— 标签区块容器（异步填充） ——
  const tagsContainer = h('div', { class: 'sidebar-tags-container', 'data-tags-container': '1' });
  navSection.appendChild(tagsContainer);
  renderTagsSection(tagsContainer, sidebar, onNav);

  sidebar.appendChild(navSection);

  // 底部操作区域
  const footer = h('div', { class: 'sidebar-footer' });

  // 整理书签 —— ✨ 图标 + AI 徽章
  const aiBtn = h('button', { class: 'sidebar-ai-btn' });
  aiBtn.innerHTML = `
    <span style="width:14px;height:14px;display:flex;align-items:center">${ICON_LIBRARY.sparkles(14)}</span>
    ${t('sidebar_organizeBookmarks')}
    <span style="margin-left:auto;font-size:9px;font-weight:600;letter-spacing:0.04em;color:var(--text-4);border:1px solid var(--border);border-radius:3px;padding:0 4px;line-height:16px">AI</span>
  `;
  on(aiBtn, 'click', () => onAI());
  footer.appendChild(aiBtn);

  // 设置按钮
  const settingsBtn = h('button', { class: 'sidebar-ai-btn' });
  settingsBtn.innerHTML = `
    <span style="width:14px;height:14px;display:flex;align-items:center">${iconSettings(14)}</span>
    ${t('sidebar_settings')}
  `;
  on(settingsBtn, 'click', () => onSettings());
  footer.appendChild(settingsBtn);

  sidebar.appendChild(footer);

  return sidebar;
}

/**
 * 渲染侧边栏"标签"区块（异步填充）
 *
 * 结构：
 *   - 区块标题 "标签" + 右侧 "管理" 小链接
 *   - 标签项列表（按使用次数降序），点击 → onNav('tag:' + id)
 *   - 底部 "AI 补标全部" 按钮（仅当存在未打标书签 + AI 已配置时显示）
 *
 * 使用示例：
 *   renderTagsSection(container, sidebar, filter => filterBookmarkGroups(filter));
 *
 * @param container - 要渲染进去的容器元素
 * @param sidebar - 侧边栏根元素（用于 active 状态切换）
 * @param onNav - 导航回调
 */
async function renderTagsSection(
  container: HTMLElement,
  sidebar: HTMLElement,
  onNav: NavCallback,
): Promise<void> {
  try {
    container.innerHTML = '';

    // 区块标题
    const labelRow = h('div', { class: 'sidebar-section-label' }, t('sidebar_tagsLabel'));
    container.appendChild(labelRow);

    // 加载标签定义 + 使用计数 + 设置
    const [defs, counts, settings, allBookmarks] = await Promise.all([
      getAllTagDefs(),
      getTagUsageCount(),
      getSettings(),
      getAllBookmarks().catch(() => [] as Bookmark[]),
    ]);

    const aiConfigured = !!(settings.ai?.apiKey && settings.ai?.model);
    const untagged = allBookmarks.filter(
      (bk) => !bk.tags || bk.tags.length === 0,
    );

    // 空状态：仍要给出 AI 补标入口，让新用户能一键启动
    if (defs.length === 0) {
      const empty = h('div', {
        style: 'padding:8px 12px;font-size:12px;color:var(--text-4);line-height:1.5',
      }, t('sidebar_tagsEmpty'));
      container.appendChild(empty);

      // 仅当存在未打标书签时显示 AI 补标按钮
      if (untagged.length > 0) {
        container.appendChild(
          buildAIBatchButton(container, sidebar, onNav, untagged, defs.map((d) => d.name), aiConfigured),
        );
      }
      return;
    }

    // 按使用次数降序排
    const sorted = [...defs].sort(
      (a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0),
    );

    /** 默认显示的高频标签数量阈值 */
    const VISIBLE_LIMIT = 5;
    const topTags = sorted.slice(0, VISIBLE_LIMIT);
    const restTags = sorted.slice(VISIBLE_LIMIT);

    /**
     * 构建单个标签按钮
     */
    const buildTagItem = (def: TagDef): HTMLElement => {
      const count = counts[def.id] ?? 0;
      const btn = h('button', {
        class: 'sidebar-item sidebar-tag-item',
        'data-filter': `tag:${def.id}`,
        'data-tag-id': def.id,
      });
      btn.innerHTML = `
        <span class="sidebar-item-icon" style="color:var(--text-4);font-size:14px;font-weight:600;line-height:1">#</span>
        <span class="sidebar-tag-name" title="${t('sidebar_tagRenameHint')}">${escapeHtml(def.name)}</span>
        <span class="sidebar-item-count sidebar-tag-count">${count}</span>
        <span class="sidebar-tag-delete" title="${t('sidebar_tagDeleteTitle')}" aria-label="${t('sidebar_tagDeleteTitle')}">×</span>
      `;

      const nameEl = btn.querySelector('.sidebar-tag-name') as HTMLElement;
      const delEl = btn.querySelector('.sidebar-tag-delete') as HTMLElement;

      // 单击行：筛选
      on(btn, 'click', () => {
        // 正在编辑时不触发筛选
        if (nameEl.isContentEditable) return;
        sidebar.querySelectorAll('.sidebar-item').forEach((el) =>
          el.classList.remove('active'),
        );
        btn.classList.add('active');
        onNav(`tag:${def.id}`);
      });

      // 双击文字：进入重命名模式
      on(nameEl, 'dblclick', (e: MouseEvent) => {
        e.stopPropagation();
        startInlineRename(nameEl, def, () => {
          renderTagsSection(container, sidebar, onNav);
        });
      });

      // 点击 × 删除
      on(delEl, 'click', async (e: MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm(t('sidebar_tagConfirmDelete', [def.name]))) return;
        try {
          await deleteTag(def.id);
          renderTagsSection(container, sidebar, onNav);
          const { refreshAllRowTags } = await import('./bookmark-list');
          await refreshAllRowTags();
        } catch (error) {
          console.error('[MarkPage] 删除标签失败:', error);
          showInlineToast(t('sidebar_deleteFailed'));
        }
      });

      // 右键：依然提供菜单
      on(btn, 'contextmenu', (e: MouseEvent) => {
        e.preventDefault();
        showTagContextMenu(e.clientX, e.clientY, def, () => {
          renderTagsSection(container, sidebar, onNav);
        });
      });
      return btn;
    };

    topTags.forEach((def) => container.appendChild(buildTagItem(def)));

    // 折叠区：剩余标签 + 展开/收起按钮
    if (restTags.length > 0) {
      const restWrap = h('div', {
        class: 'sidebar-tag-rest',
        style: 'display:none',
      });
      restTags.forEach((def) => restWrap.appendChild(buildTagItem(def)));
      container.appendChild(restWrap);

      const toggleBtn = h('button', {
        class: 'sidebar-item',
        style: 'color:var(--text-3);font-size:11px',
      });
      const updateLabel = (expanded: boolean) => {
        toggleBtn.innerHTML = expanded
          ? `<span class="sidebar-item-icon" style="color:var(--text-4)">▾</span>${t('sidebar_collapse')}`
          : `<span class="sidebar-item-icon" style="color:var(--text-4)">▸</span>${t('sidebar_expandAll', [String(restTags.length)])}`;
      };
      updateLabel(false);
      on(toggleBtn, 'click', () => {
        const expanded = restWrap.style.display !== 'none';
        restWrap.style.display = expanded ? 'none' : 'block';
        updateLabel(!expanded);
      });
      container.appendChild(toggleBtn);
    }

    // "AI 补标全部"按钮（仅当存在未打标书签时显示）
    if (untagged.length > 0) {
      container.appendChild(
        buildAIBatchButton(container, sidebar, onNav, untagged, defs.map((d) => d.name), aiConfigured),
      );
    }

    // "AI 整理标签"按钮（标签数 ≥ 5 时才显示）
    if (defs.length >= 5) {
      container.appendChild(
        buildAICleanupButton(container, sidebar, onNav, defs, counts),
      );
    }
  } catch (error) {
    console.error('[MarkPage] 渲染标签区块失败:', error);
  }
}

/**
 * 构建 "AI 补标全部" 按钮
 *
 * 点击后批量调用 AI 推荐标签，结果通过 ensureTag + setBookmarkTags 持久化。
 *
 * @param container - 标签区块容器（完成后重新渲染）
 * @param sidebar - 侧边栏根（用于再次渲染）
 * @param onNav - 导航回调（完成后跳到 'all' 触发列表重渲染）
 * @param untagged - 未打标书签
 * @param existingTagNames - 已有标签名（提示 AI 优先复用）
 * @returns 按钮元素
 */
function buildAIBatchButton(
  container: HTMLElement,
  sidebar: HTMLElement,
  onNav: NavCallback,
  untagged: Bookmark[],
  existingTagNames: string[],
  aiConfigured = true,
): HTMLElement {
  const btn = h('button', {
    class: 'sidebar-ai-btn',
    style: 'margin-top:4px',
  });
  const total = untagged.length;
  btn.innerHTML = `
    <span style="width:14px;height:14px;display:flex;align-items:center">${iconSparkle(14)}</span>
    ${t('sidebar_aiTagAll', [String(total)])}
  `;
  on(btn, 'click', async () => {
    console.log('[MarkPage] AI 补标按钮点击，未打标书签数:', untagged.length);
    // 实时读取设置：避免侧边栏渲染后用户才去配置 AI 时的闭包过期
    const latest = await getSettings();
    if (!latest.ai?.apiKey || !latest.ai?.model) {
      showInlineToast(t('sidebar_configureAIFirst'));
      return;
    }
    if ((btn as HTMLButtonElement).disabled) {
      console.log('[MarkPage] 按钮已禁用，跳过');
      return;
    }
    (btn as HTMLButtonElement).disabled = true;

    try {
      const settings = await getSettings();
      if (!settings.ai?.apiKey) {
        showInlineToast(t('sidebar_configureAIFirst'));
        (btn as HTMLButtonElement).disabled = false;
        return;
      }
      if (untagged.length === 0) {
        showInlineToast(t('sidebar_noUntaggedBookmarks'));
        (btn as HTMLButtonElement).disabled = false;
        return;
      }

      const results = await batchSuggestTags(
        untagged,
        existingTagNames,
        settings.ai,
        (done, total2) => {
          btn.innerHTML = `
            <span style="width:14px;height:14px;display:flex;align-items:center">${iconSparkle(14)}</span>
            ${t('sidebar_aiTaggingProgress', [String(done), String(total2)])}
          `;
        },
      );

      // 持久化结果：把每条推荐的标签名转成 ID 并写入
      let writtenCount = 0;
      let emptyCount = 0;
      for (const [bkId, tagNames] of results.entries()) {
        console.log('[MarkPage] AI 补标结果:', bkId, tagNames);
        if (!tagNames.length) {
          emptyCount++;
          continue;
        }
        try {
          const tagIds: string[] = [];
          for (const name of tagNames) {
            const id = await ensureTag(name);
            tagIds.push(id);
          }
          await setBookmarkTags(bkId, tagIds);
          writtenCount++;
        } catch (err) {
          console.error('[MarkPage] 写入书签标签失败:', bkId, err);
        }
      }

      // 刷新侧边栏标签区 + 同步更新列表所有行的 chip
      await renderTagsSection(container, sidebar, onNav);
      const { refreshAllRowTags } = await import('./bookmark-list');
      await refreshAllRowTags();

      // 结果反馈
      if (writtenCount > 0) {
        showInlineToast(
          emptyCount > 0
            ? t('sidebar_aiTagResultPartial', [String(writtenCount), String(emptyCount)])
            : t('sidebar_aiTagResult', [String(writtenCount)])
        );
      } else {
        showInlineToast(t('sidebar_aiTagNoSuggestions'));
      }
    } catch (error) {
      console.error('[MarkPage] AI 批量补标失败:', error);
      showInlineToast(t('sidebar_aiTagFailed', [(error as Error).message]));
      (btn as HTMLButtonElement).disabled = false;
    }
  });
  return btn;
}

/**
 * 构建 "AI 整理标签" 按钮
 *
 * 点击后调用 AI 分析标签列表，给出合并/删除建议，
 * 弹窗让用户确认后执行
 *
 * @param container - 标签区块容器（完成后重新渲染）
 * @param sidebar - 侧边栏根
 * @param onNav - 导航回调
 * @param defs - 现有标签定义
 * @param counts - 标签使用次数映射
 */
function buildAICleanupButton(
  container: HTMLElement,
  sidebar: HTMLElement,
  onNav: NavCallback,
  defs: TagDef[],
  counts: Record<string, number>,
): HTMLElement {
  const btn = h('button', {
    class: 'sidebar-ai-btn',
    style: 'margin-top:2px',
  });
  btn.innerHTML = `
    <span style="width:14px;height:14px;display:flex;align-items:center">${ICON_LIBRARY.sparkles(14)}</span>
    ${t('sidebar_organizeTags')}
    <span style="margin-left:auto;font-size:9px;font-weight:600;letter-spacing:0.04em;color:var(--text-4);border:1px solid var(--border);border-radius:3px;padding:0 4px;line-height:16px">AI</span>
  `;
  on(btn, 'click', async () => {
    if ((btn as HTMLButtonElement).disabled) return;
    (btn as HTMLButtonElement).disabled = true;

    try {
      const settings = await getSettings();
      if (!settings.ai?.apiKey) {
        showInlineToast(t('sidebar_configureAIFirst'));
        (btn as HTMLButtonElement).disabled = false;
        return;
      }

      btn.innerHTML = `
        <span style="width:14px;height:14px;display:flex;align-items:center">${ICON_LIBRARY.sparkles(14)}</span>
        ${t('sidebar_aiAnalyzing')}
      `;

      const tagList = defs.map((d) => ({ name: d.name, count: counts[d.id] ?? 0 }));
      const suggestion = await cleanupTagSuggest(tagList, settings.ai);

      // 即使首次为空，也打开弹窗让用户输入方向后重新分析
      const confirmed = await showCleanupDialog(
        suggestion,
        async (userDirection) => cleanupTagSuggest(tagList, settings.ai, userDirection),
      );
      if (!confirmed) {
        (btn as HTMLButtonElement).disabled = false;
        await renderTagsSection(container, sidebar, onNav);
        return;
      }

      // 执行合并（target 不存在时自动创建，支持把零散标签归入新大类）
      for (const group of confirmed.merges) {
        const targetId = await ensureTag(group.target);
        for (const srcName of group.sources) {
          const srcId = await findTagIdByName(srcName);
          if (srcId && srcId !== targetId) {
            try {
              await mergeTag(srcId, targetId);
            } catch (error) {
              console.error('[MarkPage] 合并标签失败:', srcName, '→', group.target, error);
            }
          }
        }
      }

      // 执行删除
      for (const item of confirmed.deletes) {
        const id = await findTagIdByName(item.name);
        if (id) {
          try {
            await deleteTag(id);
          } catch (error) {
            console.error('[MarkPage] 删除标签失败:', item.name, error);
          }
        }
      }

      // 刷新 UI
      await renderTagsSection(container, sidebar, onNav);
      const { refreshAllRowTags } = await import('./bookmark-list');
      await refreshAllRowTags();
      showInlineToast(t('sidebar_tagsOrganized'));
    } catch (error) {
      console.error('[MarkPage] AI 整理标签失败:', error);
      showInlineToast(t('sidebar_organizeFailed', [(error as Error).message]));
      (btn as HTMLButtonElement).disabled = false;
    }
  });
  return btn;
}

/**
 * 弹窗让用户确认整理建议，并提供"重新分析（带方向）"入口
 *
 * 用户可在顶部输入想调整的方向（如"保留 CSS 不要删"、"再激进一些"），
 * 点击"重新分析"后会把方向注入 prompt 重新调用 AI，并原地替换建议列表。
 *
 * @param initialSuggestion - 首次 AI 给出的建议
 * @param reAnalyze - 传入用户方向后重新分析的回调，返回新建议
 * @returns 用户确认的建议（勾选过滤后）；取消返回 null
 */
function showCleanupDialog(
  initialSuggestion: import('@/services/tag-ai').TagCleanupSuggestion,
  reAnalyze: (userDirection: string) => Promise<import('@/services/tag-ai').TagCleanupSuggestion>,
): Promise<import('@/services/tag-ai').TagCleanupSuggestion | null> {
  return new Promise((resolve) => {
    const overlay = h('div', {
      style: 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:5000;display:flex;align-items:center;justify-content:center;font-family:var(--font)',
    });

    const modal = h('div', {
      style: 'width:520px;max-height:85vh;display:flex;flex-direction:column;background:var(--bg-1);border:1px solid var(--border);border-radius:10px;box-shadow:0 20px 60px rgba(0,0,0,0.4);overflow:hidden',
    });

    const header = h('div', {
      style: 'padding:14px 18px;border-bottom:1px solid var(--border);font-size:13px;font-weight:600;color:var(--text-1)',
    }, t('sidebar_cleanupDialogTitle'));
    modal.appendChild(header);

    // 方向输入区（顶部）
    const directionWrap = h('div', {
      style: 'padding:12px 18px;border-bottom:1px solid var(--border);background:var(--bg-2)',
    });
    directionWrap.innerHTML = `
      <div style="font-size:11px;color:var(--text-3);margin-bottom:6px">${t('sidebar_cleanupDirectionHint')}</div>
      <div style="display:flex;gap:6px">
        <input type="text" class="cleanup-direction" placeholder="${t('sidebar_cleanupDirectionPlaceholder')}"
          style="flex:1;min-width:0;padding:6px 10px;font-family:var(--font);font-size:12px;color:var(--text-1);background:var(--bg-1);border:1px solid var(--border);border-radius:5px;outline:none" />
        <button class="cleanup-retry" style="padding:6px 12px;font-family:var(--font);font-size:12px;background:var(--bg-3);color:var(--text-1);border:1px solid var(--border);border-radius:5px;cursor:pointer;white-space:nowrap">${t('sidebar_cleanupReanalyze')}</button>
      </div>
    `;
    modal.appendChild(directionWrap);
    const directionInput = directionWrap.querySelector('.cleanup-direction') as HTMLInputElement;
    const retryBtn = directionWrap.querySelector('.cleanup-retry') as HTMLButtonElement;

    // 建议列表区（会被重新分析时替换内容）
    const body = h('div', {
      style: 'flex:1;overflow-y:auto;padding:12px 18px',
    });
    modal.appendChild(body);

    const footer = h('div', {
      style: 'padding:12px 18px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px',
    });
    const cancelBtn = h('button', {
      style: 'padding:6px 14px;font-family:var(--font);font-size:12px;background:var(--bg-3);color:var(--text-1);border:none;border-radius:5px;cursor:pointer',
    }, t('common_cancel'));
    const okBtn = h('button', {
      style: 'padding:6px 14px;font-family:var(--font);font-size:12px;background:var(--accent);color:white;border:none;border-radius:5px;cursor:pointer',
    }, t('sidebar_cleanupExecute'));
    footer.appendChild(cancelBtn);
    footer.appendChild(okBtn);
    modal.appendChild(footer);

    /** 当前展示的 suggestion 和勾选状态 */
    let currentSuggestion = initialSuggestion;
    let mergeChecked = new Map<number, boolean>();
    let deleteChecked = new Map<number, boolean>();

    /**
     * 渲染建议列表到 body 中
     */
    const renderBody = (suggestion: import('@/services/tag-ai').TagCleanupSuggestion): void => {
      body.innerHTML = '';
      mergeChecked = new Map();
      deleteChecked = new Map();

      if (suggestion.merges.length === 0 && suggestion.deletes.length === 0) {
        body.appendChild(h('div', {
          style: 'padding:24px;text-align:center;color:var(--text-3);font-size:12px',
        }, t('sidebar_cleanupNoSuggestions')));
        okBtn.style.opacity = '0.5';
        (okBtn as HTMLButtonElement).disabled = true;
        return;
      }
      okBtn.style.opacity = '1';
      (okBtn as HTMLButtonElement).disabled = false;

      if (suggestion.merges.length > 0) {
        const sec = h('div', { style: 'margin-bottom:14px' });
        sec.appendChild(h('div', {
          style: 'font-size:11px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px',
        }, t('sidebar_cleanupMergeSection', [String(suggestion.merges.length)])));
        suggestion.merges.forEach((g, i) => {
          mergeChecked.set(i, true);
          const row = h('label', {
            style: 'display:flex;align-items:flex-start;gap:8px;padding:8px;border-radius:6px;cursor:pointer;font-size:12px;color:var(--text-1);line-height:1.5',
          });
          row.innerHTML = `
            <input type="checkbox" checked style="margin-top:2px" />
            <div style="flex:1;min-width:0">
              <div><span style="color:var(--text-3)">${escapeHtml(g.sources.join('、'))}</span> → <strong>${escapeHtml(g.target)}</strong></div>
              ${g.reason ? `<div style="color:var(--text-4);font-size:11px;margin-top:2px">${escapeHtml(g.reason)}</div>` : ''}
            </div>
          `;
          const checkbox = row.querySelector('input') as HTMLInputElement;
          checkbox.addEventListener('change', () => mergeChecked.set(i, checkbox.checked));
          sec.appendChild(row);
        });
        body.appendChild(sec);
      }

      if (suggestion.deletes.length > 0) {
        const sec = h('div');
        sec.appendChild(h('div', {
          style: 'font-size:11px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px',
        }, t('sidebar_cleanupDeleteSection', [String(suggestion.deletes.length)])));
        suggestion.deletes.forEach((d, i) => {
          deleteChecked.set(i, true);
          const row = h('label', {
            style: 'display:flex;align-items:flex-start;gap:8px;padding:8px;border-radius:6px;cursor:pointer;font-size:12px;color:var(--text-1);line-height:1.5',
          });
          row.innerHTML = `
            <input type="checkbox" checked style="margin-top:2px" />
            <div style="flex:1;min-width:0">
              <div><strong>${escapeHtml(d.name)}</strong></div>
              ${d.reason ? `<div style="color:var(--text-4);font-size:11px;margin-top:2px">${escapeHtml(d.reason)}</div>` : ''}
            </div>
          `;
          const checkbox = row.querySelector('input') as HTMLInputElement;
          checkbox.addEventListener('change', () => deleteChecked.set(i, checkbox.checked));
          sec.appendChild(row);
        });
        body.appendChild(sec);
      }
    };

    renderBody(currentSuggestion);

    // "重新分析"点击
    const doRetry = async (): Promise<void> => {
      const dir = directionInput.value.trim();
      retryBtn.disabled = true;
      retryBtn.textContent = t('sidebar_cleanupAnalyzing');
      body.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-3);font-size:12px">${dir ? t('sidebar_cleanupReanalyzingWithDirection') : t('sidebar_cleanupReanalyzing')}</div>`;
      try {
        const next = await reAnalyze(dir);
        currentSuggestion = next;
        renderBody(currentSuggestion);
      } catch (error) {
        console.error('[MarkPage] 重新分析失败:', error);
        body.innerHTML = `<div style="padding:24px;text-align:center;color:var(--red);font-size:12px">${t('sidebar_cleanupReanalyzeFailed', [escapeHtml((error as Error).message)])}</div>`;
      } finally {
        retryBtn.disabled = false;
        retryBtn.textContent = t('sidebar_cleanupReanalyze');
      }
    };

    on(retryBtn, 'click', doRetry);
    directionInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        doRetry();
      }
    });

    on(cancelBtn, 'click', () => {
      overlay.remove();
      resolve(null);
    });
    on(okBtn, 'click', () => {
      overlay.remove();
      resolve({
        merges: currentSuggestion.merges.filter((_, i) => mergeChecked.get(i)),
        deletes: currentSuggestion.deletes.filter((_, i) => deleteChecked.get(i)),
      });
    });

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  });
}

/**
 * 显示标签右键菜单（重命名 / 删除）
 *
 * @param x - 鼠标横坐标
 * @param y - 鼠标纵坐标
 * @param def - 目标标签
 * @param onChange - 操作完成回调（用于刷新列表）
 */
function showTagContextMenu(
  x: number,
  y: number,
  def: TagDef,
  onChange: () => void,
): void {
  document.querySelector('.tag-ctx-menu')?.remove();

  const menu = h('div', {
    class: 'tag-ctx-menu',
    style: `position:fixed;top:${y}px;left:${x}px;min-width:140px;background:var(--bg-1);border:1px solid var(--border);border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,0.2);padding:4px;z-index:2000;font-family:var(--font)`,
  });

  const mkItem = (label: string, danger: boolean, handler: () => void): HTMLElement => {
    const btn = h('button', {
      style: `display:block;width:100%;padding:6px 10px;font-size:12px;text-align:left;background:none;border:none;border-radius:4px;cursor:pointer;color:${danger ? 'var(--red)' : 'var(--text-1)'};transition:background var(--fast)`,
    }, label);
    on(btn, 'mouseenter', () => { btn.style.background = 'var(--bg-hover)'; });
    on(btn, 'mouseleave', () => { btn.style.background = ''; });
    on(btn, 'click', () => {
      menu.remove();
      handler();
    });
    return btn;
  };

  menu.appendChild(mkItem(t('sidebar_rename'), false, async () => {
    const name = window.prompt(t('sidebar_newTagName'), def.name);
    if (!name || name.trim() === '' || name.trim() === def.name) return;
    try {
      await renameTag(def.id, name.trim());
      onChange();
      const { refreshAllRowTags } = await import('./bookmark-list');
      await refreshAllRowTags();
    } catch (error) {
      console.error('[MarkPage] 重命名标签失败:', error);
      showInlineToast(t('sidebar_renameFailed'));
    }
  }));

  menu.appendChild(mkItem(t('common_delete'), true, async () => {
    if (!window.confirm(t('sidebar_tagConfirmDelete', [def.name]))) return;
    try {
      await deleteTag(def.id);
      onChange();
      const { refreshAllRowTags } = await import('./bookmark-list');
      await refreshAllRowTags();
    } catch (error) {
      console.error('[MarkPage] 删除标签失败:', error);
      showInlineToast(t('sidebar_deleteFailed'));
    }
  }));

  document.body.appendChild(menu);

  // 点外部关闭
  const close = (e: MouseEvent) => {
    if (!menu.contains(e.target as Node)) {
      menu.remove();
      document.removeEventListener('mousedown', close);
    }
  };
  setTimeout(() => document.addEventListener('mousedown', close), 0);
}

/**
 * 启用标签名称的行内重命名
 *
 * @param nameEl - 标签名 span 元素
 * @param def - 目标标签
 * @param onDone - 重命名成功后回调（刷新列表）
 *
 * 使用示例：
 *   startInlineRename(nameSpan, tagDef, () => reRender());
 */
function startInlineRename(
  nameEl: HTMLElement,
  def: TagDef,
  onDone: () => void,
): void {
  const original = def.name;
  nameEl.contentEditable = 'true';
  nameEl.spellcheck = false;
  nameEl.style.outline = '1px solid var(--accent)';
  nameEl.style.borderRadius = '3px';
  nameEl.style.padding = '0 2px';
  nameEl.focus();

  // 选中全部内容
  const range = document.createRange();
  range.selectNodeContents(nameEl);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);

  let finished = false;
  const finish = async (commit: boolean) => {
    if (finished) return;
    finished = true;
    nameEl.contentEditable = 'false';
    nameEl.style.outline = '';
    nameEl.style.padding = '';
    const next = (nameEl.textContent ?? '').trim();
    if (!commit || !next || next === original) {
      nameEl.textContent = original;
      return;
    }
    try {
      await renameTag(def.id, next);
      onDone();
      // 同步刷新书签列表中所有行的标签 chip
      const { refreshAllRowTags } = await import('./bookmark-list');
      await refreshAllRowTags();
    } catch (error) {
      console.error('[MarkPage] 重命名标签失败:', error);
      showInlineToast(t('sidebar_renameFailed'));
      nameEl.textContent = original;
    }
  };

  nameEl.addEventListener('blur', () => finish(true), { once: true });
  nameEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      nameEl.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      finish(false);
      nameEl.blur();
    }
  });
  // 防止在编辑状态下冒泡触发按钮 click
  nameEl.addEventListener('click', (e) => e.stopPropagation());
}

/**
 * 轻量 inline toast（避免引入额外组件）
 *
 * @param msg - 提示文本
 */
function showInlineToast(msg: string): void {
  const toast = h('div', {
    style: 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:8px 14px;background:var(--bg-1);border:1px solid var(--border-strong);border-radius:6px;color:var(--text-1);font-family:var(--font);font-size:12px;box-shadow:0 4px 16px rgba(0,0,0,0.2);z-index:3000',
  }, msg);
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

/**
 * HTML 转义，避免标签名中的特殊字符破坏 innerHTML
 *
 * @param s - 原始字符串
 * @returns 转义后字符串
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 收集一个分类节点及其所有子孙分类的名称（用于"点父级时包含子级"的筛选）
 *
 * @param cat - 分类节点
 * @returns 名称数组（去重）
 */
function collectCategoryNames(cat: Category): string[] {
  const set = new Set<string>();
  const walk = (c: Category): void => {
    set.add(c.name);
    c.children?.forEach(walk);
  };
  walk(cat);
  return Array.from(set);
}

/**
 * 递归渲染分类树（支持多级嵌套）
 *
 * 有子分类的节点前面显示一个可折叠的 ▸ chevron；子项按层级缩进。
 *
 * @param container - 要追加到的父容器
 * @param cat - 当前分类节点
 * @param depth - 缩进层级（0 = 顶层）
 * @param sidebar - 侧边栏根
 * @param onNav - 导航回调
 */
function renderCategoryTree(
  container: HTMLElement,
  cat: Category,
  depth: number,
  sidebar: HTMLElement,
  onNav: NavCallback,
): void {
  const hasChildren = !!cat.children && cat.children.length > 0;
  const item = buildCategoryItem(cat, sidebar, onNav, depth, hasChildren);
  container.appendChild(item);

  if (hasChildren) {
    const childrenWrap = h('div', {
      class: 'sidebar-cat-children',
      'data-parent-id': cat.id,
    });
    cat.children!.forEach((child) => {
      renderCategoryTree(childrenWrap, child, depth + 1, sidebar, onNav);
    });
    container.appendChild(childrenWrap);

    // 单击分类项自身即可切换展开/折叠（不影响筛选：同时筛选 + 展开）
    on(item, 'click', (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // 点击图标 / 操作按钮 / 标签编辑区时不切换
      if (
        target.closest('.sidebar-item-icon') ||
        target.closest('.sidebar-item-act') ||
        target.classList.contains('editing')
      ) return;
      const collapsed = item.classList.toggle('collapsed');
      childrenWrap.style.display = collapsed ? 'none' : '';
    });
  }
}

/**
 * 构建分类项按钮（支持 hover 显示 + / × 操作）
 *
 * 默认右侧显示书签数；鼠标悬浮时数字隐藏，显示
 *   + 创建子文件夹
 *   × 删除该文件夹（含子项）
 *
 * @param cat - 分类数据
 * @param sidebar - 侧边栏根（用于 active 状态管理）
 * @param onNav - 导航回调
 * @returns 分类按钮元素
 */
function buildCategoryItem(
  cat: Category,
  sidebar: HTMLElement,
  onNav: NavCallback,
  depth: number = 0,
  hasChildren: boolean = false,
): HTMLElement {
  const iconHtml = getCategoryIcon(cat.name);

  const btn = h('button', {
    class: 'sidebar-item sidebar-item-cat',
    'data-filter': `category:${cat.name}`,
    'data-category-name': cat.name,
    'data-category-id': cat.id,
    'data-depth': String(depth),
    style: depth > 0 ? `padding-left: ${12 + depth * 14}px` : '',
  });
  // 有子项时给按钮打标记；不再渲染独立的折叠箭头
  if (hasChildren) btn.classList.add('has-children');
  btn.innerHTML = `
    <span class="sidebar-item-icon">${iconHtml}</span>
    <span class="sidebar-item-label">${escapeHtml(cat.name)}</span>
    <span class="sidebar-item-count sidebar-item-count-hidable">${cat.count}</span>
    <span class="sidebar-item-actions">
      <button class="sidebar-item-act" data-act="add" title="${t('sidebar_addSubFolderTitle')}" aria-label="${t('sidebar_addSubFolderTitle')}">+</button>
      <button class="sidebar-item-act sidebar-item-act-danger" data-act="del" title="${t('sidebar_deleteFolderTitle')}" aria-label="${t('sidebar_deleteFolderTitle')}">×</button>
    </span>
  `;

  on(btn, 'click', async (e: MouseEvent) => {
    const target = e.target as HTMLElement;

    // 点击操作按钮：新增子 / 删除
    const actBtn = target.closest('.sidebar-item-act') as HTMLElement | null;
    if (actBtn) {
      e.stopPropagation();
      const act = actBtn.getAttribute('data-act');
      if (act === 'add') {
        try {
          await createFolder(t('sidebar_newFolderName'), cat.id);
          window.location.reload();
        } catch (error) {
          console.error('[MarkPage] 创建子文件夹失败:', error);
          showInlineToast(t('sidebar_createFolderFailed', [(error as Error).message]));
        }
      } else if (act === 'del') {
        const confirmMsg = cat.count > 0
          ? t('sidebar_confirmDeleteFolderWithItems', [cat.name, String(cat.count)])
          : t('sidebar_confirmDeleteFolder', [cat.name]);
        if (!window.confirm(confirmMsg)) return;
        try {
          await removeFolder(cat.id);
          window.location.reload();
        } catch (error) {
          console.error('[MarkPage] 删除文件夹失败:', error);
          showInlineToast(t('sidebar_deleteFolderFailed', [(error as Error).message]));
        }
      }
      return;
    }

    // 点击图标：打开图标选择器
    const iconSpan = target.closest('.sidebar-item-icon') as HTMLElement | null;
    if (iconSpan && btn.contains(iconSpan)) {
      e.stopPropagation();
      showIconPicker(iconSpan, cat.name, btn);
      return;
    }

    // 点击其余区域：筛选到该分类（含所有子孙分类）
    sidebar.querySelectorAll('.sidebar-item').forEach(el =>
      el.classList.remove('active'),
    );
    btn.classList.add('active');
    const names = collectCategoryNames(cat);
    onNav(`category:${names.join('|')}`);
  });

  // 双击标题 → 内联重命名
  const labelEl = btn.querySelector('.sidebar-item-label') as HTMLElement;
  on(labelEl, 'dblclick', (e: MouseEvent) => {
    e.stopPropagation();
    startCategoryInlineRename(labelEl, cat);
  });

  return btn;
}

/**
 * 在分类项标题位置启用内联编辑
 *
 * 以 contenteditable 方式就地改名，Enter 保存，Esc 取消
 *
 * @param labelEl - 标题文字元素
 * @param cat - 分类数据（携带真实 folder id）
 */
function startCategoryInlineRename(labelEl: HTMLElement, cat: Category): void {
  const original = cat.name;
  labelEl.contentEditable = 'plaintext-only';
  labelEl.spellcheck = false;
  labelEl.classList.add('editing');
  labelEl.focus();

  // 选中全部文本
  const range = document.createRange();
  range.selectNodeContents(labelEl);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);

  let finished = false;
  const finish = async (commit: boolean): Promise<void> => {
    if (finished) return;
    finished = true;
    labelEl.contentEditable = 'false';
    labelEl.classList.remove('editing');
    labelEl.removeEventListener('keydown', keyHandler);
    labelEl.removeEventListener('blur', blurHandler);

    const next = labelEl.textContent?.trim() || '';
    if (!commit || !next || next === original) {
      labelEl.textContent = original;
      return;
    }
    try {
      await updateBookmark(cat.id, { title: next });
      window.location.reload();
    } catch (error) {
      console.error('[MarkPage] 重命名文件夹失败:', error);
      labelEl.textContent = original;
      showInlineToast(t('sidebar_renameFolderFailed', [(error as Error).message]));
    }
  };

  const keyHandler = (e: KeyboardEvent): void => {
    if (e.key === 'Enter') {
      e.preventDefault();
      finish(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      finish(false);
    }
  };
  const blurHandler = (): void => {
    void finish(true);
  };
  labelEl.addEventListener('keydown', keyHandler);
  labelEl.addEventListener('blur', blurHandler);
}

/**
 * 异步更新导航项中常用和最近添加的数量
 *
 * 从 Chrome 书签 API 获取真实数据，更新侧边栏中的计数显示
 */
export async function updateNavCounts(): Promise<void> {
  try {
    // 常用 = 用户手动标记的书签数；最近 = 最近添加的书签数
    const [frequentIds, recent] = await Promise.all([
      getFrequentIds(),
      getRecentBookmarks(100),
    ]);

    const frequentCountEl = document.getElementById('nav-count-frequent');
    const recentCountEl = document.getElementById('nav-count-recent');

    if (frequentCountEl) frequentCountEl.textContent = String(frequentIds.length);
    if (recentCountEl) recentCountEl.textContent = String(recent.length);
  } catch (error) {
    console.error('[MarkPage] 更新导航计数失败:', error);
  }
}
