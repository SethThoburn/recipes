import { defineConfig } from 'astro/config';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  site: 'https://recipes.seththoburn.com',
  output: 'static',
  vite: {
    plugins: [wasm()],
    ssr: {
      noExternal: ['@cooklang/cooklang'],
    },
  },
});
