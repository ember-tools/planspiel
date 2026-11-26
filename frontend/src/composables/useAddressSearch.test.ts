import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {createApp, h} from 'vue'
import type {Place} from '../api/geocode'
import {useAddressSearch} from './useAddressSearch'

const BERLIN: Place[] = [{label: 'Pariser Platz, 10117 Berlin', lat: 52.5163, lon: 13.3777}]
const HAMBURG: Place[] = [{label: 'Rathausmarkt, 20095 Hamburg', lat: 53.5503, lon: 9.9925}]

/** Runs the search state inside a component, as it runs in the page. */
function searching(): ReturnType<typeof useAddressSearch> {
    let state!: ReturnType<typeof useAddressSearch>
    createApp({setup: () => { state = useAddressSearch(); return () => h('div') }}).mount(document.createElement('div'))
    return state
}

function request(call: number): RequestInit {
    return vi.mocked(fetch).mock.calls[call]![1]!
}

describe('useAddressSearch', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(BERLIN))))
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
    })

    it('asks the server once the typing pauses, never for fewer than three letters', async () => {
        const search = searching()
        search.text.value = 'Pa'
        await vi.advanceTimersByTimeAsync(1000)
        expect(fetch).not.toHaveBeenCalled()
        expect(search.emptyText.value).toBe('Mindestens drei Zeichen eingeben')
        search.text.value = 'Par'
        await vi.advanceTimersByTimeAsync(100)
        search.text.value = 'Pariser'
        await vi.advanceTimersByTimeAsync(299)
        expect(fetch).not.toHaveBeenCalled()
        expect(search.emptyText.value).toBe('Suche läuft …')
        await vi.advanceTimersByTimeAsync(1)
        expect(fetch).toHaveBeenCalledTimes(1)
        expect(request(0).method).toBe('POST')
        expect(JSON.parse(request(0).body as string)).toEqual({q: 'Pariser'})
        expect(search.places.value).toEqual(BERLIN)
    })

    it('drops a search the text has moved past, even when its answer comes late', async () => {
        let answerFirst!: (response: Response) => void
        vi.mocked(fetch)
            .mockImplementationOnce(() => new Promise(resolve => { answerFirst = resolve }))
            .mockImplementationOnce(async () => new Response(JSON.stringify(HAMBURG)))
        const search = searching()
        search.text.value = 'Pariser'
        await vi.advanceTimersByTimeAsync(300)
        search.text.value = 'Rathausmarkt'
        await vi.advanceTimersByTimeAsync(0)
        expect(request(0).signal!.aborted).toBe(true)
        await vi.advanceTimersByTimeAsync(300)
        answerFirst(new Response(JSON.stringify(BERLIN)))
        await vi.advanceTimersByTimeAsync(0)
        expect(search.places.value).toEqual(HAMBURG)
        expect(search.loading.value).toBe(false)
    })

    it('says so when the search is not available', async () => {
        vi.mocked(fetch).mockImplementation(async () => new Response('', {status: 502}))
        const search = searching()
        search.text.value = 'Pariser'
        await vi.advanceTimersByTimeAsync(300)
        expect(search.places.value).toEqual([])
        expect(search.emptyText.value).toBe('Die Suche ist gerade nicht verfügbar')
    })

    it('clears the results once the text is shorter than three letters again', async () => {
        const search = searching()
        search.text.value = 'Pariser'
        await vi.advanceTimersByTimeAsync(300)
        search.text.value = 'Pa'
        await vi.advanceTimersByTimeAsync(0)
        expect(search.places.value).toEqual([])
    })
})
