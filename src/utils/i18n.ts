/**
 * 国际化工具
 *
 * 对 chrome.i18n.getMessage 的轻量封装，便于在组件中统一调用：
 *   import { t } from '@/utils/i18n';
 *   t('sidebar_allBookmarks');                    // -> "All bookmarks" / "全部书签"
 *   t('tag_confirmDelete', ['工具']);             // 占位符替换
 *
 * 注意：messages.json 的 key 命名规则仅允许 [A-Za-z0-9_]，本项目约定
 * 使用下划线分段，如 `sidebar_allBookmarks`、`menu_editTags`。
 */

/**
 * 获取本地化文案
 *
 * 若查不到（如开发环境未加载 _locales），回退到 key 本身，
 * 保证 UI 仍能渲染。
 *
 * @param key - messages.json 中的 key
 * @param subs - 可选，占位符替换数组
 * @returns 当前 locale 下的文案
 *
 * 使用示例：
 *   t('sidebar_allBookmarks');
 *   t('tag_confirmDelete', ['Work']);
 */
export function t(key: string, subs?: string[]): string {
  if (typeof chrome === 'undefined' || !chrome.i18n) return key;
  const msg = chrome.i18n.getMessage(key, subs);
  return msg || key;
}

/**
 * 获取当前浏览器 UI 语言
 *
 * 使用示例：
 *   const lang = uiLang(); // "zh-CN" | "en-US" | ...
 *
 * @returns 形如 "en-US" / "zh-CN" 的 BCP 47 语言标签
 */
export function uiLang(): string {
  return chrome.i18n?.getUILanguage?.() ?? 'en';
}

/**
 * 判断当前 UI 是否为中文环境
 *
 * 使用示例：
 *   if (isZhUi()) { ... }
 */
export function isZhUi(): boolean {
  return /^zh/i.test(uiLang());
}
