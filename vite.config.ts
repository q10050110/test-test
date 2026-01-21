import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import vueDevTools from 'vite-plugin-vue-devtools'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { AntDesignVueResolver } from 'unplugin-vue-components/resolvers';
// @ts-ignore
import postcssPxToRem from 'postcss-pxtorem'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueJsx(),
    vueDevTools(),
    AutoImport({
      imports: ['vue', 'vue-router', 'pinia'],
      dts: 'src/auto-import.d.ts'
    }),
    Components({
      resolvers: [AntDesignVueResolver({
        importStyle: false
      })],
      dts: 'src/components.d.ts'
    })
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  base: './',
  server: {
    port: 3000,
    proxy: {
      "/api": {
        changeOrigin: true,
        target: 'https://test-plus.shopbang.cn'
      }
    }
  },
  css: {
    postcss: {
      plugins: [postcssPxToRem({
        rootValue: 16,
        propList: ['*'],
        unitPrecision: 5,
        minPixelValue: 0,
        selectorBlackList: [],
        replace: true,
        mediaQuery: false
      })]
    }
  }
})
