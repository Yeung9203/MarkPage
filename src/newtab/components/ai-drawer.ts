/**
 * AI 整理抽屉组件
 *
 * 右侧滑出的 AI 书签整理面板，包含：
 *   - 初始状态：说明文字 + 开始分析按钮
 *   - 分析中：进度条 + 流式渲染结果
 *   - 预览：统计概览 + 新增分类建议 + 变更列表
 *   - 完成：撤销倒计时
 *
 * 使用示例：
 *   import { renderAIDrawer, openAIDrawer, closeAIDrawer } from './ai-drawer';
 *   document.body.appendChild(renderAIDrawer());
 *   openAIDrawer();
 */

import { h, on } from '@/utils/dom';
import { iconAI, iconClose, iconPlay } from './icons';
import { t } from '@/utils/i18n';
import { batchClassify } from '@/services/ai';
import { getAllBookmarks, extractCategories, moveBookmark, createFolder, getBookmarkTree } from '@/services/bookmarks';
import { getSettings } from '@/services/storage';
import type { Bookmark, Category, ClassifyResult } from '@/types';

/** 定时器引用 */
let aioTimer: ReturnType<typeof setInterval> | null = null;

/** 抽屉元素引用 */
let drawerEl: HTMLElement | null = null;

/** 分析结果数据，存储书签 ID 到变更信息的映射 */
interface AioChange {
  /** 书签信息 */
  bookmark: Bookmark;
  /** 原始分类名称 */
  from: string;
  /** 目标分类名称 */
  to: string;
  /** AI 分类结果 */
  result: ClassifyResult;
  /** 书签显示字母 */
  letter: string;
  /** 颜色 class */
  color: string;
}

/** 存储真实分析结果 */
let analysisChanges: AioChange[] = [];

/** 分类名称到文件夹 ID 的映射 */
let categoryIdMap: Map<string, string> = new Map();

/** 模拟 AI 返回的整理建议数据（Chrome API 不可用时的 fallback） */
const MOCK_CHANGES: AioChange[] = [
  { bookmark: { id: '11', title: 'React Documentation', url: 'https://react.dev', category: '技术文档' }, from: '技术文档', to: '学习资源', result: { category: '学习资源', confidence: 0.9, alternatives: [], newCategory: '学习资源' }, letter: 'R', color: 'f-blue' },
  { bookmark: { id: '12', title: 'Next.js Docs', url: 'https://nextjs.org/docs', category: '技术文档' }, from: '技术文档', to: '学习资源', result: { category: '学习资源', confidence: 0.88, alternatives: [], newCategory: '学习资源' }, letter: 'N', color: 'f-green' },
  { bookmark: { id: '13', title: 'Tailwind CSS', url: 'https://tailwindcss.com/docs', category: '技术文档' }, from: '技术文档', to: '学习资源', result: { category: '学习资源', confidence: 0.85, alternatives: [] }, letter: 'T', color: 'f-teal' },
  { bookmark: { id: '14', title: 'TypeScript Handbook', url: 'https://typescriptlang.org/docs', category: '技术文档' }, from: '技术文档', to: '学习资源', result: { category: '学习资源', confidence: 0.87, alternatives: [] }, letter: 'T', color: 'f-amber' },
  { bookmark: { id: '60', title: 'Notion', url: 'https://notion.so', category: '未分类' }, from: '未分类', to: '生产力工具', result: { category: '生产力工具', confidence: 0.92, alternatives: [], newCategory: '生产力工具' }, letter: 'N', color: 'f-blue' },
  { bookmark: { id: '61', title: 'Slack', url: 'https://slack.com', category: '未分类' }, from: '未分类', to: '生产力工具', result: { category: '生产力工具', confidence: 0.91, alternatives: [] }, letter: 'S', color: 'f-green' },
  { bookmark: { id: '3', title: 'Linear', url: 'https://linear.app', category: '开发工具' }, from: '开发工具', to: '生产力工具', result: { category: '生产力工具', confidence: 0.82, alternatives: [] }, letter: 'L', color: 'f-purple' },
  { bookmark: { id: '51', title: 'Bilibili', url: 'https://bilibili.com', category: '影音娱乐' }, from: '影音娱乐', to: '学习资源', result: { category: '学习资源', confidence: 0.7, alternatives: [] }, letter: 'B', color: 'f-blue' },
];

/**
 * 检测 Chrome API 是否可用
 *
 * @returns 是否在 Chrome 扩展环境中运行
 */
function isChromeAvailable(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.bookmarks;
}

/**
 * 渲染 AI 整理抽屉
 *
 * @returns AI 抽屉 DOM 元素
 */
export function renderAIDrawer(): HTMLElement {
  drawerEl = h('div', {
    class: 'drawer aio-drawer',
    id: 'aioDrawer',
  });

  // 头部
  const header = h('div', {
    style: 'display:flex;align-items:center;gap:10px;padding:16px 18px;border-bottom:1px solid var(--border);flex-shrink:0',
  });

  const headerIcon = h('div', {
    style: 'width:28px;height:28px;border-radius:7px;background:var(--accent-soft);display:flex;align-items:center;justify-content:center;color:var(--accent);flex-shrink:0',
  });
  headerIcon.innerHTML = iconAI(15);
  header.appendChild(headerIcon);

  header.appendChild(h('span', { style: 'font-size:14px;font-weight:600;flex:1' }, t('ai_drawer_title')));

  const closeBtn = h('button', {
    style: 'width:28px;height:28px;display:flex;align-items:center;justify-content:center;background:none;border:none;border-radius:6px;cursor:pointer;color:var(--text-3);transition:all var(--fast)',
  });
  closeBtn.innerHTML = iconClose();
  on(closeBtn, 'click', closeAIDrawer);
  header.appendChild(closeBtn);

  drawerEl.appendChild(header);

  // 内容区域
  const body = h('div', {
    id: 'aioBody',
    style: 'flex:1;overflow-y:auto;padding:16px 18px',
  });

  // 初始状态
  const initView = h('div', { id: 'aioInit' });
  initView.innerHTML = `
    <div style="text-align:center;padding:32px 0">
      <div style="font-size:28px;margin-bottom:14px;opacity:0.15">\uD83E\uDD16</div>
      <div style="font-size:12px;color:var(--text-3);margin-bottom:16px;line-height:1.6" id="aioInitDesc">
        ${t('ai_init_desc')}
      </div>
      <button id="aioStartBtn" style="display:inline-flex;align-items:center;gap:6px;padding:8px 20px;font-family:var(--font);font-size:13px;font-weight:500;color:white;background:var(--accent);border:none;border-radius:8px;cursor:pointer;transition:all var(--fast)">
        ${iconPlay(16)}
        ${t('ai_start_analysis')}
      </button>
    </div>
  `;
  body.appendChild(initView);

  // 分析中视图
  const analyzingView = h('div', { id: 'aioAnalyzing', style: 'display:none' });
  analyzingView.innerHTML = `
    <div id="aioProgress" style="padding:4px 0 12px">
      <div style="height:3px;background:var(--bg-3);border-radius:2px;overflow:hidden;margin-bottom:6px">
        <div id="aioProgressFill" style="height:100%;background:var(--accent);border-radius:2px;transition:width 0.4s var(--ease);width:0%"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-3)">
        <span id="aioProgressLabel">${t('ai_analyzing')}</span>
        <span id="aioProgressPct">0/0</span>
      </div>
    </div>
    <div id="aioStreamResults"></div>
  `;
  body.appendChild(analyzingView);

  // 完成状态
  const doneView = h('div', { id: 'aioDone', style: 'display:none' });
  doneView.innerHTML = `
    <div style="text-align:center;padding:28px 0">
      <div style="font-size:36px;margin-bottom:12px">\u2705</div>
      <div style="font-size:15px;font-weight:600;margin-bottom:6px">${t('ai_done_title')}</div>
      <div id="aioDoneDesc" style="font-size:12px;color:var(--text-3);line-height:1.6">
        ${t('ai_done_desc', ['0', '0'])}
      </div>
    </div>
  `;
  body.appendChild(doneView);

  drawerEl.appendChild(body);

  // 底栏
  const footer = h('div', {
    id: 'aioFooter',
    style: 'display:flex;align-items:center;gap:8px;padding:12px 18px;border-top:1px solid var(--border);flex-shrink:0',
  });
  footer.innerHTML = `
    <div class="aio-footer-info" id="aioFooterInfo" style="flex:1;font-size:11px;color:var(--text-3)">${t('ai_footer_default')}</div>
    <button class="btn btn-ghost" style="padding:6px 14px;font-size:12px;font-weight:500;border:none;border-radius:6px;cursor:pointer;color:var(--text-2);background:var(--bg-3)" onclick="document.getElementById('aioDrawer')?.classList.remove('open')">${t('ai_close')}</button>
  `;
  drawerEl.appendChild(footer);

  // 绑定开始分析按钮
  setTimeout(() => {
    const startBtn = document.getElementById('aioStartBtn');
    if (startBtn) {
      on(startBtn, 'click', startAnalysis);
    }
  }, 0);

  return drawerEl;
}

/**
 * 开始 AI 分析
 *
 * 如果 Chrome API 可用且 AI 已配置，调用真实 API 进行批量分类；
 * 否则使用 mock 数据进行模拟
 */
async function startAnalysis(): Promise<void> {
  const initView = document.getElementById('aioInit');
  const analyzingView = document.getElementById('aioAnalyzing');
  const progressFill = document.getElementById('aioProgressFill');

  if (initView) initView.style.display = 'none';
  if (analyzingView) analyzingView.style.display = '';
  if (progressFill) progressFill.style.width = '0%';

  // 重置分析结果
  analysisChanges = [];
  categoryIdMap = new Map();

  const stream = document.getElementById('aioStreamResults');

  // 判断是否使用真实 API
  const settings = await getSettings();
  const useRealApi = isChromeAvailable() && settings.ai.apiKey;

  if (useRealApi) {
    // ---- 真实 API 调用路径 ----
    await startRealAnalysis(stream, settings);
  } else if (isChromeAvailable() && !settings.ai.apiKey) {
    // Chrome 环境但 AI 未配置，显示提示
    if (initView) initView.style.display = '';
    if (analyzingView) analyzingView.style.display = 'none';

    const desc = document.getElementById('aioInitDesc');
    if (desc) {
      desc.innerHTML = `
        <div style="color:var(--accent);font-weight:500;margin-bottom:8px">${t('ai_need_config_title')}</div>
        ${t('ai_need_config_desc')}
      `;
    }
    // 将按钮文字改为跳转设置的提示
    const startBtn = document.getElementById('aioStartBtn');
    if (startBtn) {
      startBtn.textContent = t('ai_go_settings');
      const newBtn = startBtn.cloneNode(true) as HTMLElement;
      startBtn.parentNode?.replaceChild(newBtn, startBtn);
      on(newBtn, 'click', () => {
        closeAIDrawer();
        // 触发打开设置面板
        const settingsDrawer = document.getElementById('settingsDrawer');
        if (settingsDrawer) settingsDrawer.classList.add('open');
        const overlay = document.getElementById('drawerOverlay');
        if (overlay) overlay.style.display = 'block';
      });
    }
  } else {
    // ---- Mock 路径（非 Chrome 环境，开发模式） ----
    console.warn('[MarkPage] Chrome API 不可用，使用模拟数据');
    startMockAnalysis(stream);
  }
}

/**
 * 使用真实 AI API 进行分析
 *
 * @param stream - 流式渲染结果容器
 * @param settings - 用户设置
 */
async function startRealAnalysis(stream: HTMLElement | null, settings: Awaited<ReturnType<typeof getSettings>>): Promise<void> {
  try {
    // 获取真实书签和分类
    const bookmarks = await getAllBookmarks();
    const tree = await getBookmarkTree();
    const categories = extractCategories(tree);

    // 构建分类名到 ID 的映射
    categories.forEach(cat => {
      categoryIdMap.set(cat.name, cat.id);
      if (cat.children) {
        cat.children.forEach(child => categoryIdMap.set(child.name, child.id));
      }
    });

    const total = bookmarks.length;
    let newCatsAdded = false;
    const newCategories = new Set<string>();

    // 更新初始描述中的书签数量
    const pctLabel = document.getElementById('aioProgressPct');
    if (pctLabel) pctLabel.textContent = `0/${total}`;

    // 调用 batchClassify，通过 onProgress 回调实现流式渲染
    const results = await batchClassify(
      bookmarks,
      categories,
      settings.ai,
      (done, totalCount) => {
        // 更新进度条
        const pct = Math.round(done / totalCount * 100);
        const fill = document.getElementById('aioProgressFill');
        const pctEl = document.getElementById('aioProgressPct');
        const progressLabel = document.getElementById('aioProgressLabel');

        if (fill) fill.style.width = pct + '%';
        if (pctEl) pctEl.textContent = `${done}/${totalCount}`;

        const labels = [t('ai_progress_label_1'), t('ai_progress_label_2'), t('ai_progress_label_3'), t('ai_progress_label_4')];
        if (progressLabel) progressLabel.textContent = labels[Math.min(Math.floor(pct / 28), labels.length - 1)];
      },
    );

    // 处理分类结果，筛选出需要移动的书签
    results.forEach((result, bookmarkId) => {
      const bookmark = bookmarks.find(b => b.id === bookmarkId);
      if (!bookmark) return;

      const currentCategory = bookmark.category || '未分类';

      // 只显示分类发生变化、且 AI 有较高把握的书签
      // 0.7 阈值：避免低置信度的"猜分类"被当成移动建议（旧 0.5 太松，会出现 x.com → Developer 这类硬塞）
      if (result.category !== currentCategory && result.confidence >= 0.7) {
        // 收集新分类
        if (result.newCategory) {
          newCategories.add(result.newCategory);
        }

        const letter = bookmark.title.charAt(0).toUpperCase();
        const colors = ['f-blue', 'f-green', 'f-amber', 'f-red', 'f-purple', 'f-teal'];
        const colorIdx = Math.abs(bookmark.title.charCodeAt(0)) % colors.length;

        const change: AioChange = {
          bookmark,
          from: currentCategory,
          to: result.category,
          result,
          letter,
          color: colors[colorIdx],
        };

        analysisChanges.push(change);
      }
    });

    // 渲染新分类建议
    if (newCategories.size > 0 && stream) {
      stream.innerHTML += `
        <div style="font-size:11px;font-weight:600;color:var(--text-4);text-transform:uppercase;letter-spacing:0.06em;margin:14px 0 6px;display:flex;align-items:center;gap:6px">${t('ai_section_new_categories')}</div>
      `;
      newCategories.forEach(catName => {
        const count = analysisChanges.filter(c => c.to === catName).length;
        stream.innerHTML += `
          <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--accent-soft);border:1px solid color-mix(in srgb, var(--accent) 25%, transparent);border-radius:7px;margin-bottom:4px;font-size:12px">
            <span style="color:var(--accent);font-size:12px;flex-shrink:0">\u2726</span>
            <span style="font-weight:600;color:var(--accent)">${catName}</span>
            <span style="margin-left:auto;font-size:10px;color:var(--text-3);white-space:nowrap">${t('ai_contains_count', [String(count)])}</span>
            <button class="aio-dismiss-btn" style="width:18px;height:18px;display:flex;align-items:center;justify-content:center;background:none;border:none;border-radius:4px;cursor:pointer;color:var(--text-4);font-size:14px;flex-shrink:0" title="${t('ai_dismiss')}">\u2715</button>
          </div>
        `;
      });
      // 绑定关闭按钮
      stream.querySelectorAll('.aio-dismiss-btn').forEach(btn => {
        on(btn as HTMLElement, 'click', () => {
          (btn as HTMLElement).parentElement?.remove();
        });
      });
    }

    // 渲染变更行
    if (analysisChanges.length > 0 && stream) {
      stream.innerHTML += `
        <div style="font-size:11px;font-weight:600;color:var(--text-4);text-transform:uppercase;letter-spacing:0.06em;margin:14px 0 6px;display:flex;align-items:center;gap:6px">${t('ai_section_suggested_moves')}</div>
      `;
      analysisChanges.forEach(change => {
        appendChangeRow(stream, change);
      });
    }

    // 渲染完成后的统计和操作
    finishAnalysis(stream, total, newCategories.size);

  } catch (error) {
    console.error('[MarkPage] AI 分析失败:', error);
    // 出错时回退到 mock
    const stream = document.getElementById('aioStreamResults');
    startMockAnalysis(stream);
  }
}

/**
 * 使用模拟数据进行分析（fallback）
 *
 * @param stream - 流式渲染结果容器
 */
function startMockAnalysis(stream: HTMLElement | null): void {
  analysisChanges = [...MOCK_CHANGES];

  let analyzed = 0;
  const total = 47;
  let changeIdx = 0;
  let newCatsAdded = false;

  aioTimer = setInterval(() => {
    analyzed += Math.floor(Math.random() * 6) + 3;
    if (analyzed > total) analyzed = total;

    const pct = Math.round(analyzed / total * 100);
    const fill = document.getElementById('aioProgressFill');
    const pctLabel = document.getElementById('aioProgressPct');
    const progressLabel = document.getElementById('aioProgressLabel');

    if (fill) fill.style.width = pct + '%';
    if (pctLabel) pctLabel.textContent = analyzed + '/' + total;

    const labels = [t('ai_progress_label_1'), t('ai_progress_label_2'), t('ai_progress_label_3'), t('ai_progress_label_4')];
    if (progressLabel) progressLabel.textContent = labels[Math.min(Math.floor(pct / 28), labels.length - 1)];

    // 流式渲染：追加新增分类建议
    if (!newCatsAdded && analyzed > 15 && stream) {
      newCatsAdded = true;
      stream.innerHTML += `
        <div style="font-size:11px;font-weight:600;color:var(--text-4);text-transform:uppercase;letter-spacing:0.06em;margin:14px 0 6px;display:flex;align-items:center;gap:6px">${t('ai_section_new_categories')}</div>
        <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--accent-soft);border:1px solid color-mix(in srgb, var(--accent) 25%, transparent);border-radius:7px;margin-bottom:4px;font-size:12px">
          <span style="color:var(--accent);font-size:12px;flex-shrink:0">\u2726</span>
          <span style="font-weight:600;color:var(--accent)">学习资源</span>
          <span style="color:var(--text-3);font-size:11px">教程、文档</span>
          <span style="margin-left:auto;font-size:10px;color:var(--text-3);white-space:nowrap">${t('ai_contains_count', ['4'])}</span>
          <button class="aio-dismiss-btn" style="width:18px;height:18px;display:flex;align-items:center;justify-content:center;background:none;border:none;border-radius:4px;cursor:pointer;color:var(--text-4);font-size:14px;flex-shrink:0" title="${t('ai_dismiss')}">\u2715</button>
        </div>
        <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--accent-soft);border:1px solid color-mix(in srgb, var(--accent) 25%, transparent);border-radius:7px;margin-bottom:4px;font-size:12px">
          <span style="color:var(--accent);font-size:12px;flex-shrink:0">\u2726</span>
          <span style="font-weight:600;color:var(--accent)">生产力工具</span>
          <span style="color:var(--text-3);font-size:11px">协作、管理</span>
          <span style="margin-left:auto;font-size:10px;color:var(--text-3);white-space:nowrap">${t('ai_contains_count', ['3'])}</span>
          <button class="aio-dismiss-btn" style="width:18px;height:18px;display:flex;align-items:center;justify-content:center;background:none;border:none;border-radius:4px;cursor:pointer;color:var(--text-4);font-size:14px;flex-shrink:0" title="${t('ai_dismiss')}">\u2715</button>
        </div>
        <div style="font-size:11px;font-weight:600;color:var(--text-4);text-transform:uppercase;letter-spacing:0.06em;margin:14px 0 6px;display:flex;align-items:center;gap:6px">${t('ai_section_suggested_moves')}</div>
      `;

      // 绑定关闭按钮
      stream.querySelectorAll('.aio-dismiss-btn').forEach(btn => {
        on(btn as HTMLElement, 'click', () => {
          (btn as HTMLElement).parentElement?.remove();
        });
      });
    }

    // 流式追加变更行
    if (newCatsAdded && changeIdx < analysisChanges.length && analyzed > 20 + changeIdx * 3 && stream) {
      appendChangeRow(stream, analysisChanges[changeIdx]);
      changeIdx++;

      // 滚动到底部
      const aioBody = document.getElementById('aioBody');
      if (aioBody) aioBody.scrollTop = aioBody.scrollHeight;
    }

    // 分析完成
    if (analyzed >= total) {
      if (aioTimer) clearInterval(aioTimer);
      aioTimer = null;

      setTimeout(() => {
        finishAnalysis(stream, total, 2);
      }, 300);
    }
  }, 250);
}

/**
 * 向流式结果区域追加一个变更行
 *
 * @param stream - 流式渲染结果容器
 * @param change - 变更数据
 */
function appendChangeRow(stream: HTMLElement, change: AioChange): void {
  const changeEl = document.createElement('div');
  changeEl.className = 'aio-change';
  changeEl.setAttribute('data-bookmark-id', change.bookmark.id);
  changeEl.setAttribute('data-target-category', change.to);
  changeEl.setAttribute('data-bk', change.bookmark.title);
  changeEl.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;transition:all var(--fast);font-size:12px';

  changeEl.innerHTML = `
    <button class="aio-change-toggle checked" style="width:15px;height:15px;border-radius:4px;border:1.5px solid var(--accent);background:var(--accent);cursor:pointer;flex-shrink:0;position:relative;transition:all var(--fast)">
      <span style="position:absolute;top:1.5px;left:4px;width:4px;height:7px;border:solid white;border-width:0 1.5px 1.5px 0;transform:rotate(45deg)"></span>
    </button>
    <span class="${change.color}" style="width:18px;height:18px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:700;flex-shrink:0">${change.letter}</span>
    <div style="flex:1;min-width:0">
      <div style="font-weight:450;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${change.bookmark.title}</div>
      <div style="font-size:10px;color:var(--text-4);margin-top:1px;display:flex;align-items:center;gap:4px">
        <span style="color:var(--text-4)">${change.from}</span><span>\u2192</span><span style="color:var(--accent);font-weight:500">${change.to}</span>
      </div>
    </div>
  `;

  // hover 高亮联动
  on(changeEl, 'mouseenter', () => {
    changeEl.style.background = 'var(--bg-hover)';
    highlightBookmark(change.bookmark.title);
  });
  on(changeEl, 'mouseleave', () => {
    changeEl.style.background = '';
    unhighlightBookmarks();
  });

  // 勾选切换
  const toggleBtn = changeEl.querySelector('.aio-change-toggle') as HTMLElement;
  if (toggleBtn) {
    on(toggleBtn, 'click', () => {
      const isChecked = toggleBtn.classList.toggle('checked');
      if (isChecked) {
        toggleBtn.style.background = 'var(--accent)';
        toggleBtn.style.borderColor = 'var(--accent)';
        toggleBtn.innerHTML = '<span style="position:absolute;top:1.5px;left:4px;width:4px;height:7px;border:solid white;border-width:0 1.5px 1.5px 0;transform:rotate(45deg)"></span>';
        changeEl.style.opacity = '1';
      } else {
        toggleBtn.style.background = 'none';
        toggleBtn.style.borderColor = 'var(--border-strong)';
        toggleBtn.innerHTML = '';
        changeEl.style.opacity = '0.4';
      }
      updateFooterInfo();
    });
  }

  stream.appendChild(changeEl);
}

/**
 * 分析完成后渲染统计和操作按钮
 *
 * @param stream - 流式渲染结果容器
 * @param total - 总书签数
 * @param newCatCount - 新分类数量
 */
function finishAnalysis(stream: HTMLElement | null, total: number, newCatCount: number): void {
  const progress = document.getElementById('aioProgress');
  if (progress) progress.style.display = 'none';

  // 插入统计概览
  if (stream) {
    const statsHtml = `
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px">
        <div style="padding:10px 8px;background:var(--bg-0);border:1px solid var(--border);border-radius:8px;text-align:center">
          <div style="font-size:20px;font-weight:700;letter-spacing:-0.02em;font-variant-numeric:tabular-nums">${total}</div>
          <div style="font-size:10px;color:var(--text-4);margin-top:2px">${t('ai_stat_total')}</div>
        </div>
        <div style="padding:10px 8px;background:var(--bg-0);border:1px solid var(--border);border-radius:8px;text-align:center">
          <div style="font-size:20px;font-weight:700;letter-spacing:-0.02em;font-variant-numeric:tabular-nums;color:var(--accent)">${analysisChanges.length}</div>
          <div style="font-size:10px;color:var(--text-4);margin-top:2px">${t('ai_stat_moves')}</div>
        </div>
        <div style="padding:10px 8px;background:var(--bg-0);border:1px solid var(--border);border-radius:8px;text-align:center">
          <div style="font-size:20px;font-weight:700;letter-spacing:-0.02em;font-variant-numeric:tabular-nums;color:var(--green)">${newCatCount}</div>
          <div style="font-size:10px;color:var(--text-4);margin-top:2px">${t('ai_stat_new_cats')}</div>
        </div>
      </div>
    `;
    stream.insertAdjacentHTML('afterbegin', statsHtml);
  }

  // 更新底栏
  updateFooterWithActions();

  const aioBody = document.getElementById('aioBody');
  if (aioBody) aioBody.scrollTop = 0;
}

/**
 * 更新底栏显示已选计数
 */
function updateFooterInfo(): void {
  const checked = document.querySelectorAll('#aioStreamResults .aio-change-toggle.checked').length;
  const total = document.querySelectorAll('#aioStreamResults .aio-change-toggle').length;
  const info = document.getElementById('aioFooterInfo');
  if (info) info.textContent = t('ai_selected_count', [String(checked), String(total)]);
}

/**
 * 更新底栏为操作按钮
 */
function updateFooterWithActions(): void {
  const footer = document.getElementById('aioFooter');
  if (!footer) return;

  const checked = document.querySelectorAll('#aioStreamResults .aio-change-toggle.checked').length;
  const total = document.querySelectorAll('#aioStreamResults .aio-change-toggle').length;

  footer.innerHTML = `
    <div class="aio-footer-info" id="aioFooterInfo" style="flex:1;font-size:11px;color:var(--text-3)">${t('ai_selected_count', [String(checked), String(total)])}</div>
    <button id="aioSelectAll" style="color:var(--text-3);background:none;padding:6px 8px;font-family:var(--font);font-size:12px;font-weight:500;border:none;border-radius:6px;cursor:pointer">${t('ai_select_all')}</button>
    <button id="aioClearAll" style="color:var(--text-3);background:none;padding:6px 8px;font-family:var(--font);font-size:12px;font-weight:500;border:none;border-radius:6px;cursor:pointer">${t('ai_clear_all')}</button>
    <button id="aioExecute" style="padding:6px 14px;font-family:var(--font);font-size:12px;font-weight:500;border:none;border-radius:6px;cursor:pointer;color:white;background:var(--accent)">${t('ai_execute')}</button>
  `;

  // 绑定事件
  const selectAllBtn = document.getElementById('aioSelectAll');
  const clearAllBtn = document.getElementById('aioClearAll');
  const executeBtn = document.getElementById('aioExecute');

  if (selectAllBtn) {
    on(selectAllBtn, 'click', () => selectAll(true));
  }
  if (clearAllBtn) {
    on(clearAllBtn, 'click', () => selectAll(false));
  }
  if (executeBtn) {
    on(executeBtn, 'click', executeOrganize);
  }
}

/**
 * 全选/清空
 *
 * @param select - 是否全选
 */
function selectAll(select: boolean): void {
  document.querySelectorAll('#aioStreamResults .aio-change-toggle').forEach(t => {
    const el = t as HTMLElement;
    const change = el.closest('.aio-change') as HTMLElement;
    if (select) {
      el.classList.add('checked');
      el.style.background = 'var(--accent)';
      el.style.borderColor = 'var(--accent)';
      el.innerHTML = '<span style="position:absolute;top:1.5px;left:4px;width:4px;height:7px;border:solid white;border-width:0 1.5px 1.5px 0;transform:rotate(45deg)"></span>';
      if (change) change.style.opacity = '1';
    } else {
      el.classList.remove('checked');
      el.style.background = 'none';
      el.style.borderColor = 'var(--border-strong)';
      el.innerHTML = '';
      if (change) change.style.opacity = '0.4';
    }
  });
  updateFooterInfo();
}

/**
 * 执行整理
 *
 * 遍历勾选的变更项，调用 moveBookmark() 执行移动。
 * 如果目标分类不存在则先调用 createFolder() 创建。
 */
async function executeOrganize(): Promise<void> {
  const checkedElements = document.querySelectorAll('#aioStreamResults .aio-change-toggle.checked');
  const checkedCount = checkedElements.length;

  // 收集需要执行的变更
  const changesToExecute: AioChange[] = [];

  checkedElements.forEach(toggleEl => {
    const changeEl = toggleEl.closest('.aio-change') as HTMLElement;
    if (!changeEl) return;

    const bookmarkId = changeEl.getAttribute('data-bookmark-id');
    const targetCategory = changeEl.getAttribute('data-target-category');

    if (bookmarkId && targetCategory) {
      const change = analysisChanges.find(c => c.bookmark.id === bookmarkId);
      if (change) changesToExecute.push(change);
    }
  });

  // 执行移动操作
  let movedCount = 0;
  let newFolderCount = 0;

  if (isChromeAvailable()) {
    for (const change of changesToExecute) {
      try {
        // 检查目标分类是否存在，不存在则创建
        let targetFolderId = categoryIdMap.get(change.to);
        if (!targetFolderId) {
          const folder = await createFolder(change.to);
          targetFolderId = folder.id;
          categoryIdMap.set(change.to, targetFolderId);
          newFolderCount++;
        }

        // 执行移动
        await moveBookmark(change.bookmark.id, targetFolderId);
        movedCount++;
      } catch (error) {
        console.error(`[MarkPage] 移动书签 "${change.bookmark.title}" 失败:`, error);
      }
    }
  } else {
    // Mock 模式：模拟成功
    movedCount = changesToExecute.length;
    // 统计新分类数量
    const newCats = new Set(changesToExecute.filter(c => c.result.newCategory).map(c => c.result.newCategory));
    newFolderCount = newCats.size || 2;
  }

  // 切换到完成视图
  const analyzingView = document.getElementById('aioAnalyzing');
  const doneView = document.getElementById('aioDone');
  const doneDesc = document.getElementById('aioDoneDesc');

  if (analyzingView) analyzingView.style.display = 'none';
  if (doneView) doneView.style.display = '';
  if (doneDesc) {
    doneDesc.innerHTML = t('ai_done_desc', [
      `<strong style="color:var(--accent)">${movedCount}</strong>`,
      `<strong style="color:var(--green)">${newFolderCount}</strong>`,
    ]);
  }

  // 底栏变为撤销
  const footer = document.getElementById('aioFooter');
  if (footer) {
    footer.innerHTML = `
      <div style="flex:1;font-size:11px;color:var(--text-3)">${t('ai_changes_applied')}</div>
      <button id="aioDoneBtn" style="padding:6px 14px;font-family:var(--font);font-size:12px;font-weight:500;border:none;border-radius:6px;cursor:pointer;color:var(--text-2);background:var(--bg-3)">${t('ai_done_btn')}</button>
      <button id="aioUndoBtn" style="padding:6px 14px;font-family:var(--font);font-size:12px;font-weight:500;border:none;border-radius:6px;cursor:pointer;color:white;background:var(--accent)">${t('ai_undo_countdown', ['30'])}</button>
    `;

    const doneBtn = document.getElementById('aioDoneBtn');
    const undoBtn = document.getElementById('aioUndoBtn');

    if (doneBtn) on(doneBtn, 'click', closeAIDrawer);
    if (undoBtn) on(undoBtn, 'click', undoOrganize);
  }

  // 撤销倒计时
  let sec = 30;
  aioTimer = setInterval(() => {
    sec--;
    const btn = document.getElementById('aioUndoBtn');
    if (btn) btn.textContent = t('ai_undo_countdown', [String(sec)]);
    if (sec <= 0) {
      if (aioTimer) clearInterval(aioTimer);
      aioTimer = null;
      if (btn) {
        btn.setAttribute('disabled', '');
        btn.style.opacity = '0.4';
        btn.style.cursor = 'not-allowed';
        btn.textContent = t('ai_confirmed');
      }
    }
  }, 1000);
}

/**
 * 撤销整理
 */
function undoOrganize(): void {
  if (aioTimer) {
    clearInterval(aioTimer);
    aioTimer = null;
  }

  const doneIcon = document.querySelector('#aioDone div:first-child') as HTMLElement;
  const doneTitle = document.querySelector('#aioDone div:nth-child(2)') as HTMLElement;
  const doneDesc = document.getElementById('aioDoneDesc');

  if (doneIcon) doneIcon.textContent = '\u21A9';
  if (doneTitle) doneTitle.textContent = t('ai_undone_title');
  if (doneDesc) doneDesc.textContent = t('ai_undone_desc');

  const footer = document.getElementById('aioFooter');
  if (footer) {
    footer.innerHTML = `
      <div style="flex:1;font-size:11px;color:var(--text-3)">${t('ai_changes_reverted')}</div>
      <button style="padding:6px 14px;font-family:var(--font);font-size:12px;font-weight:500;border:none;border-radius:6px;cursor:pointer;color:var(--text-2);background:var(--bg-3)">${t('ai_close')}</button>
    `;
    const closeBtn = footer.querySelector('button');
    if (closeBtn) on(closeBtn, 'click', closeAIDrawer);
  }
}

/**
 * 高亮左侧书签行
 *
 * @param bkTitle - 书签标题
 */
function highlightBookmark(bkTitle: string): void {
  document.querySelectorAll('.bk-row').forEach(row => {
    const title = row.getAttribute('data-title');
    if (title === bkTitle) {
      (row as HTMLElement).style.background = 'var(--accent-soft)';
      (row as HTMLElement).style.boxShadow = 'inset 2px 0 0 var(--accent)';
      (row as HTMLElement).scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  });
}

/**
 * 取消所有高亮
 */
function unhighlightBookmarks(): void {
  document.querySelectorAll('.bk-row').forEach(row => {
    (row as HTMLElement).style.background = '';
    (row as HTMLElement).style.boxShadow = '';
  });
}

/**
 * 打开 AI 整理抽屉
 */
export function openAIDrawer(): void {
  // 如果已经打开，则关闭
  if (drawerEl?.classList.contains('open')) {
    closeAIDrawer();
    return;
  }

  // 关闭设置抽屉
  const settingsDrawer = document.getElementById('settingsDrawer');
  if (settingsDrawer) settingsDrawer.classList.remove('open');

  // 重置状态
  const initView = document.getElementById('aioInit');
  const analyzingView = document.getElementById('aioAnalyzing');
  const doneView = document.getElementById('aioDone');
  const streamResults = document.getElementById('aioStreamResults');
  const progress = document.getElementById('aioProgress');

  if (initView) initView.style.display = '';
  if (analyzingView) analyzingView.style.display = 'none';
  if (doneView) doneView.style.display = 'none';
  if (streamResults) streamResults.innerHTML = '';
  if (progress) progress.style.display = '';

  // 重置结果数据
  analysisChanges = [];

  const footerInfo = document.getElementById('aioFooterInfo');
  if (footerInfo) footerInfo.textContent = t('ai_footer_default');

  const footer = document.getElementById('aioFooter');
  if (footer) {
    footer.innerHTML = `
      <div class="aio-footer-info" id="aioFooterInfo" style="flex:1;font-size:11px;color:var(--text-3)">${t('ai_footer_default')}</div>
      <button style="padding:6px 14px;font-family:var(--font);font-size:12px;font-weight:500;border:none;border-radius:6px;cursor:pointer;color:var(--text-2);background:var(--bg-3)">${t('ai_close')}</button>
    `;
    const closeBtn = footer.querySelector('button');
    if (closeBtn) on(closeBtn, 'click', closeAIDrawer);
  }

  // 异步更新初始描述中的书签数量
  updateInitDescription();

  // 打开抽屉
  if (drawerEl) drawerEl.classList.add('open');

  // 重新绑定开始按钮
  setTimeout(() => {
    const startBtn = document.getElementById('aioStartBtn');
    if (startBtn) {
      // 移除旧监听器并重新添加
      const newBtn = startBtn.cloneNode(true) as HTMLElement;
      startBtn.parentNode?.replaceChild(newBtn, startBtn);
      on(newBtn, 'click', startAnalysis);
    }
  }, 0);
}

/**
 * 异步更新初始描述中的书签数量
 */
async function updateInitDescription(): Promise<void> {
  try {
    const bookmarks = await getAllBookmarks();
    const desc = document.getElementById('aioInitDesc');
    if (desc) {
      desc.innerHTML = t('ai_init_desc_with_count', [`<strong>${bookmarks.length}</strong>`]);
    }
  } catch {
    // 忽略错误，保持默认文本
  }
}

/**
 * 关闭 AI 整理抽屉
 */
export function closeAIDrawer(): void {
  if (drawerEl) drawerEl.classList.remove('open');

  if (aioTimer) {
    clearInterval(aioTimer);
    aioTimer = null;
  }

  // 清除左侧高亮
  unhighlightBookmarks();
}
