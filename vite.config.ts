import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  /* Relative base so the same build works at localhost:5173/, a subpath
     like github.io/website/, or any static host. */
  base: './',
  server: { port: 5173, strictPort: true }
});
