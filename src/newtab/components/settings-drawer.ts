/**
 * 设置抽屉组件
 *
 * 右侧滑出的设置面板，包含：
 *   - AI 智能分类配置（服务商、API Key、验证、开关）
 *   - 外观设置（主题、主题色、紧凑模式）
 *   - 搜索设置（默认引擎、打开即搜索）
 *   - 数据管理（导入/导出）
 *
 * 使用示例：
 *   import { renderSettingsDrawer, openSettings, closeSettings } from './settings-drawer';
 *   document.body.appendChild(renderSettingsDrawer());
 *   openSettings();
 */

import { h, on, setCSSVars } from '@/utils/dom';
import { iconClose } from './icons';
import { getSettings, updateSettings } from '@/services/storage';
import { validateConfig } from '@/services/ai';
import { getAllBookmarks, getBookmarkTree, createBookmark, createFolder } from '@/services/bookmarks';
import type { AIProvider, SearchEngine, ThemeMode } from '@/types';

/** 预设主题色 */
const PRESET_COLORS = [
  { color: '#8b5cf6', name: '紫罗兰' },
  { color: '#3b82f6', name: '钴蓝' },
  { color: '#10b981', name: '翠绿' },
  { color: '#f59e0b', name: '琥珀' },
  { color: '#ec4899', name: '玫红' },
];

/** AI 服务商配置映射 */
const PROVIDER_OPTIONS: { label: string; provider: AIProvider; model: string }[] = [
  { label: 'OpenAI (gpt-4o-mini)', provider: 'openai', model: 'gpt-4o-mini' },
  { label: 'Anthropic (claude-haiku)', provider: 'anthropic', model: 'claude-3-haiku-20240307' },
  { label: 'DeepSeek (deepseek-chat)', provider: 'deepseek', model: 'deepseek-chat' },
  { label: '自定义 (OpenAI 兼容)', provider: 'custom', model: '' },
];

/** 抽屉元素引用 */
let drawerEl: HTMLElement | null = null;
/** 遮罩元素引用 */
let overlayEl: HTMLElement | null = null;

/**
 * 渲染设置抽屉
 *
 * @returns 包含抽屉和遮罩的文档片段
 */
export function renderSettingsDrawer(): HTMLElement {
  // 设置抽屉（内嵌式，无遮罩）
  drawerEl = h('div', {
    class: 'drawer settings-drawer',
    id: 'settingsDrawer',
  });

  // 头部
  const header = h('div', {
    style: 'display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border);flex-shrink:0',
  });
  header.appendChild(h('span', { style: 'font-size:14px;font-weight:600' }, '设置'));
  const closeBtn = h('button', {
    style: 'width:28px;height:28px;display:flex;align-items:center;justify-content:center;background:none;border:none;border-radius:6px;cursor:pointer;color:var(--text-3);transition:all var(--fast)',
  });
  closeBtn.innerHTML = iconClose();
  on(closeBtn, 'click', closeSettings);
  header.appendChild(closeBtn);
  drawerEl.appendChild(header);

  // 内容区域
  const body = h('div', {
    style: 'flex:1;overflow-y:auto;padding:16px 20px',
  });

  // ---- AI 智能分类 ----
  body.appendChild(createSectionTitle('AI 智能分类'));

  const aiCard = h('div', {
    style: 'padding:12px;background:var(--bg-0);border:1px solid var(--border);border-radius:8px;margin-bottom:12px',
  });

  // AI 状态指示
  const aiStatus = h('div', {
    style: 'display:flex;align-items:center;gap:8px;margin-bottom:10px',
  });
  aiStatus.innerHTML = '<span style="width:7px;height:7px;border-radius:50%;background:var(--text-4)" id="sdAiDot"></span><span style="font-size:12px;font-weight:500" id="sdAiLabel">未连接</span>';
  aiCard.appendChild(aiStatus);

  // 服务商选择
  const providerSelect = document.createElement('select');
  providerSelect.className = 'setting-select';
  providerSelect.id = 'sdProviderSelect';
  providerSelect.style.cssText = 'width:100%;margin-bottom:8px;padding:5px 10px;font-family:var(--font);font-size:12px;color:var(--text-1);background:var(--bg-2);border:1px solid var(--border);border-radius:6px;cursor:pointer';
  PROVIDER_OPTIONS.forEach((opt, idx) => {
    const option = document.createElement('option');
    option.textContent = opt.label;
    option.value = String(idx);
    providerSelect.appendChild(option);
  });
  // 保存服务商选择
  on(providerSelect, 'change', () => {
    const idx = parseInt(providerSelect.value, 10);
    const selected = PROVIDER_OPTIONS[idx];
    if (selected) {
      updateSettings({
        ai: { provider: selected.provider, model: selected.model } as any,
      });
    }
  });
  aiCard.appendChild(providerSelect);

  // API Key 输入
  const apiKeyInput = document.createElement('input');
  apiKeyInput.className = 'setting-input';
  apiKeyInput.id = 'sdApiKeyInput';
  apiKeyInput.type = 'text';
  apiKeyInput.placeholder = '粘贴你的密钥到这里...';
  apiKeyInput.style.cssText = 'width:100%;padding:8px 10px;font-family:var(--font);font-size:12px;color:var(--text-1);background:var(--bg-2);border:1px solid var(--border);border-radius:6px;outline:none';
  // 保存 API Key（失焦时保存）
  on(apiKeyInput, 'blur', () => {
    updateSettings({
      ai: { apiKey: apiKeyInput.value.trim() } as any,
    });
  });
  aiCard.appendChild(apiKeyInput);

  // 验证连接按钮
  const verifyBtn = h('button', {
    class: 'btn btn-primary',
    id: 'sdVerifyBtn',
    style: 'width:100%;padding:7px;font-size:12px;font-weight:500;border:none;border-radius:6px;cursor:pointer;margin-top:8px;color:white;background:var(--accent)',
  }, '验证连接');
  on(verifyBtn, 'click', async () => {
    const dot = document.getElementById('sdAiDot');
    const label = document.getElementById('sdAiLabel');
    const btn = verifyBtn;

    // 显示验证中状态
    btn.textContent = '验证中...';
    btn.setAttribute('disabled', '');

    try {
      const settings = await getSettings();
      const isValid = await validateConfig(settings.ai);

      if (dot && label) {
        if (isValid) {
          dot.style.background = 'var(--green)';
          label.textContent = '已连接';
          // 更新启用状态
          await updateSettings({ ai: { enabled: true } as any });
        } else {
          dot.style.background = 'var(--red, #ef4444)';
          label.textContent = '连接失败';
        }
      }
    } catch (error) {
      console.error('[MarkPage] 验证连接失败:', error);
      if (dot && label) {
        dot.style.background = 'var(--red, #ef4444)';
        label.textContent = '验证出错';
      }
    }

    btn.textContent = '验证连接';
    btn.removeAttribute('disabled');
  });
  aiCard.appendChild(verifyBtn);
  body.appendChild(aiCard);

  // AI 开关行
  body.appendChild(createToggleRow('自动分类新书签', '收藏时自动推荐分类', true, 'sdToggleAutoClassify', (isOn) => {
    updateSettings({ ai: { enabled: isOn } as any });
  }));
  body.appendChild(createToggleRow('高置信度自动确认', '置信度 > 80% 时 5 秒后自动归类', true, 'sdToggleAutoConfirm', (isOn) => {
    updateSettings({ ai: { autoConfirm: isOn } as any });
  }));

  // ---- 外观 ----
  body.appendChild(createSectionTitle('外观'));

  // 主题选择
  const themeRow = h('div', {
    style: 'display:flex;align-items:center;justify-content:space-between;padding:10px 0',
  });
  themeRow.appendChild(h('div', {}, [h('span', { style: 'font-size:13px;font-weight:450' }, '主题')]));
  const themeSelect = document.createElement('select');
  themeSelect.className = 'setting-select';
  themeSelect.id = 'sdThemeSelect';
  themeSelect.style.cssText = 'padding:5px 10px;font-family:var(--font);font-size:12px;color:var(--text-1);background:var(--bg-2);border:1px solid var(--border);border-radius:6px;cursor:pointer';
  [
    { value: 'system', label: '跟随系统' },
    { value: 'light', label: '亮色' },
    { value: 'dark', label: '暗色' },
  ].forEach(opt => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    if (opt.value === 'dark') option.selected = true;
    themeSelect.appendChild(option);
  });
  on(themeSelect, 'change', () => {
    let theme = themeSelect.value as ThemeMode;
    // 保存主题设置
    updateSettings({ theme });
    // 应用主题
    let appliedTheme: string = theme;
    if (theme === 'system') {
      appliedTheme = window.matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', appliedTheme);
    // 通知其他组件
    document.dispatchEvent(new CustomEvent('markpage-theme-change', { detail: { theme } }));
  });
  themeRow.appendChild(themeSelect);
  body.appendChild(themeRow);

  // 主题色选择器
  const colorSection = h('div', {
    style: 'padding:10px 0;border-top:1px solid var(--border)',
  });
  colorSection.appendChild(h('div', { style: 'font-size:13px;font-weight:450;margin-bottom:8px' }, '主题色'));

  const colorRow = h('div', {
    id: 'colorPickerRow',
    style: 'display:flex;align-items:center;gap:8px',
  });

  // 获取当前保存的颜色
  let currentAccent = '#8b5cf6';
  try {
    const saved = localStorage.getItem('markpage-accent');
    if (saved) currentAccent = saved;
  } catch { /* 忽略 */ }

  PRESET_COLORS.forEach(preset => {
    const swatch = h('div', {
      class: `color-swatch${preset.color === currentAccent ? ' active' : ''}`,
      style: `width:22px;height:22px;border-radius:50%;background:${preset.color};border:2px solid ${preset.color === currentAccent ? 'var(--text-1)' : 'transparent'};cursor:pointer;position:relative;transition:transform var(--fast) var(--ease),border-color var(--fast);flex-shrink:0`,
      title: preset.name,
    });
    on(swatch, 'click', () => setAccent(preset.color, swatch));
    colorRow.appendChild(swatch);
  });

  // 自定义拾色器
  const customBtn = h('div', {
    style: 'width:22px;height:22px;border-radius:50%;border:1.5px dashed var(--border-strong);background:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--text-4);font-size:14px;font-weight:300;transition:all var(--fast);position:relative;overflow:hidden',
    title: '自定义颜色',
  }, '+');
  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.value = currentAccent;
  colorInput.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;border:none';
  on(colorInput, 'input', () => setAccentCustom(colorInput.value));
  customBtn.appendChild(colorInput);
  colorRow.appendChild(customBtn);

  colorSection.appendChild(colorRow);
  body.appendChild(colorSection);

  // 紧凑模式
  body.appendChild(createToggleRow('紧凑模式', '减小行间距，显示更多书签', false, 'sdToggleCompact', (isOn) => {
    updateSettings({ compactMode: isOn });
    const padding = isOn ? '4px 24px' : '7px 24px';
    document.querySelectorAll('.bk-row').forEach(r => {
      (r as HTMLElement).style.padding = padding;
    });
  }));

  // ---- 搜索 ----
  body.appendChild(createSectionTitle('搜索'));

  const engineRow = h('div', {
    style: 'display:flex;align-items:center;justify-content:space-between;padding:10px 0',
  });
  engineRow.appendChild(h('div', {}, [h('span', { style: 'font-size:13px;font-weight:450' }, '默认搜索引擎')]));
  const engineSelect = document.createElement('select');
  engineSelect.className = 'setting-select';
  engineSelect.id = 'sdEngineSelect';
  engineSelect.style.cssText = 'padding:5px 10px;font-family:var(--font);font-size:12px;color:var(--text-1);background:var(--bg-2);border:1px solid var(--border);border-radius:6px;cursor:pointer';
  const engineOptions: { value: SearchEngine; label: string }[] = [
    { value: 'google', label: 'Google' },
    { value: 'bing', label: 'Bing' },
    { value: 'duckduckgo', label: 'DuckDuckGo' },
    { value: 'baidu', label: 'Baidu' },
  ];
  engineOptions.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    engineSelect.appendChild(option);
  });
  on(engineSelect, 'change', () => {
    updateSettings({ searchEngine: engineSelect.value as SearchEngine });
  });
  engineRow.appendChild(engineSelect);
  body.appendChild(engineRow);

  body.appendChild(createToggleRow('打开即搜索', '新标签页打开时自动弹出搜索面板', false, 'sdToggleAutoSearch', (isOn) => {
    updateSettings({ autoFocusSearch: isOn });
  }));

  // ---- 数据管理 ----
  body.appendChild(createSectionTitle('数据管理'));

  body.appendChild(createActionRow('导出书签', '导出为 JSON 或 HTML', '导出', handleExport));
  body.appendChild(createActionRow('导入书签', '从文件导入', '导入', handleImport));

  drawerEl.appendChild(body);

  return drawerEl;
}

/**
 * 创建分区标题
 *
 * @param text - 标题文本
 * @returns DOM 元素
 */
function createSectionTitle(text: string): HTMLElement {
  return h('div', {
    style: 'font-size:11px;font-weight:600;color:var(--text-4);text-transform:uppercase;letter-spacing:0.06em;margin:14px 0 6px',
  }, text);
}

/**
 * 创建开关行
 *
 * @param label - 标签文本
 * @param desc - 描述文本
 * @param defaultOn - 默认开启状态
 * @param toggleId - 开关元素的 ID（可选）
 * @param onChange - 状态变更回调
 * @returns DOM 元素
 */
function createToggleRow(
  label: string,
  desc: string,
  defaultOn: boolean,
  toggleId?: string,
  onChange?: (isOn: boolean) => void,
): HTMLElement {
  const row = h('div', {
    style: 'display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-top:1px solid var(--border)',
  });

  const left = h('div');
  left.appendChild(h('div', { style: 'font-size:13px;font-weight:450' }, label));
  left.appendChild(h('div', { style: 'font-size:11px;color:var(--text-4);margin-top:2px' }, desc));
  row.appendChild(left);

  const toggleAttrs: Record<string, string> = {
    class: `toggle${defaultOn ? ' on' : ''}`,
    style: 'width:36px;height:20px;background:' + (defaultOn ? 'var(--accent)' : 'var(--bg-3)') + ';border:1px solid ' + (defaultOn ? 'var(--accent)' : 'var(--border-strong)') + ';border-radius:10px;position:relative;cursor:pointer;transition:all var(--fast);flex-shrink:0',
  };
  if (toggleId) toggleAttrs['id'] = toggleId;

  const toggle = h('div', toggleAttrs);

  const knob = h('div', {
    class: 'toggle-knob',
    style: 'width:14px;height:14px;background:var(--bg-0);border-radius:50%;position:absolute;top:2px;left:2px;transition:transform var(--fast) var(--ease);box-shadow:0 1px 2px rgba(0,0,0,0.15);transform:' + (defaultOn ? 'translateX(16px)' : 'none'),
  });
  toggle.appendChild(knob);

  on(toggle, 'click', () => {
    const isOn = toggle.classList.toggle('on');
    toggle.style.background = isOn ? 'var(--accent)' : 'var(--bg-3)';
    toggle.style.borderColor = isOn ? 'var(--accent)' : 'var(--border-strong)';
    knob.style.transform = isOn ? 'translateX(16px)' : 'none';
    onChange?.(isOn);
  });

  row.appendChild(toggle);
  return row;
}

/**
 * 创建操作行（带按钮）
 *
 * @param label - 标签文本
 * @param desc - 描述文本
 * @param btnText - 按钮文本
 * @param onClick - 按钮点击回调
 * @returns DOM 元素
 */
function createActionRow(label: string, desc: string, btnText: string, onClick?: () => void): HTMLElement {
  const row = h('div', {
    style: 'display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-top:1px solid var(--border)',
  });

  const left = h('div');
  left.appendChild(h('div', { style: 'font-size:13px;font-weight:450' }, label));
  left.appendChild(h('div', { style: 'font-size:11px;color:var(--text-4);margin-top:2px' }, desc));
  row.appendChild(left);

  const btn = h('button', {
    class: 'btn btn-ghost',
    style: 'padding:5px 12px;font-size:12px;font-weight:500;border:none;border-radius:6px;cursor:pointer;color:var(--text-2);background:var(--bg-3)',
  }, btnText);

  if (onClick) {
    on(btn, 'click', onClick);
  }

  row.appendChild(btn);

  return row;
}

/**
 * 设置主题色（预设色）
 *
 * @param color - 颜色值
 * @param swatch - 色块元素
 */
function setAccent(color: string, swatch: HTMLElement): void {
  // 启用全局过渡
  document.body.classList.add('theme-transitioning');

  // 设置 CSS 变量
  setCSSVars({ '--accent': color });

  // 更新选中状态
  document.querySelectorAll('.color-swatch').forEach(s => {
    s.classList.remove('active');
    (s as HTMLElement).style.borderColor = 'transparent';
  });
  swatch.classList.add('active');
  swatch.style.borderColor = 'var(--text-1)';

  // 更新拾色器值
  const picker = document.querySelector('.color-custom input[type="color"]') as HTMLInputElement;
  if (picker) picker.value = color;

  // 持久化到 localStorage 和 settings
  try {
    localStorage.setItem('markpage-accent', color);
  } catch { /* 忽略 */ }
  updateSettings({ accentColor: color });

  // 延迟移除过渡
  setTimeout(() => document.body.classList.remove('theme-transitioning'), 300);
}

/**
 * 设置自定义主题色
 *
 * @param color - 自定义颜色值
 */
function setAccentCustom(color: string): void {
  document.querySelectorAll('.color-swatch').forEach(s => {
    s.classList.remove('active');
    (s as HTMLElement).style.borderColor = 'transparent';
  });

  setCSSVars({ '--accent': color });

  try {
    localStorage.setItem('markpage-accent', color);
  } catch { /* 忽略 */ }
  updateSettings({ accentColor: color });
}

/**
 * 导出书签为 JSON 文件
 *
 * 收集所有书签数据并通过创建 <a> 标签下载
 */
async function handleExport(): Promise<void> {
  try {
    const bookmarks = await getAllBookmarks();
    const tree = await getBookmarkTree();

    const exportData = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      bookmarks,
      tree,
    };

    const jsonStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    // 创建下载链接
    const a = document.createElement('a');
    a.href = url;
    a.download = `markpage-bookmarks-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log('[MarkPage] 书签导出成功');
  } catch (error) {
    console.error('[MarkPage] 导出书签失败:', error);
  }
}

/**
 * 导入书签
 *
 * 创建隐藏的文件输入框，读取 JSON 文件并批量创建书签
 */
function handleImport(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.style.display = 'none';

  on(input, 'change', async () => {
    const file = input.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.bookmarks || !Array.isArray(data.bookmarks)) {
        console.error('[MarkPage] 导入文件格式无效：缺少 bookmarks 数组');
        return;
      }

      // 按分类分组创建文件夹和书签
      const categoryFolderMap = new Map<string, string>();
      let importedCount = 0;

      for (const bk of data.bookmarks) {
        if (!bk.title || !bk.url) continue;

        let parentId: string | undefined;

        // 如果有分类信息，尝试创建或复用文件夹
        if (bk.category) {
          if (!categoryFolderMap.has(bk.category)) {
            try {
              const folder = await createFolder(bk.category);
              categoryFolderMap.set(bk.category, folder.id);
            } catch {
              // 创建文件夹失败时跳过分类
            }
          }
          parentId = categoryFolderMap.get(bk.category);
        }

        try {
          await createBookmark(bk.title, bk.url, parentId);
          importedCount++;
        } catch (error) {
          console.error(`[MarkPage] 导入书签 "${bk.title}" 失败:`, error);
        }
      }

      console.log(`[MarkPage] 导入完成，共导入 ${importedCount} 个书签`);

      // 刷新页面以显示新导入的书签
      if (importedCount > 0) {
        window.location.reload();
      }
    } catch (error) {
      console.error('[MarkPage] 导入书签失败:', error);
    }
  });

  document.body.appendChild(input);
  input.click();
  document.body.removeChild(input);
}

/**
 * 打开设置抽屉
 *
 * 打开时从存储中读取设置并回填到所有控件
 */
export async function openSettings(): Promise<void> {
  // 如果已经打开，则关闭
  if (drawerEl?.classList.contains('open')) {
    closeSettings();
    return;
  }

  // 关闭 AI 抽屉
  closeAIDrawer();

  if (drawerEl) drawerEl.classList.add('open');

  // 读取设置并回填控件
  try {
    const settings = await getSettings();

    // 回填服务商选择
    const providerSelect = document.getElementById('sdProviderSelect') as HTMLSelectElement;
    if (providerSelect) {
      const idx = PROVIDER_OPTIONS.findIndex(opt => opt.provider === settings.ai.provider);
      if (idx >= 0) providerSelect.value = String(idx);
    }

    // 回填 API Key
    const apiKeyInput = document.getElementById('sdApiKeyInput') as HTMLInputElement;
    if (apiKeyInput) {
      apiKeyInput.value = settings.ai.apiKey || '';
    }

    // 回填 AI 状态指示
    const dot = document.getElementById('sdAiDot');
    const label = document.getElementById('sdAiLabel');
    if (dot && label) {
      if (settings.ai.enabled && settings.ai.apiKey) {
        dot.style.background = 'var(--green)';
        label.textContent = '已连接';
      } else {
        dot.style.background = 'var(--text-4)';
        label.textContent = '未连接';
      }
    }

    // 回填主题选择
    const themeSelect = document.getElementById('sdThemeSelect') as HTMLSelectElement;
    if (themeSelect) {
      themeSelect.value = settings.theme;
    }

    // 回填搜索引擎
    const engineSelect = document.getElementById('sdEngineSelect') as HTMLSelectElement;
    if (engineSelect) {
      engineSelect.value = settings.searchEngine;
    }

    // 回填开关状态
    fillToggle('sdToggleAutoClassify', settings.ai.enabled);
    fillToggle('sdToggleAutoConfirm', settings.ai.autoConfirm);
    fillToggle('sdToggleCompact', settings.compactMode);
    fillToggle('sdToggleAutoSearch', settings.autoFocusSearch);
  } catch (error) {
    console.error('[MarkPage] 加载设置失败:', error);
  }
}

/**
 * 回填开关状态
 *
 * @param toggleId - 开关元素的 ID
 * @param isOn - 是否开启
 */
function fillToggle(toggleId: string, isOn: boolean): void {
  const toggle = document.getElementById(toggleId);
  if (!toggle) return;

  const knob = toggle.querySelector('.toggle-knob') as HTMLElement;
  if (!knob) return;

  if (isOn) {
    toggle.classList.add('on');
    toggle.style.background = 'var(--accent)';
    toggle.style.borderColor = 'var(--accent)';
    knob.style.transform = 'translateX(16px)';
  } else {
    toggle.classList.remove('on');
    toggle.style.background = 'var(--bg-3)';
    toggle.style.borderColor = 'var(--border-strong)';
    knob.style.transform = 'none';
  }
}

/**
 * 关闭设置抽屉
 */
export function closeSettings(): void {
  if (drawerEl) drawerEl.classList.remove('open');
}

/**
 * 关闭 AI 抽屉（辅助方法，避免循环引用）
 */
function closeAIDrawer(): void {
  const aiDrawer = document.getElementById('aioDrawer');
  if (aiDrawer) aiDrawer.classList.remove('open');
}
