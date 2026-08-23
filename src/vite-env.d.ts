/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// `vite-plugin-pwa/client` is what declares the `virtual:pwa-register` module
// that `src/pwa/updateController.ts` imports. Without this reference the app
// typechecks against nothing (`Cannot find module 'virtual:pwa-register'`) even
// though the bundler resolves it fine — the classic "builds but does not
// typecheck" split.
//
// tsconfig.app.json lists `"types": ["vite/client"]`, which DISABLES automatic
// inclusion of every other @types package, so the reference has to be written
// out here rather than relied on.
