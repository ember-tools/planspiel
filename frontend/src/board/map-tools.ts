import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import L from 'leaflet'
import {onBeforeUnmount, watch} from 'vue'
import {t} from '../i18n'
import {addFeature, placeVehicle, type NewFeature} from './edits'
import {shapePoints, toLatLng} from './geometry'
import {atLeastMinimum, cornersOf, frameOf, upright} from './rectangle'
import {HANDLE_DRAG} from './rectangle-editor'
import type {LatLng} from './model'
import {boardState, commit, currentSnapshot, select, useTool, type Tool} from './store'

/** The data type a vehicle carries while it is dragged from the side panel onto the map. */
export const VEHICLE_DRAG_TYPE = 'application/x-planspiel-vehicle'

/** Adds a feature at the current snapshot, selects it and puts the select tool back in hand. */
function createFeature(feature: NewFeature, points: LatLng[], text = ''): void {
    const board = boardState.board
    const snapshot = currentSnapshot.value
    if (!board || !snapshot) return
    const {id, operations} = addFeature(board, snapshot.id, feature, {points, text})
    commit(operations)
    useTool({kind: 'select'})
    select({kind: 'feature', id})
}

/** What a click on the map does with the tool in hand. */
function clickWith(tool: Tool, position: LatLng): void {
    const snapshot = currentSnapshot.value
    if (!snapshot) return
    switch (tool.kind) {
        case 'select':
            select(null)
            return
        case 'place-vehicle':
            if (boardState.board) commit(placeVehicle(boardState.board, snapshot.id, tool.vehicleId, position))
            useTool({kind: 'select'})
            select({kind: 'vehicle', id: tool.vehicleId})
            return
        case 'place-mark':
            createFeature({kind: 'mark', mark: tool.mark}, [position])
            return
        case 'place-text':
            createFeature({kind: 'text'}, [position], t('board.newText'))
            return
        default:
            return
    }
}

/**
 * Connects the tool in hand to the map: clicks place vehicles, marks and texts, Geoman draws
 * lines and areas, vehicles can be dropped onto the map from the side panel, and Escape puts
 * the select tool back.
 */
export function useMapTools(map: L.Map): void {
    const container = map.getContainer()
    map.pm.setGlobalOptions({snappable: false, allowSelfIntersection: true})

    const stopWatching = watch(() => boardState.tool, tool => {
        map.pm.disableDraw()
        container.classList.toggle('is-placing', tool.kind !== 'select')
        if (tool.kind === 'draw-line') {
            map.pm.enableDraw('Line', {templineStyle: {className: `board-line-${tool.style}`}, finishOn: 'dblclick'})
        } else if (tool.kind === 'draw-area') {
            if (tool.style === 'staging') map.pm.enableDraw('Rectangle', {templineStyle: {className: 'board-area-staging'}})
            else map.pm.enableDraw('Polygon', {templineStyle: {className: `board-area-${tool.style}`}, finishOn: 'dblclick'})
        }
    }, {immediate: true})

    map.on('click', event => {
        if (!container.classList.contains(HANDLE_DRAG)) clickWith(boardState.tool, toLatLng(event.latlng))
    })

    map.on('pm:create', event => {
        const tool = boardState.tool
        const layer = event.layer as L.Polyline
        map.removeLayer(layer)
        const points = shapePoints(layer)
        if (tool.kind === 'draw-line') createFeature({kind: 'line', style: tool.style}, points)
        else if (tool.kind === 'draw-area' && tool.style === 'staging') {
            createFeature({kind: 'area', style: 'staging'}, cornersOf(atLeastMinimum(upright(frameOf(points)))))
        } else if (tool.kind === 'draw-area') createFeature({kind: 'area', style: tool.style}, points)
    })

    function onDragOver(event: DragEvent): void {
        if (event.dataTransfer?.types.includes(VEHICLE_DRAG_TYPE)) event.preventDefault()
    }

    function onDrop(event: DragEvent): void {
        const vehicleId = event.dataTransfer?.getData(VEHICLE_DRAG_TYPE)
        const snapshot = currentSnapshot.value
        const board = boardState.board
        if (!vehicleId || !snapshot || !board || !board.vehicles[vehicleId] || boardState.readOnly) return
        event.preventDefault()
        commit(placeVehicle(board, snapshot.id, vehicleId, toLatLng(map.mouseEventToLatLng(event))))
        select({kind: 'vehicle', id: vehicleId})
    }

    function onKey(event: KeyboardEvent): void {
        if (event.key !== 'Escape' || boardState.tool.kind === 'select') return
        event.preventDefault()
        useTool({kind: 'select'})
    }

    container.addEventListener('dragover', onDragOver)
    container.addEventListener('drop', onDrop)
    window.addEventListener('keydown', onKey)

    onBeforeUnmount(() => {
        stopWatching()
        map.pm.disableDraw()
        container.removeEventListener('dragover', onDragOver)
        container.removeEventListener('drop', onDrop)
        window.removeEventListener('keydown', onKey)
    })
}
