import type L from 'leaflet'
import type {LatLng} from './model'

/** A Leaflet point as the board stores it. */
export function toLatLng(point: L.LatLng): LatLng {
    return [point.lat, point.lng]
}

/** The points of a line, or of the outer ring of an area. */
export function shapePoints(layer: L.Polyline | L.Polygon): LatLng[] {
    const raw = layer.getLatLngs()
    const ring = (Array.isArray(raw[0]) ? raw[0] : raw) as L.LatLng[]
    return ring.map(toLatLng)
}
