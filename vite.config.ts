import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync, readdirSync } from 'fs';

/**
 * 构建后将 manifest.json 和 icons 复制到 dist 的插件
 */
function copyExtensionFiles(): Plugin {
  return {
    name: 'copy-extension-files',
    closeBundle() {
      // 复制 manifest.json
      copyFileSync(
        resolve(__dirname, 'src/manifest.json'),
        resolve(__dirname, 'dist/manifest.json'),
      );

      // 复制 icons
      const iconsDir = resolve(__dirname, 'public/icons');
      const distIcons = resolve(__dirname, 'dist/icons');
      if (!existsSync(distIcons)) mkdirSync(distIcons, { recursive: true });
      if (existsSync(iconsDir)) {
        readdirSync(iconsDir).forEach(f => {
          copyFileSync(resolve(iconsDir, f), resolve(distIcons, f));
        });
      }
    },
  };
}

/**
 * Vite 构建配置
 *
 * 多入口配置：
 *   - newtab: 新标签页（主界面）
 *   - popup: 弹窗（收藏时 AI 分类确认）
 *   - background: Service Worker（后台监听）
 *
 * 构建输出到 dist/ 目录，供 Chrome 加载
 */
export default defineConfig({
  plugins: [copyExtensionFiles()],

  // 解析路径别名
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },

  build: {
    // 输出目录
    outDir: 'dist',
    emptyOutDir: true,

    rollupOptions: {
      // 多入口配置
      input: {
        newtab: resolve(__dirname, 'src/newtab/index.html'),
        popup: resolve(__dirname, 'src/popup/index.html'),
        'service-worker': resolve(__dirname, 'src/background/service-worker.ts'),
      },
      output: {
        // Service Worker 入口名称保持一致
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'service-worker') {
            return 'background/service-worker.js';
          }
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },

  // 开发服务器配置
  server: {
    port: 5173,
    open: '/src/newtab/index.html',
  },
});
