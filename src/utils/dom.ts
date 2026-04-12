/**
 * DOM 工具函数
 *
 * 提供轻量的 DOM 操作简写，替代 React/Vue 等框架。
 * 追求性能优先，新标签页首屏渲染 < 100ms。
 *
 * 使用示例：
 *   import { $, $$, h, on } from '@/utils/dom';
 *   const el = h('div', { class: 'card' }, [
 *     h('h3', {}, '标题'),
 *     h('p', {}, '内容'),
 *   ]);
 *   $('#app')?.appendChild(el);
 */

/**
 * 查询单个 DOM 元素（简写 querySelector）
 *
 * @param selector - CSS 选择器
 * @param parent - 父元素（默认 document）
 * @returns 匹配的元素或 null
 *
 * 使用示例：
 *   const app = $('#app');
 *   const title = $('h1', someContainer);
 */
export function $(selector: string, parent: ParentNode = document): Element | null {
  return parent.querySelector(selector);
}

/**
 * 查询多个 DOM 元素（简写 querySelectorAll）
 *
 * @param selector - CSS 选择器
 * @param parent - 父元素（默认 document）
 * @returns 匹配的元素数组
 *
 * 使用示例：
 *   const items = $$('.bookmark-item');
 *   items.forEach(item => item.classList.add('visible'));
 */
export function $$(selector: string, parent: ParentNode = document): Element[] {
  return Array.from(parent.querySelectorAll(selector));
}

/** 元素属性类型 */
type Attrs = Record<string, string | boolean | EventListener>;

/**
 * 创建 DOM 元素（简写 createElement）
 *
 * @param tag - HTML 标签名
 * @param attrs - 属性对象（支持 class、id、事件监听等）
 * @param children - 子元素（字符串或 DOM 元素数组）
 * @returns 创建的 DOM 元素
 *
 * 使用示例：
 *   const card = h('div', { class: 'card', 'data-id': '123' }, [
 *     h('img', { src: 'icon.png', class: 'card-icon' }),
 *     h('span', { class: 'card-title' }, '书签标题'),
 *   ]);
 */
export function h(
  tag: string,
  attrs: Attrs = {},
  children?: string | (Node | string)[],
): HTMLElement {
  const el = document.createElement(tag);

  // 设置属性
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith('on') && typeof value === 'function') {
      // 事件监听：onClick → click
      const event = key.slice(2).toLowerCase();
      el.addEventListener(event, value as EventListener);
    } else if (typeof value === 'boolean') {
      // 布尔属性
      if (value) el.setAttribute(key, '');
    } else {
      el.setAttribute(key, value as string);
    }
  }

  // 设置子元素
  if (typeof children === 'string') {
    el.textContent = children;
  } else if (Array.isArray(children)) {
    for (const child of children) {
      if (typeof child === 'string') {
        el.appendChild(document.createTextNode(child));
      } else {
        el.appendChild(child);
      }
    }
  }

  return el;
}

/**
 * 事件监听简写
 *
 * @param el - 目标元素
 * @param event - 事件名称
 * @param handler - 事件处理函数
 * @param options - addEventListener 选项
 * @returns 取消监听的函数
 *
 * 使用示例：
 *   const off = on(document, 'keydown', (e) => {
 *     if (e.key === 'k' && e.metaKey) openCmdPanel();
 *   });
 *   // 取消监听
 *   off();
 */
export function on<K extends keyof HTMLElementEventMap>(
  el: EventTarget,
  event: K,
  handler: (e: HTMLElementEventMap[K]) => void,
  options?: AddEventListenerOptions,
): () => void {
  el.addEventListener(event, handler as EventListener, options);
  return () => el.removeEventListener(event, handler as EventListener, options);
}

/**
 * 清空元素内容
 *
 * @param el - 要清空的元素
 *
 * 使用示例：
 *   empty($('#bookmark-list'));
 */
export function empty(el: Element | null): void {
  if (el) el.innerHTML = '';
}

/**
 * 切换元素的 CSS 类
 *
 * @param el - 目标元素
 * @param className - CSS 类名
 * @param force - 强制添加/移除
 *
 * 使用示例：
 *   toggle(sidebar, 'collapsed');
 *   toggle(drawer, 'open', true); // 强制添加
 */
export function toggle(el: Element | null, className: string, force?: boolean): void {
  el?.classList.toggle(className, force);
}

/**
 * 批量设置 CSS 变量
 *
 * @param vars - CSS 变量键值对
 * @param el - 目标元素（默认 document.documentElement）
 *
 * 使用示例：
 *   setCSSVars({ '--accent': '#3b82f6', '--bg-0': '#000' });
 */
export function setCSSVars(
  vars: Record<string, string>,
  el: HTMLElement = document.documentElement,
): void {
  for (const [key, value] of Object.entries(vars)) {
    el.style.setProperty(key, value);
  }
}
