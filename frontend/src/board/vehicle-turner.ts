import L from 'leaflet'
import {normalHeading} from './edits'
import {CLICK_GRACE, HANDLE_DRAG} from './rectangle-editor'

/** The handle that turns a selected vehicle, and how to take it away again. */
export interface VehicleTurner {
    /** Puts the handle in front of the vehicle again; ignored while the handle is dragged. */
    place(heading: number): void
    /** Whether the handle is being dragged right now. */
    dragging(): boolean
    remove(): void
}

/** What a turning handle reports while and after it is dragged. */
export interface TurnCallbacks {
    /** A drag begins. */
    start(): void
    /** The heading the vehicle would have if the handle were let go now. */
    preview(heading: number): void
    /** The handle was let go at this heading. */
    commit(heading: number): void
}

const GAP = 22
const SNAP_DEGREES = 15

/** The heading pointing from one map point to another, in degrees clockwise from north. */
export function headingTowards(from: L.Point, to: L.Point): number {
    return normalHeading(Math.atan2(to.x - from.x, from.y - to.y) * 180 / Math.PI)
}

/** A heading snapped to the nearest multiple of 15 degrees. */
export function snapped(heading: number): number {
    return normalHeading(Math.round(heading / SNAP_DEGREES) * SNAP_DEGREES)
}

/**
 * A handle in front of a selected vehicle: dragging it round the vehicle turns the vehicle, with
 * the Shift key held in steps of 15 degrees. Taking the handle away in the middle of a drag drops
 * that turn and leaves the map clickable again.
 */
export function turnVehicleHandle(map: L.Map, vehicle: L.Marker, heading: number, callbacks: TurnCallbacks): VehicleTurner {
    const handle = L.marker([0, 0], {
        icon: L.divIcon({className: 'board-handle board-handle-rotate', iconSize: [14, 14], iconAnchor: [7, 7]}),
        draggable: true,
        keyboard: false,
        zIndexOffset: 2000,
    }).addTo(map)
    let current = heading
    let held = false

    /** How far in front of the vehicle's centre the handle sits, in pixels. */
    function reach(): number {
        const symbol = vehicle.getElement()?.querySelector<HTMLElement>('.board-marker-symbol')
        return (symbol?.offsetWidth ?? 48) / 2 + GAP
    }

    function put(at: number): void {
        current = at
        const centre = map.latLngToLayerPoint(vehicle.getLatLng())
        const radians = at * Math.PI / 180
        const point = centre.add(L.point(Math.sin(radians), -Math.cos(radians)).multiplyBy(reach()))
        handle.setLatLng(map.layerPointToLatLng(point))
    }

    function release(): void {
        held = false
        setTimeout(() => map.getContainer().classList.remove(HANDLE_DRAG), CLICK_GRACE)
    }

    handle.on('dragstart', () => {
        held = true
        map.getContainer().classList.add(HANDLE_DRAG)
        callbacks.start()
    })
    handle.on('drag', event => {
        const free = headingTowards(map.latLngToLayerPoint(vehicle.getLatLng()), map.latLngToLayerPoint(handle.getLatLng()))
        const shift = ((event as L.LeafletEvent & {originalEvent?: MouseEvent}).originalEvent)?.shiftKey ?? false
        current = shift ? snapped(free) : free
        callbacks.preview(current)
    })
    handle.on('dragend', () => {
        release()
        callbacks.commit(current)
        put(current)
    })
    const follow = () => {
        if (!held) put(current)
    }
    map.on('zoomend', follow)
    vehicle.on('move', follow)
    put(heading)

    return {
        place(at: number): void {
            if (!held) put(at)
        },
        dragging: () => held,
        remove(): void {
            if (held) release()
            map.off('zoomend', follow)
            vehicle.off('move', follow)
            handle.remove()
        },
    }
}
