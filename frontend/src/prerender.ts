import {renderPage} from '@emberbox/ui/prerender'
import {createSSRApp} from 'vue'
import {createMemoryHistory} from 'vue-router'
import App from './App.vue'
import {i18n} from './i18n'
import {createAppRouter} from './router'

/** Prerenders one public page of the tool. */
export async function render(path: string, template: string): Promise<string> {
    const router = createAppRouter(createMemoryHistory())
    const app = createSSRApp(App).use(router).use(i18n)
    await router.push(path)
    await router.isReady()
    return renderPage(app, template)
}
