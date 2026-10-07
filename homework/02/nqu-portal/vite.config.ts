import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// base './' lets the built site work from any GitHub Pages sub-path (user.github.io/repo-name/).
export default defineConfig({
  base: './',
  plugins: [react()],
});
