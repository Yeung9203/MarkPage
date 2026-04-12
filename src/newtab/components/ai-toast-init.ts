/**
 * AI Toast 初始化模块
 *
 * 导出 renderAIToast 用于初始化 AI 分类通知的容器，
 * 同时从 ai-toast 模块重新导出核心方法。
 *
 * 使用示例：
 *   import { renderAIToast } from './ai-toast-init';
 *   renderAIToast();
 */

import { showAIToast, hideAIToast } from './ai-toast';

/**
 * 初始化 AI Toast 容器
 *
 * 在 DOM 中预创建 toast 容器，等待后续 showAIToast 调用
 */
export function renderAIToast(): void {
  // AI Toast 容器在 showAIToast 首次调用时按需创建
  // 这里仅做预注册，无需提前创建 DOM
}

export { showAIToast, hideAIToast };
