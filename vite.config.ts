import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@renderer': path.resolve(__dirname, './src/renderer'),
      '@main': path.resolve(__dirname, './src/main'),
      '@shared': path.resolve(__dirname, './src/shared'),
    },
  },
  root: 'src/renderer',
  base: './', // 使用相对路径，解决 Electron file:// 协议下资源加载问题
  build: {
    outDir: path.resolve(__dirname, './dist/renderer'), // 输出到项目根目录的 dist/renderer
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  },
});
