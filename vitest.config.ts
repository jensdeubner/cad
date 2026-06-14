import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // jsdom default so DOM-touching modules (i18n/dom, browser-panel) work;
    // pure math/three modules run fine here too. Heavy WebGL is never instantiated.
    environment: 'jsdom',
    globals: true,
    include: ['test/**/*.test.ts'],
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/main.ts'],
    },
  },
});
