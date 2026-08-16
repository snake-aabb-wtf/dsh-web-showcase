import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './', // relative asset paths — deployable under any sub-path (showcase convention)
  server: {
    watch: {
      // Large static model/wasm assets: watching them on Windows can hit EBUSY.
      ignored: ['**/public/mediapipe/**'],
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
