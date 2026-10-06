import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import swc from '@rollup/plugin-swc';
import viteCompression from 'vite-plugin-compression';
import { constants } from 'zlib';

export default defineConfig({
  base: './', 

  optimizeDeps: {
    entries: ['./index.html', './src/**/*.ts'],
    holdUntilCrawlEnd: true, 
  },

  server: {
    host: true,
    port: 3000,
    strictPort: true,
    fs: { strict: false },
    watch: {
      usePolling: false, 
      ignored: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
    },
  },

  css: {
    transformer: 'lightningcss',
    lightningcss: {
      targets: { safari: (17 << 16), chrome: (120 << 16), firefox: (120 << 16) }, 
    }
  },

  plugins: [
    swc({
      include: [/\.[jt]sx?$/]
    }),

    // 📱 PWA ENGINE (Points directly to your icons folder path)
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/air-jumper.svg'], // ⚡ FIXED: Matches your exact 'public/icons/air-jumper.svg' file path
      manifest: {
        name: 'Air Jumper — High-Octane Flight Game',
        short_name: 'Air Jumper',
        description: 'Flap through gates, chase shiny collectibles, and smash high scores.',
        theme_color: '#11162b',
        background_color: '#11162b',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: 'icons/air-jumper.svg', // ⚡ FIXED: Points directly to your icons folder file asset
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,br,gz}'],
        sourcemap: false,
      },
    }),

    // 🌀 ULTRA BROTLI COMPRESSION (Level 11 Max Power)
    viteCompression({
      algorithm: 'brotliCompress',
      ext: '.br',
      threshold: 0,
      filter: /\.(js|css|html|svg)$/i, 
      compressionOptions: {
        [constants.BROTLI_PARAM_QUALITY]: 11,
      },
      deleteOriginFile: false,
    }),

    // 💨 MAX GZIP COMPRESSION (Level 9)
    viteCompression({
      algorithm: 'gzip',
      ext: '.gz',
      threshold: 0,
      filter: /\.(js|css|html|svg)$/i,
      compressionOptions: {
        level: 9,
      },
      deleteOriginFile: false,
    }),
  ],

  build: {
    target: 'esnext',
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    cssCodeSplit: false,
    assetsInlineLimit: 131072, // 128KB Monolithic asset handling
    reportCompressedSize: false,
    modulePreload: { polyfill: false },

    // 💥 TERSER MULTI-PASS COMPRESSION OVERDRIVE
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,     
        drop_debugger: true,    
        pure_getters: true,     
        passes: 5,              
        unsafe: true,           
        unsafe_math: true,      
        dead_code: true,        
        evaluate: true,         
      },
      mangle: {
        toplevel: true,         
      },
      format: {
        comments: false,        
      }
    },

    rollupOptions: {
      output: {
        assetFileNames: 'assets/[hash][extname]',
        chunkFileNames: 'js/[hash].js',
        entryFileNames: 'js/[hash].js',
      },
    },
  },
});