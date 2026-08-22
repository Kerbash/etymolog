import {defineConfig, searchForWorkspaceRoot} from 'vite'
import path from 'path'
import {execFileSync} from 'node:child_process'
import {readFileSync} from 'node:fs'
import react from '@vitejs/plugin-react'
import {VitePWA} from 'vite-plugin-pwa'

// ── Build stamp (see VERSIONING.md at the repo root) ─────────────────
//
// The version is a build OUTPUT derived from package.json, never a hardcoded
// literal. `src/config/version.ts` used to declare `APP_VERSION = '0.1.0'` by
// hand while package.json said `0.0.0` — the same drift that let idp-nochi report
// a version that had not existed for months, except here it also got stamped into
// every export envelope. package.json is the single source now.
const UNKNOWN = 'unknown'

/** Best-effort git read. Returns '' when git is unavailable (CI tarball, etc). */
function gitOrEmpty(args: string[]): string {
    try {
        return execFileSync('git', args, {
            cwd: __dirname,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim()
    } catch {
        return ''
    }
}

function resolveBuildStamp() {
    let version = '0.0.0'
    try {
        version = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')).version || version
    } catch {
        // Unstamped reads as 0.0.0 — a visible placeholder, not a plausible lie.
    }
    const gitSha = process.env.GIT_SHA || gitOrEmpty(['rev-parse', 'HEAD']) || UNKNOWN
    // `--abbrev-ref HEAD` answers the literal "HEAD" when detached (routine in
    // this repo's worktree flow) — report that rather than a branch that isn't.
    const rawBranch = process.env.GIT_BRANCH || gitOrEmpty(['rev-parse', '--abbrev-ref', 'HEAD'])
    const gitBranch = !rawBranch ? UNKNOWN : rawBranch === 'HEAD' ? 'detached' : rawBranch
    const dirty = process.env.GIT_DIRTY ?? String(gitOrEmpty(['status', '--porcelain']) !== '')
    // `vite dev` has no meaningful build time; stamping boot time would make a dev
    // session look like a release.
    const buildTime = process.env.BUILD_TIME
        || (process.env.NODE_ENV === 'development' ? UNKNOWN : new Date().toISOString())
    return {version, gitSha, gitBranch, dirty, buildTime}
}

export default defineConfig(() => {
    const stamp = resolveBuildStamp()

    // Allow builds to set a custom base path (useful for GitHub Pages).
    // In CI we will set GH_PAGES_BASE="/REPO_NAME/". Defaults to '/'.
    const base = process.env.GH_PAGES_BASE || '/etymolog/'

    return {
        base,
        // Build stamp, inlined as a literal at build time — read it through
        // `src/config/version.ts` (APP_VERSION / BUILD_INFO), never directly.
        // Being inlined is the point: nothing at runtime can override the version
        // of a built bundle. See VERSIONING.md §1.
        //
        // A plain global identifier, NOT `import.meta.env.VITE_*`: a `define` on
        // `import.meta.env.X` only applies where Vite does text replacement, and
        // under vitest `import.meta.env` is a real object built from .env files —
        // so every read came back undefined and APP_VERSION silently fell back to
        // 0.0.0 in tests. A bare identifier is replaced in every mode.
        define: {
            __BUILD_STAMP__: JSON.stringify(stamp),
        },
        server: {
            fs: {
                // Worktree node_modules are junctions resolving to the pnpm
                // content-addressable store, which sits outside the workspace
                // root. Allow it explicitly so font/woff assets referenced by
                // CSS url() can be served in dev.
                allow: [
                    searchForWorkspaceRoot(process.cwd()),
                    'D:/.pnpm-store',
                ],
            },
        },
        build: {
            outDir: 'docs',
            rollupOptions: {
                output: {
                    entryFileNames: 'assets/[name]-[hash].js',
                    chunkFileNames: 'assets/[name]-[hash].js',
                    assetFileNames: 'assets/[name]-[hash][extname]'
                }
            }
        },
        resolve: {
            alias: {
                '@src': path.resolve(__dirname, 'src'),
                '@styles': path.resolve(__dirname, 'src/styles'),
                // Resolve the workspace packages by RELATIVE PATH rather than
                // through node_modules.
                //
                // In a git worktree, `node_modules/cyber-components` is an NTFS
                // junction created by .githooks/post-checkout that points at the
                // MAIN repo's `packages/cyber-components` — not the worktree's.
                // So a package edit made in a worktree is invisible to that
                // worktree's own dev server and build: you edit a component,
                // reload, and see the old one, with nothing in the output to
                // suggest why. (Same class of trap as the webpack alias the
                // Next.js apps carry.)
                //
                // `<app>/../../packages/<name>` resolves inside whichever tree
                // the app is checked out in, so this is identical to today's
                // behaviour in the main tree and CORRECT in a worktree.
                'cyber-components': path.resolve(__dirname, '../../packages/cyber-components'),
                'smart-form': path.resolve(__dirname, '../../packages/smart-form'),
                'utils-styles': path.resolve(__dirname, '../../packages/utils-styles'),
                'utils-func': path.resolve(__dirname, '../../packages/utils-func')
            }
        },
        plugins: [
            react(),
            VitePWA({
                registerType: 'autoUpdate',
                includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
                manifest: {
                    name: 'Etymolog',
                    short_name: 'Etymolog',
                    description: 'Your constructed language word journal',
                    theme_color: '#ffffff',
                    // Use the configured base so the PWA works on repo pages
                    start_url: base,
                    scope: base,
                    display: 'standalone',
                    icons: [
                        {
                            src: 'pwa-192x192.png',
                            sizes: '192x192',
                            type: 'image/png'
                        },
                        {
                            src: 'pwa-512x512.png',
                            sizes: '512x512',
                            type: 'image/png'
                        }
                    ]
                },
                workbox: {
                    // SPA fallback: serve index.html for all navigation requests
                    navigateFallback: `${base}index.html`,
                    // Ensure all paths fallback to index.html for client-side routing
                    navigateFallbackAllowlist: [/^(?!\/__).*/],
                    // Cache strategies for different asset types
                    runtimeCaching: [
                        {
                            // Always fetch latest index.html from network
                            urlPattern: /\/index\.html$/,
                            handler: 'NetworkFirst',
                            options: {
                                cacheName: 'index-html-cache',
                                expiration: {
                                    maxEntries: 1,
                                    maxAgeSeconds: 0 // No caching
                                }
                            }
                        },
                        {
                            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
                            handler: 'CacheFirst',
                            options: {
                                cacheName: 'google-fonts-cache',
                                expiration: {
                                    maxEntries: 10,
                                    maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
                                },
                                cacheableResponse: {
                                    statuses: [0, 200]
                                }
                            }
                        },
                        {
                            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
                            handler: 'CacheFirst',
                            options: {
                                cacheName: 'gstatic-fonts-cache',
                                expiration: {
                                    maxEntries: 10,
                                    maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
                                },
                                cacheableResponse: {
                                    statuses: [0, 200]
                                }
                            }
                        }
                    ]
                }
            })
        ]
    }
})