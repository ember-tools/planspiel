import L from 'leaflet'
import {onBeforeUnmount, watchEffect} from 'vue'
import {drawFeature, moveSquad, placeVehicle} from './edits'
import {shapePoints, toLatLng} from './geometry'
import {featureMarker, squadMarker, symbolSize, vehicleMarker, type MarkerContent} from './markers'
import type {Feature, LatLng} from './model'
import {boardState, commit, currentSnapshot, select, type Selection} from './store'

/** One marker the map should show. */
interface WantedMarker {
    position: LatLng
    content: MarkerContent
    draggable: boolean
    onMove: (position: LatLng) => void
    selection: Selection
}

/** A marker the map shows, with what it was last drawn from. */
interface ShownMarker {
    layer: L.Marker
    html: string
    draggable: boolean
}

/** One line or area the map should show. */
interface WantedShape {
    feature: Feature
    points: LatLng[]
    text: string
    selected: boolean
}

/** A line or an area layer. */
type ShapeLayer = L.Polyline | L.Polygon

/** A line or area the map shows, with what it was last drawn from. */
interface ShownShape {
    layer: ShapeLayer
    key: string
    editing: boolean
}

function samePosition(layer: L.Marker, [lat, lng]: LatLng): boolean {
    const current = layer.getLatLng()
    return current.lat === lat && current.lng === lng
}

function isSelected(selection: Selection): boolean {
    const current = boardState.selection
    return current?.kind === selection.kind && current.id === selection.id
}

/** Every marker the current snapshot needs: vehicles on scene, dismounted squads, marks and texts. */
function wantedMarkers(): Map<string, WantedMarker> {
    const board = boardState.board
    const snapshot = currentSnapshot.value
    const wanted = new Map<string, WantedMarker>()
    if (!board || !snapshot) return wanted
    const editable = !boardState.readOnly
    for (const vehicle of Object.values(board.vehicles)) {
        const placed = snapshot.vehicles[vehicle.id]
        if (placed) {
            const selection: Selection = {kind: 'vehicle', id: vehicle.id}
            wanted.set(`vehicle:${vehicle.id}`, {
                position: placed.position,
                content: vehicleMarker(board, snapshot.id, vehicle, isSelected(selection)),
                draggable: editable,
                onMove: position => commit(placeVehicle(board, snapshot.id, vehicle.id, position)),
                selection,
            })
        }
        for (const squad of Object.values(vehicle.squads)) {
            const dismounted = snapshot.squads[squad.id]
            if (!dismounted) continue
            const selection: Selection = {kind: 'squad', id: squad.id}
            wanted.set(`squad:${squad.id}`, {
                position: dismounted.position,
                content: squadMarker(vehicle, squad, isSelected(selection)),
                draggable: editable,
                onMove: position => commit(moveSquad(snapshot.id, squad.id, position)),
                selection,
            })
        }
    }
    for (const feature of Object.values(board.features)) {
        const drawn = snapshot.features[feature.id]
        if (!drawn || (feature.kind !== 'mark' && feature.kind !== 'text') || !drawn.points[0]) continue
        const selection: Selection = {kind: 'feature', id: feature.id}
        wanted.set(`feature:${feature.id}`, {
            position: drawn.points[0],
            content: featureMarker(feature, drawn.text, isSelected(selection)),
            draggable: editable,
            onMove: position => commit(drawFeature(snapshot.id, feature.id, {...drawn, points: [position]})),
            selection,
        })
    }
    return wanted
}

/** Every line and area the current snapshot needs. */
function wantedShapes(): Map<string, WantedShape> {
    const board = boardState.board
    const snapshot = currentSnapshot.value
    const wanted = new Map<string, WantedShape>()
    if (!board || !snapshot) return wanted
    for (const feature of Object.values(board.features)) {
        const drawn = snapshot.features[feature.id]
        if (!drawn || (feature.kind !== 'line' && feature.kind !== 'area')) continue
        const selected = boardState.selection?.kind === 'feature' && boardState.selection.id === feature.id
        wanted.set(feature.id, {feature, points: drawn.points, text: drawn.text, selected})
    }
    return wanted
}

function shapeClass(feature: Feature, selected: boolean): string {
    const style = feature.kind === 'line' || feature.kind === 'area' ? feature.style : ''
    return `board-shape board-${feature.kind} board-${feature.kind}-${style}${selected ? ' is-selected' : ''}`
}

/**
 * Keeps the layers of a Leaflet map in step with the board: one marker per vehicle on scene,
 * dismounted squad, mark and text, and one shape per line and area of the shown snapshot. Layers
 * are updated in place rather than rebuilt, so a marker being dragged is never replaced under the
 * pointer. Dragging a marker or editing a shape commits the new position. Symbols grow and shrink
 * with the zoom through the `--board-symbol` width on the map container.
 */
export function useBoardLayers(map: L.Map): void {
    const markerGroup = L.layerGroup().addTo(map)
    const shapeGroup = L.featureGroup().addTo(map)
    const markers = new Map<string, ShownMarker>()
    const shapes = new Map<string, ShownShape>()
    const handlers = new Map<string, WantedMarker>()

    function syncMarkers(): void {
        const wanted = wantedMarkers()
        for (const [key, shown] of markers) {
            if (wanted.has(key)) continue
            markerGroup.removeLayer(shown.layer)
            markers.delete(key)
            handlers.delete(key)
        }
        for (const [key, want] of wanted) {
            handlers.set(key, want)
            const shown = markers.get(key)
            if (!shown) {
                const layer = L.marker(want.position, {
                    icon: L.divIcon({html: want.content.html, className: 'board-icon', iconSize: undefined, iconAnchor: [0, 0]}),
                    draggable: want.draggable,
                    keyboard: false,
                    autoPan: true,
                })
                layer.on('dragend', () => handlers.get(key)?.onMove(toLatLng(layer.getLatLng())))
                layer.on('click', () => {
                    const handler = handlers.get(key)
                    if (handler && boardState.tool.kind === 'select') select(handler.selection)
                })
                layer.addTo(markerGroup)
                markers.set(key, {layer, html: want.content.html, draggable: want.draggable})
                continue
            }
            if (!samePosition(shown.layer, want.position)) shown.layer.setLatLng(want.position)
            if (shown.html !== want.content.html) {
                shown.layer.setIcon(L.divIcon({html: want.content.html, className: 'board-icon', iconSize: undefined, iconAnchor: [0, 0]}))
                shown.html = want.content.html
            }
            if (shown.draggable !== want.draggable) {
                if (want.draggable) shown.layer.dragging?.enable()
                else shown.layer.dragging?.disable()
                shown.draggable = want.draggable
            }
            shown.layer.setZIndexOffset(want.content.selected ? 1000 : 0)
        }
    }

    function createShape(id: string, want: WantedShape): ShapeLayer {
        const options = {className: shapeClass(want.feature, want.selected), interactive: true}
        const layer = want.feature.kind === 'area' ? L.polygon(want.points, options) : L.polyline(want.points, options)
        layer.on('click', event => {
            L.DomEvent.stopPropagation(event)
            if (boardState.tool.kind === 'select') select({kind: 'feature', id})
        })
        layer.on('pm:edit', () => {
            const snapshot = currentSnapshot.value
            const drawn = snapshot?.features[id]
            if (!snapshot || !drawn) return
            commit(drawFeature(snapshot.id, id, {...drawn, points: shapePoints(layer)}))
        })
        return layer
    }

    function syncShapes(): void {
        const wanted = wantedShapes()
        for (const [id, shown] of shapes) {
            if (wanted.has(id)) continue
            shapeGroup.removeLayer(shown.layer)
            shapes.delete(id)
        }
        for (const [id, want] of wanted) {
            const key = JSON.stringify([want.feature, want.selected])
            const shown = shapes.get(id)
            if (shown?.key === key) {
                if (JSON.stringify(shapePoints(shown.layer)) !== JSON.stringify(want.points)) {
                    if (shown.editing) shown.layer.pm?.disable()
                    shown.layer.setLatLngs(want.points)
                    if (shown.editing) shown.layer.pm?.enable({allowSelfIntersection: true})
                }
                continue
            }
            if (shown) {
                shown.layer.pm?.disable()
                shapeGroup.removeLayer(shown.layer)
            }
            const layer = createShape(id, want)
            layer.addTo(shapeGroup)
            const editing = want.selected && !boardState.readOnly
            if (editing) layer.pm?.enable({allowSelfIntersection: true})
            shapes.set(id, {layer, key, editing})
        }
    }

    function scaleSymbols(): void {
        map.getContainer().style.setProperty('--board-symbol', `${symbolSize(map.getZoom())}px`)
    }

    scaleSymbols()
    map.on('zoomend', scaleSymbols)

    const stop = watchEffect(() => {
        syncShapes()
        syncMarkers()
    })

    onBeforeUnmount(() => {
        stop()
        map.off('zoomend', scaleSymbols)
        markerGroup.remove()
        shapeGroup.remove()
    })
}
