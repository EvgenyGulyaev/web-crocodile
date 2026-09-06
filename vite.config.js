import { defineConfig } from 'vite';
export default defineConfig({ server: { port: 5173, proxy: { '/api/game': { target: process.env.GAME_API_TARGET || 'http://127.0.0.1:8091', changeOrigin: true } } } });
