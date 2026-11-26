import {afterEach, describe, expect, it, vi} from 'vitest'
import {createApp, h, nextTick, ref, type Ref} from 'vue'
import {PRESENTING_CLASS, usePresentation} from './usePresentation'

let fullscreen: Element | null = null

/** Lets the document report `fullscreenElement` as the test sets it. */
function trackFullscreen(): void {
    fullscreen = null
    Object.defineProperty(document, 'fullscreenElement', {configurable: true, get: () => fullscreen})
}

/** Mounts a component using the presentation mode and hands back its controls. */
function mounted(stage: Ref<HTMLElement | null> = ref(document.createElement('div')), escapeEnds?: () => boolean) {
    let controls!: ReturnType<typeof usePresentation>
    const app = createApp({setup: () => { controls = usePresentation(stage, escapeEnds); return () => h('div') }})
    app.mount(document.createElement('div'))
    return {controls, app}
}

function press(key: string, options: KeyboardEventInit = {}, target: EventTarget = window): void {
    target.dispatchEvent(new KeyboardEvent('keydown', {key, cancelable: true, bubbles: true, ...options}))
}

afterEach(() => {
    Reflect.deleteProperty(document, 'fullscreenElement')
    Reflect.deleteProperty(document.documentElement, 'requestFullscreen')
    Reflect.deleteProperty(document, 'exitFullscreen')
    document.documentElement.classList.remove(PRESENTING_CLASS)
})

describe('usePresentation', () => {
    it('puts the whole document into full screen and ends when the browser leaves it', async () => {
        trackFullscreen()
        const root = document.documentElement
        root.requestFullscreen = vi.fn(async () => { fullscreen = root })
        const {controls, app} = mounted()
        await controls.start()
        expect(root.requestFullscreen).toHaveBeenCalled()
        expect(root.classList.contains(PRESENTING_CLASS)).toBe(true)
        press('Escape')
        expect(controls.presenting.value).toBe(true)
        fullscreen = null
        document.dispatchEvent(new Event('fullscreenchange'))
        expect(controls.presenting.value).toBe(false)
        expect(root.classList.contains(PRESENTING_CLASS)).toBe(false)
        app.unmount()
    })

    it('presents in the window when the browser refuses full screen', async () => {
        trackFullscreen()
        document.documentElement.requestFullscreen = vi.fn(() => Promise.reject(new Error('denied')))
        const {controls, app} = mounted()
        await controls.start()
        expect(controls.presenting.value).toBe(true)
        app.unmount()
    })

    it('toggles the side panel with S, but not in controls, with modifiers or on repeat', async () => {
        trackFullscreen()
        const {controls, app} = mounted()
        await controls.start()
        press('s')
        expect(controls.sidebar.value).toBe(false)
        press('S', {ctrlKey: true})
        press('s', {repeat: true})
        const field = document.createElement('input')
        document.body.append(field)
        press('s', {}, field)
        field.remove()
        expect(controls.sidebar.value).toBe(false)
        press('S')
        expect(controls.sidebar.value).toBe(true)
        app.unmount()
    })

    it('shows the side panel again once the presentation ends', async () => {
        trackFullscreen()
        const {controls, app} = mounted()
        await controls.start()
        controls.toggleSidebar()
        await controls.stop()
        expect(controls.sidebar.value).toBe(true)
        app.unmount()
    })

    it('leaves Escape to the tool in hand outside the browser\'s full screen', async () => {
        trackFullscreen()
        let toolInHand = true
        const {controls, app} = mounted(undefined, () => !toolInHand)
        await controls.start()
        press('Escape')
        expect(controls.presenting.value).toBe(true)
        toolInHand = false
        press('Escape')
        expect(controls.presenting.value).toBe(false)
        app.unmount()
    })

    it('ends when the board goes away and when the page is left', async () => {
        trackFullscreen()
        const stage = ref<HTMLElement | null>(document.createElement('div'))
        const {controls, app} = mounted(stage)
        await controls.start()
        stage.value = null
        await nextTick()
        expect(controls.presenting.value).toBe(false)
        const root = document.documentElement
        root.requestFullscreen = vi.fn(async () => { fullscreen = root })
        const exit = vi.fn(async () => { fullscreen = null })
        document.exitFullscreen = exit
        await controls.start()
        app.unmount()
        expect(exit).toHaveBeenCalled()
        expect(root.classList.contains(PRESENTING_CLASS)).toBe(false)
        press('s')
        expect(controls.sidebar.value).toBe(true)
    })
})
