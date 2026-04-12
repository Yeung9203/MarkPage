/**
 * 标签弹出面板（Tag Popover）
 *
 * 单例浮层，用于给单个书签打标。提供：
 *   - 搜索 / 过滤现有标签（按 name + aliases 模糊匹配）
 *   - 即时勾选 / 取消（自动持久化）
 *   - AI 建议区（已配置 AI 时异步加载）
 *   - 输入未匹配时支持快速创建
 *   - 键盘：↑↓ 移动、Enter 切换或创建、Esc 关闭
 *
 * 使用示例：
 *   import { showTagPopover } from './tag-popover';
 *   showTagPopover(anchorEl, bookmark, () => refreshRow());
 */

import { h, on } from '@/utils/dom';
import type { Bookmark, TagDef } from '@/types';
import {
  getAllTagDefs,
  getBookmarkTagIds,
  addBookmarkTag,
  removeBookmarkTag,
  ensureTag,
  findTagIdByName,
} from '@/services/tags';
import { suggestTagsForBookmark } from '@/services/tag-ai';
import { getSettings } from '@/services/storage';
import { iconSparkle } from './icons';

/** 当前显示的单例实例 */
let currentPopover: HTMLElement | null = null;
/** 外部点击关闭监听器（便于清理） */
let outsideClickHandler: ((e: MouseEvent) => void) | null = null;
/** 键盘事件监听器（便于清理） */
let keydownHandler: ((e: KeyboardEvent) => void) | null = null;

/**
 * 关闭并清理 Popover
 *
 * 使用示例：
 *   hideTagPopover();
 */
export function hideTagPopover(): void {
  if (currentPopover) {
    currentPopover.remove();
    currentPopover = null;
  }
  if (outsideClickHandler) {
    document.removeEventListener('mousedown', outsideClickHandler, true);
    outsideClickHandler = null;
  }
  if (keydownHandler) {
    document.removeEventListener('keydown', keydownHandler, true);
    keydownHandler = null;
  }
}

/**
 * 显示标签弹出面板
 *
 * @param anchor - 锚点元素，面板贴近其右下角
 * @param bookmark - 当前要打标的书签
 * @param onChange - 每次标签变化回调（用于刷新行 chip）
 *
 * 使用示例：
 *   showTagPopover(chipEl, bookmark, () => rerender());
 */
export function showTagPopover(
  anchor: HTMLElement,
  bookmark: Bookmark,
  onChange?: () => void,
): void {
  // 单例：先关闭已有的
  hideTagPopover();

  // ---- 状态 ----
  /** 所有标签定义 */
  let allDefs: TagDef[] = [];
  /** 当前书签已打的标签 ID 集合 */
  const selected = new Set<string>();
  /** 当前搜索输入 */
  let query = '';
  /** AI 建议名数组（已过滤掉已有项） */
  let aiSuggestions: string[] = [];
  /** AI 加载状态 */
  let aiLoading = false;
  /** AI 是否启用 */
  let aiEnabled = false;
  /** 当前键盘高亮索引（对应 flat 渲染列表） */
  let activeIndex = 0;

  // ---- 面板构建 ----
  const popover = h('div', { class: 'tag-popover' });
  popover.setAttribute('role', 'dialog');
  // 面板主样式
  Object.assign(popover.style, {
    position: 'fixed',
    width: '280px',
    maxHeight: '360px',
    background: 'var(--bg-1)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
    zIndex: '9999',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    fontSize: '12px',
    color: 'var(--text-1)',
    transition: 'opacity var(--fast)',
  } as CSSStyleDeclaration);

  // 阻止面板内 mousedown 冒泡到外部关闭
  on(popover, 'mousedown', (e) => {
    e.stopPropagation();
  });

  // ---- 搜索输入框 ----
  const searchWrap = h('div');
  Object.assign(searchWrap.style, {
    padding: '8px 10px',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexShrink: '0',
  } as CSSStyleDeclaration);
  searchWrap.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--text-3);flex-shrink:0"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = '输入或新建标签…';
  Object.assign(input.style, {
    flex: '1',
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: 'var(--text-1)',
    fontSize: '12px',
    minWidth: '0',
  } as CSSStyleDeclaration);
  searchWrap.appendChild(input);
  popover.appendChild(searchWrap);

  // ---- 列表容器 ----
  const body = h('div');
  Object.assign(body.style, {
    flex: '1',
    overflowY: 'auto',
    padding: '4px 0',
  } as CSSStyleDeclaration);
  popover.appendChild(body);

  // ---- 定位：贴近 anchor 右下角，右溢出则翻转到左 ----
  document.body.appendChild(popover);
  currentPopover = popover;
  positionPopover(popover, anchor);

  // ---- 初始化数据 ----
  void (async () => {
    try {
      allDefs = await getAllTagDefs();
      const tagIds = await getBookmarkTagIds(bookmark.id);
      tagIds.forEach((id) => selected.add(id));

      const settings = await getSettings();
      aiEnabled = !!(settings.ai?.enabled && settings.ai?.apiKey);

      render();
      input.focus();

      // 异步加载 AI 建议
      if (aiEnabled) {
        aiLoading = true;
        render();
        try {
          const existingNames = allDefs.map((d) => d.name);
          const suggestions = await suggestTagsForBookmark(
            bookmark,
            existingNames,
            settings.ai,
          );
          // 保留全部 AI 建议（无论是否已存在于用户标签库），
          // 已有标签用于置顶并展示 AI 标识，新名称用于底部"创建"入口
          aiSuggestions = suggestions.map((s) => s.trim()).filter(Boolean);
        } catch (error) {
          console.error('[MarkPage] AI 标签建议加载失败:', error);
          aiSuggestions = [];
        } finally {
          aiLoading = false;
          render();
        }
      }
    } catch (error) {
      console.error('[MarkPage] 标签面板初始化失败:', error);
    }
  })();

  // ---- 渲染逻辑 ----

  /** flat 列表项类型：用于键盘导航 */
  type ListItem =
    | { kind: 'tag'; def: TagDef }
    | { kind: 'ai'; name: string }
    | { kind: 'create'; name: string };

  /**
   * 过滤现有标签（按 name + aliases 模糊匹配）
   */
  function filterDefs(): TagDef[] {
    const q = query.trim().toLowerCase();
    if (!q) return allDefs;
    return allDefs.filter((d) => {
      if (d.name.toLowerCase().includes(q)) return true;
      if (d.aliases?.some((a) => a.toLowerCase().includes(q))) return true;
      return false;
    });
  }

  /**
   * 计算 AI 推荐名称集合（小写，用于匹配）
   */
  function aiNameSet(): Set<string> {
    return new Set(aiSuggestions.map((n) => n.toLowerCase()));
  }

  /**
   * 判断标签是否被 AI 推荐（按 name / aliases 任一匹配）
   */
  function isAiTag(def: TagDef, ai: Set<string>): boolean {
    if (ai.has(def.name.toLowerCase())) return true;
    return !!def.aliases?.some((a) => ai.has(a.toLowerCase()));
  }

  /** 组装 flat items 用于键盘 */
  function buildItems(): ListItem[] {
    const items: ListItem[] = [];
    const ai = aiNameSet();
    const defs = filterDefs();
    const q = query.trim();

    // 1) 已存在的标签 → AI 推荐置顶
    const aiTags = defs.filter((d) => isAiTag(d, ai));
    const otherTags = defs.filter((d) => !isAiTag(d, ai));
    aiTags.forEach((def) => items.push({ kind: 'tag', def }));

    // 2) AI 推荐的"新名称"（未存在于用户标签库）—— 以 create 形式快速采纳
    if (aiEnabled && !aiLoading) {
      const existingKeys = new Set(
        allDefs.flatMap((d) => [
          d.name.toLowerCase(),
          ...(d.aliases ?? []).map((a) => a.toLowerCase()),
        ]),
      );
      aiSuggestions
        .filter((n) => !existingKeys.has(n.toLowerCase()))
        .filter((n) => !q || n.toLowerCase().includes(q.toLowerCase()))
        .forEach((name) => items.push({ kind: 'ai', name }));
    }

    // 3) 其他现有标签
    otherTags.forEach((def) => items.push({ kind: 'tag', def }));

    // 4) 当前输入的新建项
    if (q) {
      const key = q.toLowerCase();
      const dup = allDefs.some(
        (d) =>
          d.name.toLowerCase() === key ||
          d.aliases?.some((a) => a.toLowerCase() === key),
      );
      const alreadyInAI = ai.has(key);
      if (!dup && !alreadyInAI) items.push({ kind: 'create', name: q });
    }
    return items;
  }

  /** 渲染整个 body：统一列表（AI 推荐置顶并带闪光标识） */
  function render(): void {
    body.innerHTML = '';
    const items = buildItems();

    // 夹紧 activeIndex
    if (items.length === 0) {
      activeIndex = 0;
    } else {
      if (activeIndex < 0) activeIndex = 0;
      if (activeIndex >= items.length) activeIndex = items.length - 1;
    }

    // 加载中的轻量提示（不再作为独立区块，仅顶部细条）
    if (aiEnabled && aiLoading) {
      const loading = h('div');
      Object.assign(loading.style, {
        padding: '6px 12px',
        fontSize: '11px',
        color: 'var(--text-3)',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
      } as CSSStyleDeclaration);
      loading.innerHTML = `<span style="opacity:0.7">AI 分析中…</span>`;
      body.appendChild(loading);
    }

    // 空列表占位
    if (items.length === 0 && !aiLoading) {
      const empty = h('div');
      Object.assign(empty.style, {
        padding: '12px',
        color: 'var(--text-3)',
        fontSize: '11px',
        textAlign: 'center',
      } as CSSStyleDeclaration);
      empty.textContent = query.trim()
        ? '无匹配项，按 Enter 创建'
        : '还没有标签，输入名称创建第一个';
      body.appendChild(empty);
    }

    const aiSet = aiNameSet();
    items.forEach((item, idx) => {
      const isActive = idx === activeIndex;
      if (item.kind === 'tag') {
        const checked = selected.has(item.def.id);
        const row = makeRow({
          text: item.def.name,
          prefix: checked ? '✓' : '',
          active: isActive,
          selected: checked,
          ai: isAiTag(item.def, aiSet),
          onClick: () => toggleTag(item.def.id),
        });
        body.appendChild(row);
      } else if (item.kind === 'ai') {
        const row = makeRow({
          text: item.name,
          prefix: '+',
          active: isActive,
          selected: false,
          ai: true,
          onClick: () => adoptName(item.name),
        });
        body.appendChild(row);
      } else {
        const row = makeRow({
          text: `创建 "${item.name}"`,
          prefix: '+',
          active: isActive,
          selected: false,
          onClick: () => adoptName(item.name),
        });
        body.appendChild(row);
      }
    });
  }

  /** 创建一行 */
  function makeRow(opts: {
    text: string;
    prefix: string;
    active: boolean;
    selected: boolean;
    onClick: () => void;
    /** 是否显示右侧 AI 闪光标识 */
    ai?: boolean;
  }): HTMLElement {
    const row = h('div', { class: 'tp-item' });
    Object.assign(row.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '6px 12px',
      cursor: 'pointer',
      fontSize: '12px',
      transition: 'background var(--fast)',
      background: opts.active ? 'var(--bg-hover)' : 'transparent',
      color: opts.selected ? 'var(--accent)' : 'var(--text-1)',
    } as CSSStyleDeclaration);

    const prefix = h('span');
    Object.assign(prefix.style, {
      width: '12px',
      display: 'inline-flex',
      justifyContent: 'center',
      color: opts.selected ? 'var(--accent)' : 'var(--text-3)',
      fontSize: '11px',
      flexShrink: '0',
    } as CSSStyleDeclaration);
    prefix.textContent = opts.prefix;
    row.appendChild(prefix);

    const label = h('span');
    Object.assign(label.style, {
      flex: '1',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    } as CSSStyleDeclaration);
    label.textContent = opts.text;
    row.appendChild(label);

    // 右侧 AI 闪光标识
    if (opts.ai) {
      const badge = h('span');
      Object.assign(badge.style, {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--accent)',
        flexShrink: '0',
        opacity: '0.85',
      } as CSSStyleDeclaration);
      badge.innerHTML = iconSparkle(12);
      badge.title = 'AI 建议';
      row.appendChild(badge);
    }

    if (opts.selected) {
      Object.assign(row.style, {
        background: opts.active ? 'var(--bg-hover)' : 'var(--accent-soft)',
      } as CSSStyleDeclaration);
    }

    on(row, 'mouseenter', () => {
      row.style.background = 'var(--bg-hover)';
    });
    on(row, 'mouseleave', () => {
      row.style.background = opts.active
        ? 'var(--bg-hover)'
        : opts.selected
        ? 'var(--accent-soft)'
        : 'transparent';
    });
    on(row, 'click', (e) => {
      e.stopPropagation();
      opts.onClick();
    });

    return row;
  }

  // ---- 操作 ----

  /**
   * 切换书签与某个已存在标签的关联
   */
  async function toggleTag(tagId: string): Promise<void> {
    try {
      if (selected.has(tagId)) {
        selected.delete(tagId);
        await removeBookmarkTag(bookmark.id, tagId);
      } else {
        selected.add(tagId);
        await addBookmarkTag(bookmark.id, tagId);
      }
      onChange?.();
      render();
    } catch (error) {
      console.error('[MarkPage] 切换标签失败:', error);
    }
  }

  /**
   * 通过名称采纳（用于 AI 建议 / 创建项）
   */
  async function adoptName(name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      // 优先复用现有（大小写/alias 不敏感）
      let tagId = await findTagIdByName(trimmed);
      if (!tagId) {
        tagId = await ensureTag(trimmed);
        // 刷新 defs 缓存中的本地副本
        allDefs = await getAllTagDefs();
      }
      if (!selected.has(tagId)) {
        selected.add(tagId);
        await addBookmarkTag(bookmark.id, tagId);
      }
      // 从 AI 建议中移除已采纳项
      aiSuggestions = aiSuggestions.filter((n) => n.trim().toLowerCase() !== trimmed.toLowerCase());
      // 清空输入
      query = '';
      input.value = '';
      onChange?.();
      render();
      input.focus();
    } catch (error) {
      console.error('[MarkPage] 采纳标签失败:', error);
    }
  }

  // ---- 事件 ----
  on(input, 'input', () => {
    query = input.value;
    activeIndex = 0;
    render();
  });

  // 键盘事件（全局监听，便于 ↑↓ 等在 input 中也生效）
  keydownHandler = (e: KeyboardEvent) => {
    if (!currentPopover) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      hideTagPopover();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const items = buildItems();
      if (items.length === 0) return;
      activeIndex = (activeIndex + 1) % items.length;
      render();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const items = buildItems();
      if (items.length === 0) return;
      activeIndex = (activeIndex - 1 + items.length) % items.length;
      render();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const items = buildItems();
      if (items.length === 0) return;
      const item = items[activeIndex];
      if (!item) return;
      if (item.kind === 'tag') {
        void toggleTag(item.def.id);
      } else if (item.kind === 'ai' || item.kind === 'create') {
        void adoptName(item.name);
      }
      return;
    }
  };
  document.addEventListener('keydown', keydownHandler, true);

  // 点击外部关闭
  outsideClickHandler = (e: MouseEvent) => {
    if (!currentPopover) return;
    if (currentPopover.contains(e.target as Node)) return;
    hideTagPopover();
  };
  // 异步挂载，避免当前触发点击立即关闭
  setTimeout(() => {
    if (outsideClickHandler) {
      document.addEventListener('mousedown', outsideClickHandler, true);
    }
  }, 0);
}

/**
 * 把 popover 贴到 anchor 右下角，右溢出则翻到左
 *
 * @param popover - 面板元素
 * @param anchor - 锚点元素
 */
function positionPopover(popover: HTMLElement, anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect();
  const width = 280;
  const margin = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // 水平：默认 anchor 左边对齐
  let left = rect.left;
  if (left + width + margin > vw) {
    // 右溢出：翻转到 anchor 右端右对齐（即 anchor.right - width）
    left = Math.max(margin, rect.right - width);
  }
  if (left < margin) left = margin;

  // 垂直：默认下方
  let top = rect.bottom + 4;
  // 如下方不足，翻到上方
  const maxHeight = 360;
  if (top + maxHeight + margin > vh) {
    const flipped = rect.top - 4 - maxHeight;
    if (flipped > margin) {
      top = rect.top - 4;
      // 转换为 top-based：让底部对齐 rect.top
      popover.style.transform = 'translateY(-100%)';
    }
  }

  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
}
