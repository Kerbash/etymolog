import {defineConfig} from 'vite'
import path from 'path'
import react from '@vitejs/plugin-react'
import {VitePWA} from 'vite-plugin-pwa'

export default defineConfig(() => {
    // Allow builds to set a custom base path (useful for GitHub Pages).
    // In CI we will set GH_PAGES_BASE="/REPO_NAME/". Defaults to '/'.
    const base = process.env.GH_PAGES_BASE || '/'

    return {
        base,
        build: {
            outDir: 'docs'
        },
        resolve: {
            alias: {
                '@src': path.resolve(__dirname, 'src'),
                '@styles': path.resolve(__dirname, 'src/styles')
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