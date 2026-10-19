import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative assets keep production builds working on GitHub Pages project URLs
  // such as https://username.github.io/repository-name/.
  base: './',
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'firebase', test: /node_modules\/(?:@firebase|firebase)\//, priority: 20 },
            { name: 'react', test: /node_modules\/(?:react|react-dom|scheduler)\//, priority: 10 },
          ],
        },
      },
    },
  },
  server: { port: 5173 },
});
