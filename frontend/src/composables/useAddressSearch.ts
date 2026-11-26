import {computed, onBeforeUnmount, ref, shallowRef, watch} from 'vue'
import {MIN_SEARCH, searchPlaces, type Place} from '../api/geocode'
import {t} from '../i18n'

const DEBOUNCE_MS = 300

/**
 * The state of an address search: the text typed, the places found for it and what to say while
 * there are none. The server is asked after a short pause in typing; a search still running is
 * dropped when the text changes, and its late answer never replaces a newer one.
 */
export function useAddressSearch() {
    const text = ref('')
    const places = shallowRef<Place[]>([])
    const loading = ref(false)
    const failed = ref(false)
    let timer: ReturnType<typeof setTimeout> | undefined
    let running: AbortController | undefined

    const emptyText = computed(() => {
        if (loading.value) return t('search.searching')
        if (failed.value) return t('search.unavailable')
        return text.value.trim().length < MIN_SEARCH ? t('search.hint') : t('search.none')
    })

    async function search(query: string): Promise<void> {
        const controller = new AbortController()
        running = controller
        try {
            const found = await searchPlaces(query, controller.signal)
            if (controller.signal.aborted) return
            places.value = found
            failed.value = false
        } catch {
            if (controller.signal.aborted) return
            places.value = []
            failed.value = true
        } finally {
            if (running === controller) loading.value = false
        }
    }

    watch(text, query => {
        clearTimeout(timer)
        running?.abort()
        running = undefined
        const trimmed = query.trim()
        failed.value = false
        if (trimmed.length < MIN_SEARCH) {
            places.value = []
            loading.value = false
            return
        }
        loading.value = true
        timer = setTimeout(() => void search(trimmed), DEBOUNCE_MS)
    })

    onBeforeUnmount(() => {
        clearTimeout(timer)
        running?.abort()
    })

    return {text, places, loading, failed, emptyText}
}
