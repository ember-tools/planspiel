import {defineConfig, mergeConfig} from 'vitest/config'
import viteConfig from './vite.config'

process.env.TZ = 'Europe/Berlin'

export default mergeConfig(viteConfig, defineConfig({
    test: {
        include: ['src/**/*.test.ts'],
        environment: 'happy-dom',
        server: {deps: {inline: ['@emberbox/ui', '@nuxt/ui']}},
    },
}))
