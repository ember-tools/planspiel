import L from 'leaflet'
import {TILE_LAYER_OPTIONS, TILE_RETRIES, TILE_URL, retryDelay} from './tiles'

/**
 * The map's tile layer. A tile the server refused, because too many new tiles were asked for at
 * once, or could not fetch in time is asked for again a few times with growing waits, instead of
 * leaving a gap in the map until the next pan.
 */
export function createTileLayer(): L.TileLayer {
    const layer = L.tileLayer(TILE_URL, TILE_LAYER_OPTIONS)
    layer.on('tileerror', event => {
        const tile = event.tile as HTMLImageElement
        const attempt = Number(tile.dataset.attempt ?? '0') + 1
        if (attempt > TILE_RETRIES) return
        tile.dataset.attempt = String(attempt)
        setTimeout(() => {
            if (tile.isConnected) tile.src = `${layer.getTileUrl(event.coords)}?attempt=${attempt}`
        }, retryDelay(attempt))
    })
    return layer
}
