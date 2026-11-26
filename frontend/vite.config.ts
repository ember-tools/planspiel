import {emberbox} from '@emberbox/ui/vite'
import vue from '@vitejs/plugin-vue'
import {defineConfig} from 'vite'

const backend = process.env.VITE_API_PROXY_TARGET || 'http://localhost:8000'

export default defineConfig({
    plugins: [
        vue(),
        emberbox({
            url: 'https://planspiel.emberbox.app',
            logo: 'planspiel',
            prerender: {entry: 'src/prerender.ts', paths: ['/', '/hilfe']},
        }),
    ],
    server: {
        proxy: {
            '/api': {target: backend, changeOrigin: true, ws: true},
            '/tiles': {target: backend, changeOrigin: true},
        },
    },
})
