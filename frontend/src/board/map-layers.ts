import L from 'leaflet'
import {onBeforeUnmount, watchEffect} from 'vue'
import {ANIMATION_MS, animate, between, betweenLines} from './animation'
import {drawFeature, moveSquad, placeVehicle, vehicleOfSquad} from './edits'
import {shapePoints, toLatLng} from './geometry'
import {betweenFrames, cornersOf, frameOf, isRectangle} from './rectangle'
import {editRectangle, type RectangleEditor} from './rectangle-editor'
import {featureMarker, squadMarker, symbolSize, vehicleMarker, type MarkerContent} from './markers'
import type {Feature, LatLng} from './model'
import {boardState, commit, currentSnapshot, select, viewerSettings, type Selection} from './store'
import {escapeSvg} from '@emberbox/ui'

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
    label: string
    style: string
    rectangle?: RectangleEditor
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
 *
 * When the shown snapshot changes and the viewer has animation on, everything moves from where it
 * was to where it is now: a squad that dismounts walks out of its vehicle, one that mounts walks
 * back in, lines and areas with the same number of points reshape, and whatever appears or goes
 * away fades. Any other change, such as an edit, takes effect at once.
 */
export function useBoardLayers(map: L.Map): void {
    const markerGroup = L.layerGroup().addTo(map)
    const shapeGroup = L.featureGroup().addTo(map)
    const markers = new Map<string, ShownMarker>()
    const shapes = new Map<string, ShownShape>()
    const handlers = new Map<string, WantedMarker>()
    const moving = new Map<string, {target: string, stop: () => void}>()
    let shownSnapshotId: string | null = null

    function stopMoving(key: string): void {
        moving.get(key)?.stop()
        moving.delete(key)
    }

    /** Moves a marker from where it is to a position over the animation time. */
    function moveMarker(key: string, layer: L.Marker, to: LatLng): void {
        stopMoving(key)
        const from = toLatLng(layer.getLatLng())
        const stop = animate(share => layer.setLatLng(between(from, to, share)), () => moving.delete(key))
        moving.set(key, {target: JSON.stringify(to), stop})
    }

    /** Fades a layer out and removes it once the animation time is over. */
    function fadeOut(layer: L.Layer, group: L.LayerGroup): void {
        const element = (layer as L.Marker | L.Path).getElement?.()
        element?.classList.add('is-leaving')
        setTimeout(() => group.removeLayer(layer), ANIMATION_MS)
    }

    /** The vehicle marker key a squad marker belongs to. */
    function vehicleKeyOf(key: string): string | null {
        const board = boardState.board
        if (!board || !key.startsWith('squad:')) return null
        const vehicle = vehicleOfSquad(board, key.slice('squad:'.length))
        return vehicle ? `vehicle:${vehicle.id}` : null
    }

    function createMarker(key: string, want: WantedMarker, position: LatLng): L.Marker {
        const layer = L.marker(position, {
            icon: L.divIcon({html: want.content.html, className: 'board-icon', iconSize: undefined, iconAnchor: [0, 0]}),
            draggable: want.draggable,
            keyboard: false,
            autoPan: true,
        })
        layer.on('dragstart', () => stopMoving(key))
        layer.on('dragend', () => handlers.get(key)?.onMove(toLatLng(layer.getLatLng())))
        layer.on('click', () => {
            const handler = handlers.get(key)
            if (handler && boardState.tool.kind === 'select') select(handler.selection)
        })
        return layer.addTo(markerGroup)
    }

    function syncMarkers(switching: boolean): void {
        const wanted = wantedMarkers()
        const before = new Map([...markers].map(([key, shown]) => [key, toLatLng(shown.layer.getLatLng())]))
        for (const [key, shown] of markers) {
            if (wanted.has(key)) continue
            stopMoving(key)
            markers.delete(key)
            handlers.delete(key)
            if (!switching) {
                markerGroup.removeLayer(shown.layer)
                continue
            }
            const vehicleKey = vehicleKeyOf(key)
            const into = vehicleKey ? wanted.get(vehicleKey)?.position : undefined
            if (into) moveMarker(key, shown.layer, into)
            fadeOut(shown.layer, markerGroup)
        }
        for (const [key, want] of wanted) {
            handlers.set(key, want)
            const shown = markers.get(key)
            if (!shown) {
                const vehicleKey = vehicleKeyOf(key)
                const from = switching && vehicleKey ? before.get(vehicleKey) : undefined
                const layer = createMarker(key, want, from ?? want.position)
                markers.set(key, {layer, html: want.content.html, draggable: want.draggable})
                if (switching) {
                    layer.getElement()?.classList.add('is-entering')
                    if (from) moveMarker(key, layer, want.position)
                }
                continue
            }
            const running = moving.get(key)
            if (switching && !samePosition(shown.layer, want.position)) {
                moveMarker(key, shown.layer, want.position)
            } else if (running?.target !== JSON.stringify(want.position) && !samePosition(shown.layer, want.position)) {
                stopMoving(key)
                shown.layer.setLatLng(want.position)
            }
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

    /** Reshapes a line or area to new points, over the animation time when switching snapshots. */
    function reshape(id: string, shown: ShownShape, points: LatLng[], switching: boolean): void {
        const key = `shape:${id}`
        const current = shapePoints(shown.layer)
        if (JSON.stringify(current) === JSON.stringify(points) || moving.get(key)?.target === JSON.stringify(points)) return
        stopMoving(key)
        const wasEditing = shown.editing
        stopEditing(shown)
        const finish = () => {
            shown.layer.setLatLngs(points)
            if (shown.label) shown.layer.openTooltip()
            if (wasEditing) startEditing(id, shown)
            moving.delete(key)
        }
        if (!switching || current.length !== points.length) {
            finish()
            return
        }
        const turning = shown.style === 'staging' && isRectangle(current) && isRectangle(points)
        const from = turning ? frameOf(current) : null
        const to = turning ? frameOf(points) : null
        const stop = animate(share => shown.layer.setLatLngs(from && to
            ? cornersOf(betweenFrames(from, to, share))
            : betweenLines(current, points, share)), finish)
        moving.set(key, {target: JSON.stringify(points), stop})
    }

    /**
     * Lets a shape be edited: a staging area with handles to move, resize and turn it as a
     * rectangle, any other line or area point by point with Geoman.
     */
    function startEditing(id: string, shown: ShownShape): void {
        if (shown.editing) return
        shown.editing = true
        const points = shapePoints(shown.layer)
        if (shown.style !== 'staging' || !isRectangle(points)) {
            shown.layer.pm?.enable({allowSelfIntersection: true})
            return
        }
        shown.rectangle = editRectangle(map, shown.layer, points, corners => {
            const snapshot = currentSnapshot.value
            const drawn = snapshot?.features[id]
            if (snapshot && drawn) commit(drawFeature(snapshot.id, id, {...drawn, points: corners}))
        })
    }

    function stopEditing(shown: ShownShape): void {
        if (!shown.editing) return
        shown.editing = false
        shown.layer.pm?.disable()
        shown.rectangle?.remove()
        shown.rectangle = undefined
    }

    /** Marks a shape as selected or not and lets it be edited while selected, keeping the layer. */
    function markSelected(id: string, shown: ShownShape, selected: boolean): void {
        shown.layer.getElement()?.classList.toggle('is-selected', selected)
        if (selected && !boardState.readOnly) startEditing(id, shown)
        else stopEditing(shown)
    }

    /** Shows the label of a line or area on the shape itself, or none. */
    function showLabel(shown: ShownShape, text: string): void {
        if (shown.label === text) return
        shown.label = text
        shown.layer.unbindTooltip()
        if (text) {
            shown.layer.bindTooltip(escapeSvg(text), {permanent: true, direction: 'center', className: 'board-shape-label'})
        }
    }

    function syncShapes(switching: boolean): void {
        const wanted = wantedShapes()
        for (const [id, shown] of shapes) {
            if (wanted.has(id)) continue
            stopMoving(`shape:${id}`)
            shapes.delete(id)
            stopEditing(shown)
            if (switching) fadeOut(shown.layer, shapeGroup)
            else shapeGroup.removeLayer(shown.layer)
        }
        for (const [id, want] of wanted) {
            const key = JSON.stringify(want.feature)
            const shown = shapes.get(id)
            if (shown?.key === key) {
                showLabel(shown, want.text)
                reshape(id, shown, want.points, switching)
                markSelected(id, shown, want.selected)
                continue
            }
            if (shown) {
                stopMoving(`shape:${id}`)
                stopEditing(shown)
                shapeGroup.removeLayer(shown.layer)
            }
            const layer = createShape(id, want)
            layer.addTo(shapeGroup)
            if (switching && !shown) layer.getElement()?.classList.add('is-entering')
            const style = want.feature.kind === 'area' || want.feature.kind === 'line' ? want.feature.style : ''
            const added: ShownShape = {layer, key, editing: false, label: '', style}
            showLabel(added, want.text)
            markSelected(id, added, want.selected)
            shapes.set(id, added)
        }
    }

    function scaleSymbols(): void {
        map.getContainer().style.setProperty('--board-symbol', `${symbolSize(map.getZoom())}px`)
    }

    scaleSymbols()
    map.on('zoomend', scaleSymbols)

    const stop = watchEffect(() => {
        const snapshotId = currentSnapshot.value?.id ?? null
        const switching = viewerSettings.animate && shownSnapshotId !== null && snapshotId !== shownSnapshotId
        shownSnapshotId = snapshotId
        syncShapes(switching)
        syncMarkers(switching)
    })

    onBeforeUnmount(() => {
        stop()
        for (const key of [...moving.keys()]) stopMoving(key)
        map.off('zoomend', scaleSymbols)
        markerGroup.remove()
        shapeGroup.remove()
    })
}
