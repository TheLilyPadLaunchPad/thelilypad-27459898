import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    nodePolyfills({
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      protocolImports: true,
    }),
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "prompt",
      // 'auto' lets vite-plugin-pwa inject the registration snippet into index.html
      // so the browser always finds /sw.js from the right place
      injectRegister: "auto",
      includeAssets: ["favicon.ico", "robots.txt", "sitemap.xml", "auth-branding.webp"],
      manifest: {
        name: "The Lily Pad",
        short_name: "LilyPad",
        description: "Multi-chain NFT Launchpad & Marketplace — Solana & Monad",
        theme_color: "#0a0f1a",
        background_color: "#0a0f1a",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/favicon.ico",
            sizes: "64x64",
            type: "image/x-icon",
          },
        ],
      },
      // Enable service worker in dev so /sw.js is served with the correct MIME type
      devOptions: {
        enabled: true,
        type: "module",
        navigateFallback: "index.html",
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        // Precache HTML entry point + all compiled assets
        globPatterns: ["**/*.{html,js,css,ico,svg,woff,woff2,webp,png,jpg}"],
        // SPA fallback: serve index.html for all navigation requests
        navigateFallback: "index.html",
        navigateFallbackDenylist: [
          // Don't intercept API calls or Supabase requests
          /^\/api\//,
          /\.supabase\.co/,
        ],
        skipWaiting: false,
        clientsClaim: false,
        runtimeCaching: [
          {
            urlPattern: /\.(?:js|css)$/,
            handler: "NetworkFirst",
            options: {
              cacheName: "app-assets-cache",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24, // 1 day
              },
              networkTimeoutSeconds: 3,
            },
          },
          {
            urlPattern: /\.html$/,
            handler: "NetworkFirst",
            options: {
              cacheName: "html-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60, // 1 hour
              },
              networkTimeoutSeconds: 3,
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "gstatic-fonts-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "images-cache",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 5,
              },
              networkTimeoutSeconds: 10,
            },
          },
        ],
      },
    }),
  ].filter(Boolean),
  optimizeDeps: {
    include: [
      "@metaplex-foundation/mpl-hybrid",
      "@metaplex-foundation/umi",
      "@metaplex-foundation/mpl-core",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Polyfill Node.js core modules as required by Irys SDK documentation
      crypto: "crypto-browserify",
      stream: "stream-browserify",
      os: "os-browserify/browser",
      path: "path-browserify",
    },
  },
  ssr: {
    noExternal: ["@metaplex-foundation/mpl-hybrid"],
  },
  build: {
    target: "esnext",
    rollupOptions: {
      output: {
        manualChunks: {
          // Separate heavy vendor libraries into their own chunks
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-charts": ["recharts"],
          "vendor-motion": ["framer-motion", "gsap"],
          "vendor-solana": [
            "@solana/web3.js",
            "@solana/spl-token",
          ],
          "vendor-metaplex": [
            "@metaplex-foundation/umi",
            "@metaplex-foundation/mpl-core",
            "@metaplex-foundation/mpl-hybrid",
          ],
          "vendor-ui": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-tabs",
            "@radix-ui/react-tooltip",
            "@radix-ui/react-popover",
            "@radix-ui/react-select",
          ],
        },
      },
    },
  },
}));

