import {onBeforeUnmount, onMounted, ref, watch, type Ref} from 'vue'
import {inControl} from '../board/keys'

/** The class on the document root while a board is presented; it stops the page behind from scrolling. */
export const PRESENTING_CLASS = 'is-presenting'

/**
 * The presentation mode of a board: the page goes into the browser's full screen where the
 * browser offers it, header and footer disappear and the board fills the screen; the side panel
 * can be hidden with a button or the `S` key. The whole document goes full screen, not the board
 * alone, so dialogs and menus, which are drawn at the end of the page, stay visible.
 *
 * Leaving the browser's full screen by any way ends the mode, and so does the board disappearing.
 * Without the browser's full screen, `Esc` ends the mode when `escapeEnds` allows it, so it does
 * not also take the tool in hand away.
 *
 * @param stage the element of the board, which ends the mode when it goes away
 * @param escapeEnds whether `Esc` may end a presentation outside the browser's full screen now
 */
export function usePresentation(stage: Ref<HTMLElement | null>, escapeEnds: () => boolean = () => true) {
    const presenting = ref(false)
    const sidebar = ref(true)

    function show(on: boolean): void {
        presenting.value = on
        sidebar.value = true
        document.documentElement.classList.toggle(PRESENTING_CLASS, on)
    }

    async function start(): Promise<void> {
        show(true)
        const root = document.documentElement
        if (root.requestFullscreen && !document.fullscreenElement) await root.requestFullscreen().catch(() => undefined)
    }

    async function stop(): Promise<void> {
        show(false)
        if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined)
    }

    function toggleSidebar(): void {
        sidebar.value = !sidebar.value
    }

    function onFullscreenChange(): void {
        if (!document.fullscreenElement && presenting.value) show(false)
    }

    function onKey(event: KeyboardEvent): void {
        if (!presenting.value || event.defaultPrevented || event.repeat) return
        if (event.ctrlKey || event.metaKey || event.altKey || inControl(event)) return
        if (event.key === 'Escape' && !document.fullscreenElement && escapeEnds()) {
            void stop()
        } else if (event.key === 's' || event.key === 'S') {
            event.preventDefault()
            toggleSidebar()
        }
    }

    watch(stage, element => {
        if (!element && presenting.value) void stop()
    })

    onMounted(() => {
        document.addEventListener('fullscreenchange', onFullscreenChange)
        window.addEventListener('keydown', onKey)
    })

    onBeforeUnmount(() => {
        document.removeEventListener('fullscreenchange', onFullscreenChange)
        window.removeEventListener('keydown', onKey)
        if (presenting.value) void stop()
    })

    return {presenting, sidebar, start, stop, toggleSidebar}
}
