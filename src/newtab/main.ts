/**
 * 新标签页入口模块
 *
 * 负责初始化整个新标签页应用：
 *   1. 加载用户设置（主题、强调色等）
 *   2. 获取书签数据并按分类分组
 *   3. 渲染侧边栏、搜索框、书签列表
 *   4. 注册键盘快捷键（Cmd+K 搜索等）
 *
 * 使用示例：
 *   该文件由 index.html 直接引入，无需手动调用
 */

import { getSettings, onSettingsChange } from '@/services/storage';
import { getAllBookmarks, getBookmarkTree, extractCategories } from '@/services/bookmarks';
import { getAllTagDefs, getAllBookmarkTagMap, ensureTag, setBookmarkTags } from '@/services/tags';
import { suggestTagsForBookmark } from '@/services/tag-ai';
import type { Settings, Bookmark, Category } from '@/types';
import { $, on, setCSSVars } from '@/utils/dom';
import { initScrollIndicator } from '@/utils/scroll-indicator';
import { t } from '@/utils/i18n';

// 更新文档标题为当前 locale 的文案
try {
  document.title = t('newtab_title');
} catch {
  // 忽略（e.g. 非扩展环境）
}

// 初始化滚动条显隐指示器（默认隐藏，滚动时显示）
initScrollIndicator();

// 组件导入
import { renderSidebar } from './components/sidebar';
import { renderHeader, updateHeaderCount } from './components/header';
import { renderBookmarkList, filterBookmarkGroups } from './components/bookmark-list';
import { renderSettingsDrawer, openSettings, closeSettings } from './components/settings-drawer';
import { renderAIDrawer, openAIDrawer, closeAIDrawer } from './components/ai-drawer';
import { renderAIToast, showAIToast } from './components/ai-toast-init';
import { hideContextMenu } from './components/context-menu';

// ============================================================
// Mock 数据（Chrome API 不可用时使用）
// ============================================================

/** 模拟书签数据（包含 parentId 和 dateAdded 用于常用/最近筛选） */
const now = Date.now();
const DAY = 86400000;
const MOCK_BOOKMARKS: Bookmark[] = [
  // 开发工具（部分在书签栏 parentId='1'，作为常用）
  { id: '1', title: 'GitHub', url: 'https://github.com', category: '开发工具', parentId: '1', dateAdded: now - 2 * DAY },
  { id: '2', title: 'Vercel', url: 'https://vercel.com', category: '开发工具', parentId: '1', dateAdded: now - 5 * DAY },
  { id: '3', title: 'Linear', url: 'https://linear.app', category: '开发工具', parentId: '100', dateAdded: now - 10 * DAY },
  { id: '4', title: 'Netlify', url: 'https://netlify.com', category: '开发工具', parentId: '100', dateAdded: now - 15 * DAY },
  { id: '5', title: 'CodePen', url: 'https://codepen.io', category: '开发工具', parentId: '100', dateAdded: now - 20 * DAY },
  { id: '6', title: 'StackOverflow', url: 'https://stackoverflow.com', category: '开发工具', parentId: '100', dateAdded: now - 25 * DAY },
  // 技术文档
  { id: '10', title: 'MDN Web Docs', url: 'https://developer.mozilla.org', category: '技术文档', parentId: '101', dateAdded: now - 3 * DAY },
  { id: '11', title: 'React Documentation', url: 'https://react.dev', category: '技术文档', parentId: '101', dateAdded: now - 7 * DAY },
  { id: '12', title: 'Next.js Docs', url: 'https://nextjs.org/docs', category: '技术文档', parentId: '101', dateAdded: now - 12 * DAY },
  { id: '13', title: 'Tailwind CSS', url: 'https://tailwindcss.com/docs', category: '技术文档', parentId: '101', dateAdded: now - 18 * DAY },
  { id: '14', title: 'TypeScript Handbook', url: 'https://typescriptlang.org/docs', category: '技术文档', parentId: '101', dateAdded: now - 40 * DAY },
  // 设计
  { id: '20', title: 'Figma', url: 'https://figma.com', category: '设计', parentId: '1', dateAdded: now - 1 * DAY },
  { id: '21', title: 'Dribbble', url: 'https://dribbble.com', category: '设计', parentId: '102', dateAdded: now - 35 * DAY },
  { id: '22', title: 'Awwwards', url: 'https://awwwards.com', category: '设计', parentId: '102', dateAdded: now - 45 * DAY },
  // AI 工具
  { id: '30', title: 'Claude', url: 'https://claude.ai', category: 'AI 工具', parentId: '1', dateAdded: now - 1 * DAY },
  { id: '31', title: 'ChatGPT', url: 'https://chatgpt.com', category: 'AI 工具', parentId: '103', dateAdded: now - 4 * DAY },
  { id: '32', title: 'Midjourney', url: 'https://midjourney.com', category: 'AI 工具', parentId: '103', dateAdded: now - 50 * DAY },
  // 社交媒体
  { id: '40', title: 'Twitter / X', url: 'https://x.com', category: '社交媒体', parentId: '104', dateAdded: now - 6 * DAY },
  { id: '41', title: '知乎', url: 'https://zhihu.com', category: '社交媒体', parentId: '104', dateAdded: now - 8 * DAY },
  { id: '42', title: '微博', url: 'https://weibo.com', category: '社交媒体', parentId: '104', dateAdded: now - 60 * DAY },
  { id: '43', title: 'V2EX', url: 'https://v2ex.com', category: '社交媒体', parentId: '104', dateAdded: now - 14 * DAY },
  // 影音娱乐
  { id: '50', title: 'YouTube', url: 'https://youtube.com', category: '影音娱乐', parentId: '1', dateAdded: now - 2 * DAY },
  { id: '51', title: 'Bilibili', url: 'https://bilibili.com', category: '影音娱乐', parentId: '105', dateAdded: now - 9 * DAY },
  { id: '52', title: 'Spotify', url: 'https://spotify.com', category: '影音娱乐', parentId: '105', dateAdded: now - 55 * DAY },
  // 未分类
  { id: '60', title: 'Notion', url: 'https://notion.so', category: '未分类', parentId: '1', dateAdded: now - 3 * DAY },
  { id: '61', title: 'Slack', url: 'https://slack.com', category: '未分类', parentId: '106', dateAdded: now - 11 * DAY },
  { id: '62', title: 'Gmail', url: 'https://gmail.com', category: '未分类', parentId: '1', dateAdded: now - 0.5 * DAY },
];

/** 模拟分类数据 */
const MOCK_CATEGORIES: Category[] = [
  { id: 'cat-1', name: '开发工具', icon: 'D', count: 6 },
  { id: 'cat-2', name: '技术文档', icon: 'D', count: 5 },
  { id: 'cat-3', name: '设计', icon: 'D', count: 3 },
  { id: 'cat-4', name: 'AI 工具', icon: 'A', count: 3 },
  { id: 'cat-5', name: '社交媒体', icon: 'S', count: 4 },
  { id: 'cat-6', name: '影音娱乐', icon: 'M', count: 3 },
  { id: 'cat-7', name: '未分类', icon: '?', count: 3 },
];

/** 常用站点 */
const PINNED_SITES = [
  { title: 'GitHub', url: 'github.com', letter: 'G', colorClass: 'f-gray' },
  { title: 'Notion', url: 'notion.so', letter: 'N', colorClass: 'f-blue' },
  { title: 'Figma', url: 'figma.com', letter: 'F', colorClass: 'f-red' },
  { title: 'Slack', url: 'slack.com', letter: 'S', colorClass: 'f-green' },
  { title: 'Gmail', url: 'gmail.com', letter: 'G', colorClass: 'f-amber' },
  { title: 'Claude', url: 'claude.ai', letter: 'C', colorClass: 'f-purple' },
  { title: 'Vercel', url: 'vercel.com', letter: 'V', colorClass: 'f-teal' },
  { title: 'Linear', url: 'linear.app', letter: 'L', colorClass: 'f-blue' },
  // 分隔符之后
  { title: 'Twitter', url: 'x.com', letter: 'T', colorClass: 'f-pink' },
  { title: 'YouTube', url: 'youtube.com', letter: 'Y', colorClass: 'f-red' },
  { title: '知乎', url: 'zhihu.com', letter: 'Z', colorClass: 'f-green' },
];

/** 常用站点首字母配色循环（根据标题 hash 分配） */
const PIN_COLOR_POOL = ['f-gray', 'f-blue', 'f-green', 'f-amber', 'f-red', 'f-purple', 'f-teal', 'f-pink'];

/**
 * 从用户真实书签中构建常用站点列表
 *
 * 规则：取书签栏（parentId === '1'）下的直接书签（不含文件夹内嵌套），
 * 按 dateAdded 降序，最多取 12 个。
 *
 * @param bookmarks - 全部书签（扁平化列表）
 * @returns 常用站点列表（如果书签栏为空则返回空数组）
 */
function buildPinnedSites(bookmarks: Bookmark[], limit: number = 12): typeof PINNED_SITES {
  const barItems = bookmarks
    .filter((b) => b.url)
    .sort((a, b) => (b.dateAdded ?? 0) - (a.dateAdded ?? 0))
    .slice(0, limit);

  return barItems.map((b) => {
    // 从 URL 的 hostname 第一个字母作为占位符
    let letter = b.title.trim().charAt(0).toUpperCase();
    if (!letter) {
      try {
        const host = new URL(b.url).hostname.replace(/^www\./, '');
        letter = host.charAt(0).toUpperCase();
      } catch {
        letter = '?';
      }
    }

    // 按标题 hash 分配一个固定配色
    let hash = 0;
    for (let i = 0; i < b.title.length; i++) {
      hash = ((hash << 5) - hash + b.title.charCodeAt(i)) | 0;
    }
    const colorClass = PIN_COLOR_POOL[Math.abs(hash) % PIN_COLOR_POOL.length];

    // 简化 URL 为域名
    let url = b.url;
    try {
      url = new URL(b.url).hostname.replace(/^www\./, '');
    } catch {
      // keep original
    }

    return { title: b.title || url, url, letter, colorClass };
  });
}

/**
 * 检测 Chrome API 是否可用
 *
 * @returns 是否在 Chrome 扩展环境中运行
 */
function isChromeExtension(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.bookmarks;
}

/**
 * 应用初始化
 *
 * 按顺序执行：加载设置 -> 应用主题 -> 获取书签 -> 渲染界面
 */
async function init(): Promise<void> {
  // 加载用户设置并应用主题
  const settings = await getSettings();
  applyTheme(settings);

  // 获取书签数据（优先使用 Chrome API，不可用时使用 mock）
  let bookmarks: Bookmark[];
  let categories: Category[];

  if (isChromeExtension()) {
    bookmarks = await getAllBookmarks();
    // 从书签树提取分类（含空文件夹 + 嵌套子分类，使用真实 Chrome folder ID）
    const tree = await getBookmarkTree();
    categories = extractCategories(tree);
  } else {
    // 开发环境：使用 mock 数据
    bookmarks = MOCK_BOOKMARKS;
    categories = MOCK_CATEGORIES;
  }

  // 渲染界面
  await renderApp(bookmarks, categories, settings);

  // 如果上一次操作（如"移动到"）设置了挂起的筛选，恢复到对应菜单
  try {
    const pending = sessionStorage.getItem('markpage-pending-filter');
    if (pending) {
      sessionStorage.removeItem('markpage-pending-filter');
      applyPendingFilter(pending);
    }
  } catch { /* 忽略 */ }

  // 注册全局快捷键
  registerShortcuts();

  // 监听设置变化
  onSettingsChange(applyTheme);

  // 注册 AI 分类消息监听器（从 background 接收分类结果）
  registerAIMessageListener();

  // 延迟启动后台补标（仅扫最近 7 天内未打标书签）
  scheduleBackfillTags(bookmarks, settings);

  // 监听 Chrome 书签变化（新增 / 删除 / 修改 / 移动），自动同步 MarkPage
  registerBookmarkSync();
}

/**
 * 监听 Chrome 书签事件，变更时自动刷新 MarkPage
 *
 * 使用 300ms 防抖，避免批量操作（如导入书签）触发大量重渲染。
 *
 * 使用示例：
 *   registerBookmarkSync(); // 在 init() 末尾调用一次
 */
function registerBookmarkSync(): void {
  if (!isChromeExtension() || !chrome.bookmarks) return;

  let timer: number | undefined;
  const scheduleReload = (): void => {
    if (timer) clearTimeout(timer);
    timer = window.setTimeout(() => {
      // 直接整页刷新最简单可靠；保留当前滚动位置由浏览器处理
      window.location.reload();
    }, 300);
  };

  chrome.bookmarks.onCreated.addListener(scheduleReload);
  chrome.bookmarks.onRemoved.addListener(scheduleReload);
  chrome.bookmarks.onChanged.addListener(scheduleReload);
  chrome.bookmarks.onMoved.addListener(scheduleReload);

  // 监听标签映射变化（后台 AI 自动打标写入），实时刷新行上的 chip
  if (chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener(async (changes, area) => {
      if (area !== 'local') return;
      if ('markpage_tag_map' in changes || 'markpage_tags' in changes) {
        try {
          const { refreshAllRowTags } = await import('./components/bookmark-list');
          await refreshAllRowTags();
        } catch (err) {
          console.warn('[MarkPage] 刷新标签 chip 失败:', err);
        }
      }
    });
  }
}

/**
 * 延迟启动后台补标流程
 *
 * 仅扫最近 7 天新增、且尚无标签的书签，5 秒后开跑，每条间隔 1 秒，
 * 避免阻塞首屏 + 减轻 API 压力。不刷新整个列表（避免打断用户操作），
 * 只对已渲染行做轻量 DOM 更新（失败也静默，等下次加载自然同步）。
 *
 * 使用示例：
 *   scheduleBackfillTags(bookmarks, settings);
 *
 * @param bookmarks - 当前书签列表
 * @param settings - 用户设置
 */
function scheduleBackfillTags(bookmarks: Bookmark[], settings: Settings): void {
  // 前置校验：AI 未启用 / 无 apiKey → 跳过
  if (!settings.ai?.enabled || !settings.ai?.apiKey) return;
  if (!isChromeExtension()) return;

  setTimeout(async () => {
    try {
      const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
      const cutoff = Date.now() - SEVEN_DAYS;

      // 读取关联表，判定"未打标"
      const tagMap = await getAllBookmarkTagMap();

      // 筛选候选：最近 7 天 && 尚无标签 && 有 URL
      const candidates = bookmarks.filter((bk) => {
        if (!bk.url) return false;
        if (!bk.dateAdded || bk.dateAdded < cutoff) return false;
        const existing = tagMap[bk.id];
        return !existing || existing.length === 0;
      });

      if (candidates.length === 0) return;

      let done = 0;
      for (let i = 0; i < candidates.length; i++) {
        const bk = candidates[i];
        try {
          // 每次拉取最新的已有标签名（期间可能被 service worker 新增了标签）
          const defs = await getAllTagDefs();
          const existingNames = defs.map((d) => d.name);

          const suggested = await suggestTagsForBookmark(bk, existingNames, settings.ai);
          if (suggested && suggested.length > 0) {
            const tagIds: string[] = [];
            for (const name of suggested) {
              try {
                const id = await ensureTag(name);
                tagIds.push(id);
              } catch (error) {
                console.error('[MarkPage] 补标 ensureTag 失败:', error);
              }
            }
            if (tagIds.length > 0) {
              await setBookmarkTags(bk.id, tagIds);
              done++;
            }
          }
        } catch (error) {
          console.error('[MarkPage] 补标单条失败:', error);
        }

        // 每条之间 1 秒间隔
        if (i < candidates.length - 1) {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }

      console.log(`[MarkPage] 后台补标完成 ${done} 条`);
    } catch (error) {
      console.error('[MarkPage] 后台补标流程失败:', error);
    }
  }, 5000);
}

/**
 * 应用主题设置
 *
 * @param settings - 用户设置
 */
function applyTheme(settings: Settings): void {
  // 记录用户偏好（原始模式），早期脚本下次刷新时能同步读取，避免闪烁
  try {
    localStorage.setItem('markpage-theme', settings.theme);
  } catch { /* 忽略 */ }

  // 根据 settings.theme 设置 data-theme 属性
  let theme = settings.theme;
  if (theme === 'system') {
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', theme);

  // 根据 settings.accentColor 设置 --accent 变量
  if (settings.accentColor) {
    setCSSVars({ '--accent': settings.accentColor });
  }

  // 恢复 localStorage 中保存的主题色
  try {
    const savedAccent = localStorage.getItem('markpage-accent');
    if (savedAccent) {
      setCSSVars({ '--accent': savedAccent });
    }
  } catch { /* 忽略 */ }
}

/**
 * 应用挂起的筛选（由"移动到"等操作触发）
 *
 * 传入原始 filter 字符串（形如 `category:才`），找到侧边栏对应项：
 *   - 找到 → 模拟点击（自动展开父级折叠区、设置 active、触发筛选）
 *   - 找不到 → 直接调 filterBookmarkGroups 作为兜底
 *
 * @param pending - 挂起的 filter 串
 */
function applyPendingFilter(pending: string): void {
  // 查找精确匹配的侧边栏项；对于 category:X，支持匹配 "category:X" 或 "category:X|..."
  const allItems = Array.from(
    document.querySelectorAll<HTMLElement>('.sidebar-item[data-filter]'),
  );
  const targetName = pending.startsWith('category:')
    ? pending.replace('category:', '')
    : '';

  const hit = allItems.find((el) => {
    const f = el.getAttribute('data-filter') || '';
    if (f === pending) return true;
    // 侧边栏的 data-filter 在点击时被扩展为 "category:A|B"，初始则是 "category:A"
    if (targetName && f === `category:${targetName}`) return true;
    return false;
  });

  if (hit) {
    // 若在折叠区里先展开父级
    const restWrap = hit.closest('.sidebar-cat-children') as HTMLElement | null;
    if (restWrap && restWrap.style.display === 'none') {
      restWrap.style.display = '';
    }
    hit.click();
  } else {
    // 兜底
    import('./components/bookmark-list').then(({ filterBookmarkGroups }) => {
      filterBookmarkGroups(pending);
    });
  }
}

/**
 * 切换主题（顶部太阳/月亮按钮）
 *
 * 把选择持久化到：
 *   - chrome.storage（settings.theme，供设置页同步）
 *   - localStorage（markpage-theme，供早期脚本下次刷新时同步读取，避免 FOUC）
 */
function toggleTheme(): void {
  const current = document.documentElement.getAttribute('data-theme');
  const next: 'light' | 'dark' = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);

  // 持久化用户的显式选择（覆盖 'system'）
  try {
    localStorage.setItem('markpage-theme', next);
  } catch { /* 忽略 */ }

  // 异步写入 chrome.storage，保持设置页与其状态一致
  import('@/services/storage').then(({ updateSettings }) => {
    updateSettings({ theme: next }).catch((err) => {
      console.error('[MarkPage] 持久化主题失败:', err);
    });
  });
}

/**
 * 渲染整个应用界面
 *
 * @param bookmarks - 书签列表
 * @param categories - 分类列表
 * @param _settings - 用户设置
 */
async function renderApp(bookmarks: Bookmark[], categories: Category[], _settings: Settings): Promise<void> {
  const app = $('#app');
  if (!app) return;

  const totalCount = bookmarks.length;

  // 创建布局容器
  const layout = document.createElement('div');
  layout.className = 'app';

  // 渲染侧边栏
  const sidebar = renderSidebar(
    categories,
    totalCount,
    (filter) => {
      filterBookmarkGroups(filter);
    },
    () => openSettings(),
    () => openAIDrawer(),
  );
  layout.appendChild(sidebar);

  // 主内容区域
  const main = document.createElement('div');
  main.className = 'main-content';

  // 常用站点：只显示用户手动标记的书签（未标记则为空，不自动填充）
  const { getFrequentIds: getFreq } = await import('@/services/storage');
  const frequentIds = await getFreq();
  const markedBookmarks = bookmarks.filter((b) => frequentIds.includes(b.id));
  const realPinned = buildPinnedSites(markedBookmarks, 12);
  const header = renderHeader(bookmarks, realPinned, totalCount, toggleTheme);
  main.appendChild(header);

  // 渲染书签列表（async：需等待标签定义加载完成）
  const bookmarkList = await renderBookmarkList(bookmarks, categories);
  main.appendChild(bookmarkList);

  layout.appendChild(main);

  // 渲染设置抽屉（内嵌在 layout 中，打开时挤压主内容）
  const settingsDrawer = renderSettingsDrawer();
  layout.appendChild(settingsDrawer);

  // 渲染 AI 整理抽屉
  const aiDrawer = renderAIDrawer();
  layout.appendChild(aiDrawer);

  app.appendChild(layout);

  // 渲染 AI Toast（初始化容器）
  renderAIToast();
}

/**
 * 注册全局键盘快捷键
 *
 * 支持：
 *   - Cmd/Ctrl + K：聚焦搜索框
 *   - /：聚焦搜索框
 *   - Escape：关闭面板
 */
function registerShortcuts(): void {
  on(document, 'keydown', (e: KeyboardEvent) => {
    // Cmd/Ctrl + K：聚焦搜索框
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      const searchInput = document.getElementById('headerSearchInput') as HTMLInputElement;
      if (searchInput) searchInput.focus();
      return;
    }

    // Escape：关闭所有面板
    if (e.key === 'Escape') {
      closeSettings();
      closeAIDrawer();
      hideContextMenu();

      // 清空搜索
      const searchInput = document.getElementById('headerSearchInput') as HTMLInputElement;
      if (document.activeElement === searchInput) {
        searchInput.value = '';
        searchInput.blur();
        const inlineResults = document.getElementById('inlineResults');
        const headerPins = document.getElementById('headerPins');
        if (inlineResults) inlineResults.style.display = 'none';
        if (headerPins) headerPins.style.display = '';
      }
    }
  });

  // 直接打字搜索（不在输入框时自动聚焦搜索框）
  on(document, 'keypress', (e: KeyboardEvent) => {
    const active = document.activeElement;
    if (!active) return;
    const tag = active.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

    // 排除设置面板打开时
    const settingsDrawer = document.getElementById('settingsDrawer');
    if (settingsDrawer && settingsDrawer.style.transform === 'translateX(0)') return;

    if (e.ctrlKey || e.metaKey || e.altKey) return;

    // 直接聚焦搜索框
    const searchInput = document.getElementById('headerSearchInput') as HTMLInputElement;
    if (searchInput) searchInput.focus();
  });
}

/**
 * 从书签列表中提取分类
 *
 * @param bookmarks - 书签列表
 * @returns 分类列表
 */
function extractCategoriesFromBookmarks(bookmarks: Bookmark[]): Category[] {
  const catMap = new Map<string, number>();
  bookmarks.forEach(bk => {
    const cat = bk.category || '未分类';
    catMap.set(cat, (catMap.get(cat) || 0) + 1);
  });

  return Array.from(catMap.entries()).map(([name, count], idx) => ({
    id: `cat-${idx}`,
    name,
    count,
  }));
}

/**
 * 注册 AI 分类消息监听器
 *
 * 监听 background script 发来的分类结果消息，
 * 收到 type === 'classifyResult' 时调用 showAIToast() 展示分类建议
 */
function registerAIMessageListener(): void {
  // Chrome API 不可用时不注册监听器
  if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) {
    console.warn('[MarkPage] Chrome runtime API 不可用，跳过消息监听');
    return;
  }

  chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
    if (message.type === 'classifyResult' && message.result && message.bookmark) {
      // 展示 AI 分类通知
      showAIToast(message.result, message.bookmark);
    }
  });
}

// 启动应用
document.addEventListener('DOMContentLoaded', init);
