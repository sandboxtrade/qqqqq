import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative assets keep production builds working on GitHub Pages project URLs
  // such as https://username.github.io/repository-name/.
  base: './',
  plugins: [react()],
  server: { port: 5173 },
});
