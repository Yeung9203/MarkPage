/**
 * 滚动指示器
 *
 * 监听页面内所有滚动事件，在滚动容器上临时添加 `is-scrolling` 类，
 * 配合 CSS 实现「默认隐藏滚动条、滚动时显示、停止后淡出」的效果。
 *
 * 使用示例：
 *   import { initScrollIndicator } from '@/utils/scroll-indicator';
 *   initScrollIndicator();
 */

const HIDE_DELAY = 800;
const timers = new WeakMap<Element, number>();

/**
 * 初始化全局滚动指示器
 *
 * 使用示例：
 *   initScrollIndicator(); // 在应用入口调用一次即可
 */
export function initScrollIndicator(): void {
  // 使用捕获阶段监听，scroll 事件不冒泡
  document.addEventListener(
    'scroll',
    (e) => {
      const target = e.target;
      // document 滚动时 target 是 document，映射到 documentElement
      const el =
        target instanceof Element
          ? target
          : document.scrollingElement || document.documentElement;

      if (!el) return;

      el.classList.add('is-scrolling');

      const prev = timers.get(el);
      if (prev) clearTimeout(prev);

      const id = window.setTimeout(() => {
        el.classList.remove('is-scrolling');
        timers.delete(el);
      }, HIDE_DELAY);

      timers.set(el, id);
    },
    true
  );
}
