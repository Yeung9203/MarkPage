/**
 * 早期主题注入（同步、CSP 合规）
 *
 * 从 localStorage 读取用户主题偏好，在任何 CSS 加载之前设置 data-theme，
 * 避免刷新时先出现默认深色再闪回浅色的 FOUC。
 */
(function () {
  try {
    var saved = localStorage.getItem('markpage-theme');
    var theme = saved || 'system';
    if (theme === 'system') {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {
    /* 忽略存储不可用 */
  }
})();
