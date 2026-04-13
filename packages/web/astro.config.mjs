import { defineConfig } from 'astro/config';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  site: 'https://seththoburn.github.io',
  base: '/recipes/',
  output: 'static',
  vite: {
    plugins: [wasm()],
    ssr: {
      noExternal: ['@cooklang/cooklang'],
    },
  },
});
