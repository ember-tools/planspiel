/** A place the address search found. */
export interface Place {
    label: string
    lat: number
    lon: number
}

/** Raised when the address search cannot answer right now. */
export class SearchUnavailableError extends Error {
    constructor(readonly status: number) {
        super(`Address search failed with status ${status}`)
    }
}

/** The shortest search text the server takes. */
export const MIN_SEARCH = 3

/** The longest search text the server takes. */
export const MAX_SEARCH = 120

/**
 * Searches places by address or name. The server asks Photon on the browser's behalf, so the
 * browser never connects to a third party; the text goes in the body, so no proxy logs it.
 */
export async function searchPlaces(text: string, signal?: AbortSignal): Promise<Place[]> {
    const response = await fetch('/api/geocode', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({q: text}),
        signal,
    })
    if (!response.ok) throw new SearchUnavailableError(response.status)
    return await response.json() as Place[]
}
