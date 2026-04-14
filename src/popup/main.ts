/**
 * 弹窗入口模块
 *
 * 当用户点击插件图标时弹出：
 *   - 显示当前页面是否已收藏
 *   - 如果启用 AI 分类，显示分类建议
 *   - 提供快捷操作：收藏、编辑、打开新标签页
 *
 * 使用示例：
 *   该文件由 popup/index.html 直接引入
 */

import { classify, saveClassifyHistory } from '@/services/ai';
import {
  searchBookmarks,
  createBookmark,
  moveBookmark,
  extractCategories,
  getBookmarkTree,
  createFolder,
} from '@/services/bookmarks';
import { getSettings, onSettingsChange } from '@/services/storage';
import type { ClassifyResult, Settings, Category } from '@/types';
import { t } from '@/utils/i18n';

/** 弹窗根元素 */
let popupRoot: HTMLElement | null = null;

/** 当前标签页信息缓存 */
let currentTabInfo: { title: string; url: string } | null = null;

/** 当前分类列表缓存 */
let currentCategories: Category[] = [];

/** 当前设置缓存 */
let currentSettings: Settings | null = null;

/** 缓存 AI 分类结果，用于"选择其他 → 返回"回到原状态 */
let cachedClassifyResult: ClassifyResult | null = null;

/** 默认设置（Chrome API 不可用时的降级方案） */
const FALLBACK_SETTINGS: Settings = {
  theme: 'dark',
  accentColor: '#8b5cf6',
  searchEngine: 'google',
  autoFocusSearch: true,
  compactMode: false,
  ai: {
    enabled: false,
    provider: 'openai',
    model: 'gpt-4o-mini',
    apiKey: '',
    baseUrl: '',
    autoConfirm: false,
    autoConfirmThreshold: 0.8,
  },
};

// ============================================================
// 主题应用
// ============================================================

/**
 * 根据用户设置应用主题和强调色
 *
 * 读取 settings.theme 判断 dark/light/system，
 * 并将 data-theme 设置到 <html> 上，使 tokens.css 变量生效。
 * 如果用户自定义了强调色，覆盖 --accent 变量。
 *
 * @param settings - 用户设置
 */
/** 系统主题媒体查询对象，用于动态订阅变化 */
const systemThemeMql = window.matchMedia('(prefers-color-scheme: dark)');

/** 当前主题模式（由 applyTheme 维护） */
let currentThemeMode: 'light' | 'dark' | 'system' = 'system';

function applyTheme(settings: Settings): void {
  const root = document.documentElement;
  currentThemeMode = settings.theme;

  // 解析主题模式
  let resolvedTheme: 'dark' | 'light';
  if (settings.theme === 'system') {
    resolvedTheme = systemThemeMql.matches ? 'dark' : 'light';
  } else {
    resolvedTheme = settings.theme;
  }

  root.setAttribute('data-theme', resolvedTheme);

  // 应用自定义强调色
  if (settings.accentColor) {
    root.style.setProperty('--accent', settings.accentColor);
  }
}

// 订阅系统主题变化 — 仅当用户设置为 system 时才跟随
systemThemeMql.addEventListener('change', (e) => {
  if (currentThemeMode === 'system') {
    document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
  }
});

// 订阅用户设置变化 — 新标签页里修改主题/主题色时 popup 实时同步
try {
  onSettingsChange((newSettings) => {
    applyTheme(newSettings);
    currentSettings = newSettings;
  });
} catch {
  // 开发环境可能无 chrome API，忽略
}

// ============================================================
// 初始化
// ============================================================

/**
 * 弹窗初始化
 *
 * 流程：
 *   1. 获取当前标签页信息
 *   2. 检查是否已收藏
 *   3. 加载设置和分类列表
 *   4. 应用主题
 *   5. 渲染弹窗界面
 */
async function init(): Promise<void> {
  popupRoot = document.getElementById('popup-root');
  if (!popupRoot) return;

  // 显示加载状态
  popupRoot.innerHTML = `<div class="popup-loading">${escapeHtml(t('popup_loading'))}</div>`;

  try {
    // 并行获取所需数据
    const [tabInfo, settings, tree] = await Promise.all([
      getCurrentTab(),
      getSettings().catch((err) => {
        console.warn('[MarkPage] 获取设置失败，使用默认值:', err);
        return { ...FALLBACK_SETTINGS };
      }),
      getBookmarkTree().catch((err) => {
        console.warn('[MarkPage] 获取书签树失败，使用空列表:', err);
        return [] as chrome.bookmarks.BookmarkTreeNode[];
      }),
    ]);

    currentTabInfo = tabInfo;
    currentSettings = settings;
    currentCategories = extractCategories(tree);

    // 应用主题（确保暗色主题生效）
    applyTheme(settings);

    if (!tabInfo) {
      popupRoot.innerHTML = `<div class="popup-error">${escapeHtml(t('popup_errorNoTab'))}</div>`;
      return;
    }

    // 检查当前页面是否已收藏
    const existingBookmarks = await searchBookmarks(tabInfo.url);
    const isBookmarked = existingBookmarks.some((b) => b.url === tabInfo.url);

    // AI 已配置且未收藏：立即自动分类，无需用户再点按钮
    if (!isBookmarked && settings.ai.enabled && settings.ai.apiKey) {
      // 先显示"分析中"状态
      renderAnalyzing(tabInfo);

      try {
        const result = await classify(
          { id: 'pending', title: tabInfo.title, url: tabInfo.url },
          currentCategories,
          settings.ai,
        );
        cachedClassifyResult = result;
        renderPopup(tabInfo, false, result);
      } catch (err) {
        console.warn('[MarkPage] AI 分类失败，回退到手动收藏:', err);
        renderPopup(tabInfo, false);
      }
    } else {
      // 未收藏且无 AI：显示手动收藏；已收藏：显示已收藏状态
      renderPopup(tabInfo, isBookmarked);
    }

    // 清除 Badge
    clearBadge();
  } catch (error) {
    console.error('[MarkPage] 弹窗初始化失败:', error);
    if (popupRoot) {
      popupRoot.innerHTML = `<div class="popup-error">${escapeHtml(t('popup_errorInitFailed'))}</div>`;
    }
  }
}

// ============================================================
// 数据获取
// ============================================================

/**
 * 获取当前活动标签页信息
 *
 * @returns 当前标签页的 title 和 url
 */
async function getCurrentTab(): Promise<{ title: string; url: string } | null> {
  if (typeof chrome === 'undefined' || !chrome.tabs) {
    // 开发环境返回模拟数据
    return { title: '示例页面 - 开发环境', url: 'https://example.com' };
  }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.title && tab.url) {
      return { title: tab.title, url: tab.url };
    }
    return null;
  } catch (error) {
    console.error('[MarkPage] 获取当前标签页失败:', error);
    return null;
  }
}

// ============================================================
// UI 渲染
// ============================================================

/**
 * 渲染"AI 分析中"状态
 *
 * 收藏按钮被点击时，popup 首帧展示的加载态。
 * 带脉冲动画的分类标签占位，提示用户 AI 正在工作。
 *
 * @param tabInfo - 当前标签页信息
 */
function renderAnalyzing(tabInfo: { title: string; url: string }): void {
  if (!popupRoot) return;
  const displayUrl = tabInfo.url.replace(/^https?:\/\//, '').slice(0, 40);
  popupRoot.innerHTML = `
    <div class="popup-container">
      <div class="popup-header">
        <div class="popup-title">${escapeHtml(tabInfo.title)}</div>
        <div class="popup-url">${escapeHtml(displayUrl)}</div>
      </div>
      <div class="popup-classify-result">
        <div class="popup-classify-header">
          <span class="popup-ai-badge">${escapeHtml(t('popup_aiBadge'))}</span> ${escapeHtml(t('popup_aiAnalyzing'))}
        </div>
        <div class="popup-analyzing">
          <div class="popup-skeleton popup-skeleton--main"></div>
          <div class="popup-skeleton popup-skeleton--small"></div>
        </div>
      </div>
    </div>
  `;
}

/**
 * 渲染弹窗界面
 *
 * @param tabInfo - 当前标签页信息
 * @param isBookmarked - 是否已收藏
 * @param classifyResult - AI 分类结果（可选）
 */
function renderPopup(
  tabInfo: { title: string; url: string },
  isBookmarked: boolean,
  classifyResult?: ClassifyResult,
): void {
  if (!popupRoot) return;

  // 截取 URL 显示（去除协议前缀）
  const displayUrl = tabInfo.url.replace(/^https?:\/\//, '').slice(0, 60);

  // 分类结果模式 — 使用新布局（顶部 AI badge + 内嵌页面卡 + 文件夹卡片列表）
  if (classifyResult && !isBookmarked) {
    popupRoot.innerHTML = renderClassifyLayout(classifyResult, tabInfo, displayUrl);
    bindEvents(tabInfo, isBookmarked);
    return;
  }

  let html = `
    <div class="popup-container">
      <div class="popup-header">
        <div class="popup-title" title="${escapeHtml(tabInfo.title)}">${escapeHtml(tabInfo.title)}</div>
        <div class="popup-url" title="${escapeHtml(tabInfo.url)}">${escapeHtml(displayUrl)}</div>
      </div>
  `;

  if (isBookmarked) {
    // 已收藏状态
    html += `
      <div class="popup-status popup-status--saved">
        <span class="popup-status-icon">&#10003;</span>
        <span>${escapeHtml(t('popup_statusSaved'))}</span>
      </div>
    `;
  } else if (currentSettings?.ai.enabled && currentSettings.ai.apiKey) {
    // AI 已配置但分类失败：提供重试或直接手动收藏
    html += `
      <div class="popup-status" style="color:var(--text-3);font-size:12px">
        ${escapeHtml(t('popup_aiUnavailable'))}
      </div>
      <div class="popup-actions">
        <button class="popup-btn popup-btn--primary" id="btn-save">
          <span>&#9733;</span> ${escapeHtml(t('popup_btnSave'))}
        </button>
      </div>
      <div class="popup-folder-select">
        <label>${escapeHtml(t('popup_labelSaveTo'))}</label>
        <select id="folder-select">
          ${renderFolderOptions(currentCategories)}
        </select>
      </div>
    `;
  } else {
    // AI 未配置：显示收藏按钮和手动选择分类
    html += `
      <div class="popup-actions">
        <button class="popup-btn popup-btn--primary" id="btn-save">
          <span>&#9733;</span> ${escapeHtml(t('popup_btnSave'))}
        </button>
      </div>
      <div class="popup-folder-select">
        <label>${escapeHtml(t('popup_labelSaveTo'))}</label>
        <select id="folder-select">
          ${renderFolderOptions(currentCategories)}
        </select>
      </div>
    `;
  }

  html += '</div>';
  popupRoot.innerHTML = html;

  // 绑定事件
  bindEvents(tabInfo, isBookmarked);
}

/**
 * 渲染完整的 AI 分类布局（参考设计稿）
 *
 * 结构：
 *   - 顶部：AI 徽章 + "已为你找到最佳分类" 标题 + 关闭按钮
 *   - 中部：内嵌的页面信息卡（favicon + 标题 + URL）
 *   - 推荐列表：文件夹卡片样式（主推荐高亮边框 + 置信度）
 *   - 底部：确认 + 选择其他
 *
 * @param result - AI 分类结果
 * @param tabInfo - 当前标签页信息
 * @param displayUrl - 截短后的 URL
 * @returns HTML 字符串
 */
function renderClassifyLayout(
  result: ClassifyResult,
  tabInfo: { title: string; url: string },
  displayUrl: string,
): string {
  const mainPercent = Math.round(result.confidence * 100);
  // 取站点首字母作为 favicon 占位
  const letter = (tabInfo.title.charAt(0) || '?').toUpperCase();

  // 主推荐 + 备选合并为统一的文件夹卡片列表
  const allCats = [
    { name: result.category, confidence: result.confidence, isPrimary: true },
    ...result.alternatives.slice(0, 2).map(a => ({
      name: a.category,
      confidence: a.confidence,
      isPrimary: false,
    })),
  ];

  let folderHtml = '';
  allCats.forEach((cat, idx) => {
    const pct = Math.round(cat.confidence * 100);
    folderHtml += `
      <button class="popup-folder-card${idx === 0 ? ' active' : ''}" data-category="${escapeHtml(cat.name)}" data-idx="${idx}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        <span class="popup-folder-card-name">${escapeHtml(cat.name)}</span>
        <span class="popup-folder-card-pct">${pct}%</span>
      </button>
    `;
  });

  // 新分类建议（如有）
  let newCatHtml = '';
  if (result.newCategory) {
    newCatHtml = `
      <button class="popup-folder-card popup-folder-card--new" data-category="${escapeHtml(result.newCategory)}" data-new="1">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 5v14M5 12h14"/>
        </svg>
        <span class="popup-folder-card-name">${escapeHtml(t('popup_createNewCategory', [result.newCategory]))}</span>
      </button>
    `;
  }

  return `
    <div class="popup-container popup-classify-layout">
      <div class="popup-classify-top">
        <span class="popup-ai-badge">${escapeHtml(t('popup_aiCategoryBadge'))}</span>
        <span class="popup-classify-subtitle">${escapeHtml(t('popup_aiFoundBestCategory'))}</span>
      </div>

      <div class="popup-page-card">
        <div class="popup-page-fav">${escapeHtml(letter)}</div>
        <div class="popup-page-info">
          <div class="popup-page-title" title="${escapeHtml(tabInfo.title)}">${escapeHtml(tabInfo.title)}</div>
          <div class="popup-page-url">${escapeHtml(displayUrl)}</div>
        </div>
      </div>

      <div class="popup-folder-cards">
        ${folderHtml}
        ${newCatHtml}
      </div>

      <div class="popup-classify-actions">
        <button class="popup-btn popup-btn--primary" id="btn-confirm" data-category="${escapeHtml(result.category)}">${escapeHtml(t('popup_confirmWithPercent', [String(mainPercent)]))}</button>
        <button class="popup-btn popup-btn--secondary" id="btn-other">${escapeHtml(t('popup_selectOther'))}</button>
      </div>
    </div>
  `;
}

/**
 * 渲染 AI 分类结果区域（旧版，保留备用）
 *
 * @param result - 分类结果
 * @param tabInfo - 当前标签页信息
 * @returns HTML 字符串
 */
function renderClassifyResult(
  result: ClassifyResult,
  tabInfo: { title: string; url: string },
): string {
  const confidencePercent = Math.round(result.confidence * 100);

  let html = `
    <div class="popup-classify-result">
      <div class="popup-classify-header">${escapeHtml(t('popup_aiSuggestion'))}</div>
      <div class="popup-classify-main">
        <span class="popup-classify-category">${escapeHtml(result.category)}</span>
        <span class="popup-classify-confidence">${confidencePercent}%</span>
      </div>
  `;

  // 备选分类
  if (result.alternatives.length > 0) {
    html += `<div class="popup-classify-alts"><span>${escapeHtml(t('popup_alternatives'))}</span>`;
    result.alternatives.forEach((alt) => {
      html += `<button class="popup-alt-btn" data-category="${escapeHtml(alt.category)}">${escapeHtml(alt.category)}</button>`;
    });
    html += '</div>';
  }

  // 新分类建议
  if (result.newCategory) {
    html += `<div class="popup-classify-new">${escapeHtml(t('popup_suggestNewCategory'))}<strong>${escapeHtml(result.newCategory)}</strong></div>`;
  }

  html += `
      <div class="popup-classify-actions">
        <button class="popup-btn popup-btn--primary" id="btn-confirm" data-category="${escapeHtml(result.category)}">${escapeHtml(t('popup_confirm'))}</button>
        <button class="popup-btn popup-btn--secondary" id="btn-other">${escapeHtml(t('popup_selectOther'))}</button>
      </div>
    </div>
  `;

  return html;
}

/**
 * 渲染文件夹选择下拉框选项
 *
 * @param categories - 分类列表
 * @param indent - 缩进层级
 * @returns HTML 选项字符串
 */
function renderFolderOptions(categories: Category[], indent: number = 0): string {
  let html = '';
  const prefix = '\u00A0\u00A0'.repeat(indent);

  for (const cat of categories) {
    html += `<option value="${cat.id}">${prefix}${escapeHtml(cat.name)}</option>`;
    if (cat.children) {
      html += renderFolderOptions(cat.children, indent + 1);
    }
  }

  return html;
}

// ============================================================
// 事件绑定
// ============================================================

/**
 * 绑定弹窗内的交互事件
 *
 * @param tabInfo - 当前标签页信息
 * @param isBookmarked - 是否已收藏
 */
function bindEvents(
  tabInfo: { title: string; url: string },
  isBookmarked: boolean,
): void {
  // "收藏并分类"按钮
  const btnClassify = document.getElementById('btn-classify');
  btnClassify?.addEventListener('click', () => handleClassifyAndSave(tabInfo));

  // "仅收藏"按钮
  const btnSaveOnly = document.getElementById('btn-save-only');
  btnSaveOnly?.addEventListener('click', () => handleSaveOnly(tabInfo));

  // "收藏"按钮（无 AI 模式）
  const btnSave = document.getElementById('btn-save');
  btnSave?.addEventListener('click', () => handleSaveWithFolder(tabInfo));

  // "确认分类"按钮
  const btnConfirm = document.getElementById('btn-confirm');
  btnConfirm?.addEventListener('click', (e) => {
    const category = (e.target as HTMLElement).getAttribute('data-category') ?? '';
    handleConfirmClassify(tabInfo, category);
  });

  // "选择其他"按钮
  const btnOther = document.getElementById('btn-other');
  btnOther?.addEventListener('click', () => handleSelectOther(tabInfo));

  // 备选分类按钮（旧版胶囊式）
  const altBtns = document.querySelectorAll('.popup-alt-btn');
  altBtns.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const category = (e.target as HTMLElement).getAttribute('data-category') ?? '';
      handleConfirmClassify(tabInfo, category);
    });
  });

  // 分类卡片点击 — 切换选中态，更新"确认分类"按钮目标
  const folderCards = document.querySelectorAll('.popup-folder-card');
  folderCards.forEach((card) => {
    card.addEventListener('click', () => {
      // 更新选中态
      folderCards.forEach((c) => c.classList.remove('active'));
      card.classList.add('active');

      // 更新确认按钮的 data-category
      const category = card.getAttribute('data-category') ?? '';
      const pct = card.querySelector('.popup-folder-card-pct')?.textContent || '';
      const confirmBtn = document.getElementById('btn-confirm');
      if (confirmBtn) {
        confirmBtn.setAttribute('data-category', category);
        confirmBtn.textContent = pct ? t('popup_confirmWithPct', [pct]) : t('popup_confirm');
      }
    });
  });
}

// ============================================================
// 操作处理
// ============================================================

/**
 * 处理"收藏并分类"操作
 *
 * @param tabInfo - 当前标签页信息
 */
async function handleClassifyAndSave(tabInfo: { title: string; url: string }): Promise<void> {
  if (!popupRoot || !currentSettings) return;

  // 显示加载状态
  const btn = document.getElementById('btn-classify') as HTMLButtonElement | null;
  if (btn) {
    btn.disabled = true;
    btn.textContent = t('popup_analyzing');
  }

  try {
    // 先创建书签
    const newBookmark = await createBookmark(tabInfo.title, tabInfo.url);

    // 调用 AI 分类
    const result = await classify(
      { id: newBookmark.id, title: tabInfo.title, url: tabInfo.url },
      currentCategories,
      currentSettings.ai,
    );

    // 显示分类结果
    renderPopup(tabInfo, true, result);
  } catch (error) {
    console.error('[MarkPage] 收藏并分类失败:', error);
    if (btn) {
      btn.disabled = false;
      btn.textContent = t('popup_classifyRetry');
    }
  }
}

/**
 * 处理"仅收藏"操作
 *
 * @param tabInfo - 当前标签页信息
 */
async function handleSaveOnly(tabInfo: { title: string; url: string }): Promise<void> {
  try {
    await createBookmark(tabInfo.title, tabInfo.url);
    renderPopup(tabInfo, true);
  } catch (error) {
    console.error('[MarkPage] 收藏失败:', error);
  }
}

/**
 * 处理"收藏到指定文件夹"操作
 *
 * @param tabInfo - 当前标签页信息
 */
async function handleSaveWithFolder(tabInfo: { title: string; url: string }): Promise<void> {
  const folderSelect = document.getElementById('folder-select') as HTMLSelectElement | null;
  const parentId = folderSelect?.value;

  try {
    await createBookmark(tabInfo.title, tabInfo.url, parentId);
    renderPopup(tabInfo, true);
  } catch (error) {
    console.error('[MarkPage] 收藏到文件夹失败:', error);
  }
}

/**
 * 处理"确认分类"操作
 *
 * @param tabInfo - 当前标签页信息
 * @param category - 确认的分类名称
 */
async function handleConfirmClassify(
  tabInfo: { title: string; url: string },
  category: string,
): Promise<void> {
  try {
    // 1. 确定目标文件夹 ID（不存在则创建新文件夹）
    let targetFolder = currentCategories.find((c) => c.name === category);
    let targetFolderId: string;

    if (targetFolder) {
      targetFolderId = targetFolder.id;
    } else {
      const newFolder = await createFolder(category);
      targetFolderId = newFolder.id;
    }

    // 2. 检查是否已经收藏 — 已收藏则移动，未收藏则创建到目标文件夹
    const existing = await searchBookmarks(tabInfo.url);
    const bookmark = existing.find((b) => b.url === tabInfo.url);

    let finalBookmark;
    if (bookmark) {
      // 已收藏：移动到目标分类
      await moveBookmark(bookmark.id, targetFolderId);
      finalBookmark = bookmark;
    } else {
      // 未收藏：直接在目标分类下创建
      const created = await createBookmark(tabInfo.title, tabInfo.url, targetFolderId);
      finalBookmark = {
        id: created.id,
        title: created.title,
        url: created.url || tabInfo.url,
      };
    }

    // 3. 保存分类历史（供 AI 后续学习）
    await saveClassifyHistory(finalBookmark, category);

    // 4. 显示成功状态
    if (popupRoot) {
      popupRoot.innerHTML = `
        <div class="popup-container">
          <div class="popup-status popup-status--saved">
            <span class="popup-status-icon">&#10003;</span>
            <span>${escapeHtml(t('popup_savedToCategory', [category]))}</span>
          </div>
        </div>
      `;
    }

    // 5. 500ms 后自动关闭弹窗（让 Chrome 的星星图标动画更新）
    setTimeout(() => {
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        window.close();
      }
    }, 600);
  } catch (error) {
    console.error('[MarkPage] 确认分类失败:', error);
    if (popupRoot) {
      popupRoot.innerHTML = `
        <div class="popup-container">
          <div class="popup-error">${escapeHtml(t('popup_saveFailed', [(error as Error).message || t('popup_unknownError')]))}</div>
        </div>
      `;
    }
  }
}

/**
 * 处理"选择其他分类"操作
 *
 * 显示分类选择下拉框
 *
 * @param tabInfo - 当前标签页信息
 */
function handleSelectOther(tabInfo: { title: string; url: string }): void {
  if (!popupRoot) return;

  // 递归构建分类列表 HTML
  function renderFolderItems(cats: Category[], level = 0): string {
    return cats.map(cat => {
      const indentClass = level === 1 ? ' popup-folder-indent' : level >= 2 ? ' popup-folder-indent-2' : '';
      let html = `
        <button class="popup-folder-item${indentClass}" data-cat-name="${escapeHtml(cat.name)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          <span>${escapeHtml(cat.name)}</span>
        </button>
      `;
      if (cat.children && cat.children.length > 0) {
        html += renderFolderItems(cat.children, level + 1);
      }
      return html;
    }).join('');
  }

  popupRoot.innerHTML = `
    <div class="popup-container">
      <div class="popup-header">
        <div class="popup-title">${escapeHtml(t('popup_chooseCategory'))}</div>
        <div class="popup-url">${escapeHtml(tabInfo.title)}</div>
      </div>
      <div class="popup-folder-list" id="folder-list-other">
        ${renderFolderItems(currentCategories)}
      </div>
      <div class="popup-new-folder">
        <input id="new-folder-name" type="text" placeholder="${escapeHtml(t('popup_newCategoryPlaceholder'))}" />
        <button class="popup-btn popup-btn--small popup-btn--primary" id="btn-new-folder">${escapeHtml(t('popup_createBtn'))}</button>
      </div>
      <div class="popup-actions">
        <button class="popup-btn popup-btn--secondary" id="btn-back">${escapeHtml(t('popup_back'))}</button>
      </div>
    </div>
  `;

  // 绑定分类列表项点击（直接确认）
  popupRoot.querySelectorAll('.popup-folder-item').forEach(item => {
    item.addEventListener('click', () => {
      const catName = item.getAttribute('data-cat-name');
      if (catName) handleConfirmClassify(tabInfo, catName);
    });
  });

  // 返回按钮 — 回到 AI 分类建议页（如果有）或未收藏状态
  document.getElementById('btn-back')?.addEventListener('click', () => {
    renderPopup(tabInfo, false, cachedClassifyResult || undefined);
  });

  // 创建新分类并归类
  const newFolderInput = document.getElementById('new-folder-name') as HTMLInputElement | null;
  const createNew = async () => {
    const name = newFolderInput?.value.trim();
    if (name) await handleConfirmClassify(tabInfo, name);
  };
  document.getElementById('btn-new-folder')?.addEventListener('click', createNew);
  newFolderInput?.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') createNew();
  });
}

// ============================================================
// 工具函数
// ============================================================

/**
 * HTML 转义，防止 XSS
 *
 * @param text - 原始文本
 * @returns 转义后的安全文本
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 清除扩展图标上的 Badge
 */
function clearBadge(): void {
  try {
    if (typeof chrome !== 'undefined' && chrome.action) {
      chrome.action.setBadgeText({ text: '' });
    }
  } catch {
    // 静默处理
  }
}

// ============================================================
// 启动
// ============================================================

document.addEventListener('DOMContentLoaded', init);
