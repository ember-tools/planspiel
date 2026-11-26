/**
 * Where map tiles come from: the tool's own server, which fetches them from OpenStreetMap on
 * demand, so the browser never connects to a third party.
 */
export const TILE_URL = '/tiles/{z}/{x}/{y}.png'

/** The attribution OpenStreetMap's tiles require. */
export const TILE_ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

/** The zoom levels the tile server serves; OpenStreetMap draws no tiles beyond 19. */
export const TILE_MIN_ZOOM = 10
export const TILE_MAX_ZOOM = 19

/** How far the map zooms in: past the last tile level, the tiles of that level are enlarged. */
export const MAP_MAX_ZOOM = 21

/** The box around Germany the tile server serves, as south-west and north-east corners. */
export const TILE_BOUNDS: [[number, number], [number, number]] = [[47.2, 5.8], [55.1, 15.1]]

/** Where a new board opens: Berlin, the default region. */
export const DEFAULT_CENTER: [number, number] = [52.52, 13.405]
export const DEFAULT_ZOOM = 14

/** Map options that keep a map inside the tiles the server serves. */
export const MAP_LIMITS = {
    minZoom: TILE_MIN_ZOOM,
    maxZoom: MAP_MAX_ZOOM,
    maxBounds: TILE_BOUNDS,
    maxBoundsViscosity: 1,
}

/** Tile layer options matching the tiles the server serves. */
export const TILE_LAYER_OPTIONS = {
    minZoom: TILE_MIN_ZOOM,
    maxZoom: MAP_MAX_ZOOM,
    maxNativeZoom: TILE_MAX_ZOOM,
    bounds: TILE_BOUNDS,
    attribution: TILE_ATTRIBUTION,
}

/** How often a tile that failed to load is asked for again, and how long the first wait is: a
 * little longer than the `Retry-After` the server sends with a refusal. */
export const TILE_RETRIES = 3
export const TILE_RETRY_DELAY = 5000

/**
 * The delay before retry number `attempt` (counting from 1): doubling each time, so a burst of
 * refused tiles spreads out instead of being refused again all at once.
 */
export function retryDelay(attempt: number): number {
    return TILE_RETRY_DELAY * 2 ** (attempt - 1)
}
