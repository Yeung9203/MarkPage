/**
 * 头部模块组件
 *
 * 渲染搜索框 + 常用站点快捷访问 + 内联搜索结果。
 *
 * 功能：
 *   - 搜索框（内嵌式，非弹出式）
 *   - 常用站点横向滚动条
 *   - 书签计数 + 主题切换按钮
 *   - 搜索输入时：隐藏常用站点，显示内联搜索结果
 *   - 搜索结果分区：书签结果（带高亮）+ Google 搜索
 *   - 空状态：最近搜索 + 最近访问
 *   - 无结果：友好提示
 *   - 键盘导航：上下选择，Enter 打开，ESC 清除
 *   - 直接打字触发搜索
 *   - URL 直达检测
 *
 * 使用示例：
 *   import { renderHeader } from './header';
 *   const header = renderHeader(bookmarks, pinnedSites, 47, toggleTheme);
 */

import { h, on } from '@/utils/dom';
import type { Bookmark } from '@/types';
import { iconSearch, iconSun } from './icons';

/** 常用站点数据 */
interface PinSite {
  title: string;
  url: string;
  letter: string;
  colorClass: string;
}

/** 搜索数据项（扁平化供搜索用） */
interface SearchItem {
  title: string;
  url: string;
  tag: string;
  color: string;
  letter: string;
  pinyin: string;
}

/** 最近访问项 */
interface RecentVisit {
  title: string;
  url: string;
  color: string;
  letter: string;
  time: string;
}

/** 当前导航选中索引 */
let inlineIdx = 0;

/** 最近搜索历史 */
const searchHistory = ['react', 'figma', 'tailwind'];

/** 最近访问数据 */
const recentVisits: RecentVisit[] = [
  { title: 'GitHub', url: 'github.com', color: 'f-gray', letter: 'G', time: '3 分钟前' },
  { title: 'Claude', url: 'claude.ai', color: 'f-amber', letter: 'C', time: '12 分钟前' },
  { title: 'Linear', url: 'linear.app', color: 'f-purple', letter: 'L', time: '1 小时前' },
  { title: 'Figma', url: 'figma.com', color: 'f-red', letter: 'F', time: '2 小时前' },
];

/**
 * 模糊匹配算法
 *
 * 支持精确子串匹配和不连续子序列匹配
 *
 * @param text - 待匹配文本
 * @param query - 搜索关键词
 * @returns 匹配结果
 */
function fuzzyMatch(text: string, query: string): { match: boolean; score: number; indices: number[] } {
  const t = text.toLowerCase();
  const q = query.toLowerCase();

  // 精确子串优先
  if (t.indexOf(q) !== -1) {
    return { match: true, score: 100, indices: [] };
  }

  // 模糊子序列匹配
  let ti = 0, qi = 0;
  const indices: number[] = [];
  let consecutive = 0, maxConsec = 0;

  while (ti < t.length && qi < q.length) {
    if (t[ti] === q[qi]) {
      indices.push(ti);
      consecutive++;
      if (consecutive > maxConsec) maxConsec = consecutive;
      qi++;
    } else {
      consecutive = 0;
    }
    ti++;
  }

  if (qi === q.length) {
    const score = maxConsec * 10 + (50 - indices[0]);
    return { match: true, score, indices };
  }

  return { match: false, score: 0, indices: [] };
}

/**
 * 高亮匹配文本
 *
 * @param text - 原始文本
 * @param query - 搜索关键词
 * @returns 含 <mark> 标签的 HTML 字符串
 */
function highlight(text: string, query: string): string {
  if (!query) return text;
  const q = query.toLowerCase();
  const idx = text.toLowerCase().indexOf(q);

  if (idx !== -1) {
    return text.slice(0, idx) + '<mark>' + text.slice(idx, idx + q.length) + '</mark>' + text.slice(idx + q.length);
  }

  // 模糊高亮
  const result = fuzzyMatch(text, query);
  if (result.match && result.indices.length) {
    const chars = text.split('');
    result.indices.forEach(i => {
      chars[i] = '<mark>' + chars[i] + '</mark>';
    });
    return chars.join('');
  }

  return text;
}

/**
 * 判断输入是否为 URL
 *
 * @param str - 输入字符串
 * @returns 是否为 URL
 */
function isUrl(str: string): boolean {
  return /^(https?:\/\/|www\.)/.test(str) || /^[a-z0-9-]+(\.[a-z]{2,})+/.test(str);
}

/**
 * 搜索书签
 *
 * @param searchData - 搜索数据
 * @param query - 搜索关键词
 * @returns 排序后的匹配结果
 */
function searchBookmarks(searchData: SearchItem[], query: string): { data: SearchItem; score: number }[] {
  const q = query.toLowerCase().trim();
  const results: { data: SearchItem; score: number }[] = [];

  searchData.forEach(d => {
    const titleMatch = fuzzyMatch(d.title, q);
    const urlMatch = fuzzyMatch(d.url, q);
    const tagMatch = fuzzyMatch(d.tag, q);
    const pinyinMatch = d.pinyin ? fuzzyMatch(d.pinyin, q) : { match: false, score: 0 };
    const bestScore = Math.max(
      titleMatch.score,
      urlMatch.score * 0.8,
      tagMatch.score * 0.7,
      pinyinMatch.score * 0.6,
    );

    if (titleMatch.match || urlMatch.match || tagMatch.match || pinyinMatch.match) {
      results.push({ data: d, score: bestScore });
    }
  });

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 6);
}

/**
 * 渲染头部模块
 *
 * @param bookmarks - 书签列表（供搜索使用）
 * @param pinnedSites - 常用站点列表
 * @param totalCount - 书签总数
 * @param onToggleTheme - 主题切换回调
 * @returns 头部 DOM 元素
 */
export function renderHeader(
  bookmarks: Bookmark[],
  pinnedSites: PinSite[],
  totalCount: number,
  onToggleTheme: () => void,
): HTMLElement {
  // 将书签转换为搜索数据
  const searchData: SearchItem[] = bookmarks.map(bk => ({
    title: bk.title,
    url: bk.url.replace(/^https?:\/\//, ''),
    tag: bk.category || '未分类',
    color: getColorClass(bk.title),
    letter: bk.title.charAt(0).toUpperCase(),
    pinyin: '',
  }));

  const header = h('div', { class: 'header' });

  // 顶部行：搜索框 + 元信息
  const headerTop = h('div', {
    class: 'header-top',
  });

  // 搜索框
  const searchBox = h('div', { class: 'header-search' });
  searchBox.innerHTML = iconSearch(15);

  const searchInput = document.createElement('input');
  searchInput.className = 'header-search-input';
  searchInput.type = 'text';
  searchInput.placeholder = '搜索书签或输入网址...';
  searchInput.autocomplete = 'off';
  searchInput.id = 'headerSearchInput';
  searchBox.appendChild(searchInput);

  const shortcut = h('span', { class: 'header-search-shortcut' }, '\u2318K');
  searchBox.appendChild(shortcut);

  // 点击搜索框区域聚焦输入框
  on(searchBox, 'click', () => searchInput.focus());

  headerTop.appendChild(searchBox);

  // 元信息：书签计数 + 主题切换
  const meta = h('div', { class: 'header-meta' });

  const countEl = h('span', {
    style: 'font-size:11px;color:var(--text-4);font-variant-numeric:tabular-nums;white-space:nowrap',
    id: 'headerCount',
  }, `${totalCount} 个书签`);
  meta.appendChild(countEl);

  const themeBtn = h('button', {
    style: 'width:28px;height:28px;display:flex;align-items:center;justify-content:center;background:none;border:1px solid transparent;border-radius:6px;cursor:pointer;color:var(--text-3);transition:all var(--fast)',
  });
  themeBtn.innerHTML = iconSun();
  on(themeBtn, 'click', onToggleTheme);
  meta.appendChild(themeBtn);

  headerTop.appendChild(meta);
  header.appendChild(headerTop);

  // 内联搜索结果容器（悬浮下拉，挂在搜索框下方，宽度与搜索框一致）
  const inlineResults = h('div', {
    id: 'inlineResults',
    class: 'search-dropdown',
  });
  searchBox.appendChild(inlineResults);

  // 常用站点横向滚动条
  const pinsContainer = h('div', {
    id: 'headerPins',
    class: 'header-pins',
  });

  // 空状态：友好提示用户如何添加常用
  if (pinnedSites.length === 0) {
    const empty = h('div', {
      class: 'header-pins-empty',
      style: 'padding:4px 8px;font-size:11px;color:var(--text-4)',
    }, '在任意书签上右键 → 设为常用，即可在此显示');
    pinsContainer.appendChild(empty);
  }

  pinnedSites.forEach((site, i) => {
    if (i === 8) {
      // 分隔符
      const divider = h('div', {
        style: 'width:1px;height:14px;background:var(--border);margin:0 3px;flex-shrink:0',
      });
      pinsContainer.appendChild(divider);
    }

    const pin = h('a', {
      class: 'pin-item',
      href: `https://${site.url}`,
    });
    pin.innerHTML = `<span class="pin-fav ${site.colorClass}">${site.letter}</span>${site.title}`;

    on(pin, 'click', (e) => {
      e.preventDefault();
      window.open(`https://${site.url}`, '_blank');
    });

    pinsContainer.appendChild(pin);
  });

  header.appendChild(pinsContainer);

  // ---- 事件绑定 ----

  /**
   * 显示空状态（最近搜索 + 最近访问）
   */
  function showEmptyState() {
    /* 浮层模式下无需隐藏常用站点 */
    inlineIdx = 0;

    let html = '';

    // 最近搜索
    if (searchHistory.length > 0) {
      html += '<div style="margin-bottom:4px"><div style="font-size:10px;font-weight:600;color:var(--text-4);text-transform:uppercase;letter-spacing:0.06em;padding:4px 4px 2px">最近搜索</div>';
      searchHistory.forEach(term => {
        html += `<div class="ir-item" data-nav="true" data-search="${term}" style="display:flex;align-items:center;gap:8px;padding:5px 6px;border-radius:6px;cursor:pointer;font-size:12px">
          <span style="width:20px;height:20px;border-radius:4px;display:flex;align-items:center;justify-content:center;color:var(--text-4)">${iconSearch(14)}</span>
          <div style="flex:1;min-width:0"><div style="font-weight:450;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${term}</div></div>
        </div>`;
      });
      html += '</div>';
    }

    // 最近访问
    html += '<div style="margin-bottom:4px"><div style="font-size:10px;font-weight:600;color:var(--text-4);text-transform:uppercase;letter-spacing:0.06em;padding:4px 4px 2px">最近访问</div>';
    recentVisits.forEach(v => {
      html += `<div class="ir-item" data-nav="true" data-url="https://${v.url}" style="display:flex;align-items:center;gap:8px;padding:5px 6px;border-radius:6px;cursor:pointer;font-size:12px">
        <span class="${v.color}" style="width:20px;height:20px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:700;flex-shrink:0">${v.letter}</span>
        <div style="flex:1;min-width:0"><div style="font-weight:450;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${v.title}</div><div style="font-size:10px;color:var(--text-4);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${v.url}</div></div>
        <span style="font-size:10px;color:var(--text-4)">${v.time}</span>
      </div>`;
    });
    html += '</div>';

    html += '<div style="display:flex;gap:12px;padding:6px 6px 2px;font-size:10px;color:var(--text-4)"><span><kbd style="font-family:var(--font);font-size:9px;background:var(--bg-3);padding:0 4px;border-radius:2px;font-weight:500;color:var(--text-3)">↑↓</kbd> 导航</span><span><kbd style="font-family:var(--font);font-size:9px;background:var(--bg-3);padding:0 4px;border-radius:2px;font-weight:500;color:var(--text-3)">↵</kbd> 打开</span><span><kbd style="font-family:var(--font);font-size:9px;background:var(--bg-3);padding:0 4px;border-radius:2px;font-weight:500;color:var(--text-3)">esc</kbd> 关闭</span></div>';

    inlineResults.innerHTML = html;
    inlineResults.classList.add('visible');

    // 绑定点击事件
    bindNavEvents();
  }

  /**
   * 处理搜索输入
   */
  function handleSearch(val: string) {
    if (!val.trim()) {
      inlineResults.classList.remove('visible');
      inlineResults.innerHTML = '';
      /* 浮层模式下无需恢复常用站点 */
      inlineIdx = 0;
      return;
    }

    /* 浮层模式下无需隐藏常用站点 */
    inlineIdx = 0;
    const q = val.trim();

    // 检测 URL 直达
    const urlDirect = isUrl(q);

    // 执行搜索
    const matched = searchBookmarks(searchData, q);

    let html = '';

    // URL 直达提示
    if (urlDirect) {
      const cleanUrl = q.replace(/^https?:\/\//, '');
      html += `<div style="margin-bottom:4px">
        <div class="ir-item active" data-nav="true" data-url="https://${cleanUrl}" style="display:flex;align-items:center;gap:8px;padding:5px 6px;border-radius:6px;cursor:pointer;font-size:12px">
          <span class="f-blue" style="width:20px;height:20px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:10px">↗</span>
          <div style="flex:1;min-width:0"><div style="font-weight:450;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">直接访问 <mark>${cleanUrl}</mark></div><div style="font-size:10px;color:var(--text-4);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">按 Enter 打开网页</div></div>
        </div></div>`;
    }

    // 书签结果
    if (matched.length > 0) {
      html += `<div style="margin-bottom:4px"><div style="font-size:10px;font-weight:600;color:var(--text-4);text-transform:uppercase;letter-spacing:0.06em;padding:4px 4px 2px">书签 \u00B7 ${matched.length} 个匹配</div>`;
      matched.forEach((m, i) => {
        const isFirst = !urlDirect && i === 0;
        html += `<div class="ir-item${isFirst ? ' active' : ''}" data-nav="true" data-url="https://${m.data.url}" style="display:flex;align-items:center;gap:8px;padding:5px 6px;border-radius:6px;cursor:pointer;font-size:12px">
          <span class="${m.data.color}" style="width:20px;height:20px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:700;flex-shrink:0">${m.data.letter}</span>
          <div style="flex:1;min-width:0"><div style="font-weight:450;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${highlight(m.data.title, q)}</div>
          <div style="font-size:10px;color:var(--text-4);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${highlight(m.data.url, q)}</div></div>
          <span style="font-size:10px;color:var(--accent);background:var(--accent-soft);padding:1px 5px;border-radius:3px;flex-shrink:0">${m.data.tag}</span></div>`;
      });
      html += '</div>';
    }

    // 无结果空状态
    if (matched.length === 0 && !urlDirect) {
      html += `<div style="margin-bottom:4px">
        <div style="padding:16px 6px;text-align:center;">
          <div style="font-size:20px;margin-bottom:6px;opacity:0.3">\uD83D\uDD0D</div>
          <div style="font-size:12px;color:var(--text-3)">未找到匹配 "${q}" 的书签</div>
          <div style="font-size:11px;color:var(--text-4);margin-top:4px">试试用 Google 搜索，或检查拼写</div>
        </div></div>`;
    }

    // Google 搜索
    html += `<div style="margin-bottom:4px"><div class="ir-google" data-nav="true" data-url="https://www.google.com/search?q=${encodeURIComponent(q)}" style="display:flex;align-items:center;gap:8px;padding:5px 6px;border-radius:6px;cursor:pointer;color:var(--text-3);font-size:12px">
      ${iconSearch(14)}
      搜索 "<strong>${q}</strong>" \u2192 Google</div></div>`;

    // 底栏快捷键提示
    html += '<div style="display:flex;gap:12px;padding:6px 6px 2px;font-size:10px;color:var(--text-4)"><span><kbd style="font-family:var(--font);font-size:9px;background:var(--bg-3);padding:0 4px;border-radius:2px;font-weight:500;color:var(--text-3)">↑↓</kbd> 导航</span><span><kbd style="font-family:var(--font);font-size:9px;background:var(--bg-3);padding:0 4px;border-radius:2px;font-weight:500;color:var(--text-3)">↵</kbd> 打开</span><span><kbd style="font-family:var(--font);font-size:9px;background:var(--bg-3);padding:0 4px;border-radius:2px;font-weight:500;color:var(--text-3)">esc</kbd> 清除</span></div>';

    inlineResults.innerHTML = html;
    inlineResults.classList.add('visible');

    // 高亮标记样式
    inlineResults.querySelectorAll('mark').forEach(m => {
      (m as HTMLElement).style.cssText = 'background:var(--accent-soft);color:var(--accent);border-radius:2px;padding:0 1px';
    });

    // 绑定点击事件
    bindNavEvents();
  }

  /**
   * 为搜索结果绑定导航和点击事件
   */
  function bindNavEvents() {
    const items = inlineResults.querySelectorAll('[data-nav]');
    items.forEach(item => {
      on(item as HTMLElement, 'click', () => {
        const url = (item as HTMLElement).getAttribute('data-url');
        const searchTerm = (item as HTMLElement).getAttribute('data-search');
        if (url) {
          window.open(url, '_blank');
        } else if (searchTerm) {
          searchInput.value = searchTerm;
          searchInput.focus();
          handleSearch(searchTerm);
        }
      });
    });
  }

  /**
   * 处理键盘导航
   */
  function handleSearchKey(e: KeyboardEvent) {
    const items = inlineResults.querySelectorAll('[data-nav]');

    if (!items.length) {
      if (e.key === 'ArrowDown') {
        showEmptyState();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (items[inlineIdx]) items[inlineIdx].classList.remove('active');
      inlineIdx = (inlineIdx + 1) % items.length;
      items[inlineIdx].classList.add('active');
      (items[inlineIdx] as HTMLElement).scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (items[inlineIdx]) items[inlineIdx].classList.remove('active');
      inlineIdx = (inlineIdx - 1 + items.length) % items.length;
      items[inlineIdx].classList.add('active');
      (items[inlineIdx] as HTMLElement).scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (items[inlineIdx]) {
        (items[inlineIdx] as HTMLElement).click();
      } else {
        const q = searchInput.value;
        if (q.trim()) window.open('https://www.google.com/search?q=' + encodeURIComponent(q), '_blank');
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      searchInput.value = '';
      handleSearch('');
      searchInput.blur();
      /* 浮层模式下无需恢复常用站点 */
      inlineResults.classList.remove('visible');
    }
  }

  // 输入法组合状态标记（中文/日文/韩文输入法）
  let isComposing = false;
  on(searchInput, 'compositionstart', () => { isComposing = true; });
  on(searchInput, 'compositionend', () => {
    isComposing = false;
    handleSearch(searchInput.value);
  });

  // 绑定搜索事件（组合期间不触发）
  on(searchInput, 'input', () => {
    if (!isComposing) handleSearch(searchInput.value);
  });
  on(searchInput, 'focus', () => {
    if (searchInput.value.trim()) {
      handleSearch(searchInput.value);
    } else {
      showEmptyState();
    }
  });
  on(searchInput, 'keydown', (e: KeyboardEvent) => {
    if (isComposing) return;
    handleSearchKey(e);
  });

  // 点击搜索框和下拉框以外的任何区域，关闭下拉框
  on(document, 'mousedown', (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest('.header-search') && !target.closest('.search-dropdown')) {
      inlineResults.classList.remove('visible');
    }
  });

  return header;
}

/**
 * 根据书签标题分配颜色 class
 *
 * @param title - 书签标题
 * @returns CSS 颜色 class 名
 */
function getColorClass(title: string): string {
  const colors = ['f-gray', 'f-blue', 'f-green', 'f-amber', 'f-red', 'f-purple', 'f-teal', 'f-pink'];
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = ((hash << 5) - hash) + title.charCodeAt(i);
    hash |= 0;
  }
  return colors[Math.abs(hash) % colors.length];
}

/**
 * 更新头部书签计数
 *
 * @param text - 显示文本
 */
export function updateHeaderCount(text: string): void {
  const el = document.getElementById('headerCount');
  if (el) el.textContent = text;
}

/**
 * 刷新头部常用站点条
 *
 * 清空现有内容，用新数据重新渲染。用于常用标记切换后实时更新。
 *
 * @param pinnedSites - 新的常用站点列表
 */
export function refreshHeaderPins(pinnedSites: PinSite[]): void {
  const container = document.getElementById('headerPins');
  if (!container) return;
  container.innerHTML = '';

  if (pinnedSites.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'header-pins-empty';
    empty.style.cssText = 'padding:4px 8px;font-size:11px;color:var(--text-4)';
    empty.textContent = '在任意书签上右键 → 设为常用，即可在此显示';
    container.appendChild(empty);
    return;
  }

  pinnedSites.forEach((site, i) => {
    if (i === 8) {
      const divider = document.createElement('div');
      divider.style.cssText = 'width:1px;height:14px;background:var(--border);margin:0 3px;flex-shrink:0';
      container.appendChild(divider);
    }
    const pin = document.createElement('a');
    pin.className = 'pin-item';
    pin.href = `https://${site.url}`;
    pin.innerHTML = `<span class="pin-fav ${site.colorClass}">${site.letter}</span>${site.title}`;
    pin.addEventListener('click', (e) => {
      e.preventDefault();
      window.open(`https://${site.url}`, '_blank');
    });
    container.appendChild(pin);
  });
}
