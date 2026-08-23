import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@src': path.resolve(__dirname, 'src'),
            '@styles': path.resolve(__dirname, 'src/styles'),
            // Mirrors vite.config.ts — in a worktree, node_modules/<pkg> is a
            // junction to the MAIN repo's copy, so without these the tests
            // exercise a different checkout of the package than the one under
            // edit. See the long comment in vite.config.ts.
            'cyber-components': path.resolve(__dirname, '../../packages/cyber-components'),
            'smart-form': path.resolve(__dirname, '../../packages/smart-form'),
            'utils-styles': path.resolve(__dirname, '../../packages/utils-styles'),
            'utils-func': path.resolve(__dirname, '../../packages/utils-func'),
            // `virtual:pwa-register` only exists while vite-plugin-pwa is
            // loaded, and this config deliberately does not load it (a test run
            // has no service worker). Point the specifier at an inert stand-in
            // so `src/pwa/updateController.ts` resolves; the PRODUCTION build
            // has no such alias and still gets the plugin's real module.
            'virtual:pwa-register': path.resolve(
                __dirname,
                'src/pwa/__mocks__/virtualPwaRegister.ts',
            ),
        },
    },
    test: {
        globals: true,
        environment: 'node', // Use Node environment for SQL.js WASM loading
        setupFiles: ['./src/db/__tests__/setup.ts'],
        include: ['src/**/*.{test,spec}.{js,ts,tsx}'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            include: ['src/db/**/*.ts'],
            exclude: ['src/db/__tests__/**']
        }
    }
});
