/**
 * Stand-in for `virtual:pwa-register` under vitest.
 *
 * The virtual module is produced by `vite-plugin-pwa`, and `vitest.config.ts`
 * does not (and should not) load that plugin — a test run has no service
 * worker to register. Without a substitute, importing `updateController.ts`
 * fails to resolve at all.
 *
 * `vitest.config.ts` aliases the specifier here. The production build has no
 * such alias, so `vite build` still resolves the plugin's real virtual module.
 *
 * The implementation is deliberately IDENTICAL to the plugin's own dev-mode
 * stub (`vite-plugin-pwa/dist/client/dev/register.js`): a `registerSW` that
 * never invokes a single callback and returns a no-op updater. Tests that care
 * about the state machine inject their own fake through
 * `createPwaUpdateController({ registerSW })`; everything else gets the same
 * inert behaviour the dev server has, which is the behaviour the controller is
 * required to survive without logging noise.
 */

export function registerSW(
    _options: Record<string, unknown> = {},
): (reloadPage?: boolean) => Promise<void> {
    return async (_reloadPage = true) => {};
}
