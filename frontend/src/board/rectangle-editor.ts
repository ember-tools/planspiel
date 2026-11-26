import L from 'leaflet'
import {toLatLng} from './geometry'
import type {LatLng} from './model'
import {cornersOf, frameOf, moved, resized, rotated, rotationHandle, type RectangleFrame} from './rectangle'

/** The handles of a rectangle being edited, and how to take them away again. */
export interface RectangleEditor {
    remove(): void
}

/** Marks the map while a handle is dragged, so the click that ends the drag selects nothing. */
export const HANDLE_DRAG = 'is-dragging-handle'
/** How long after a handle is let go the map still ignores clicks, in milliseconds. */
export const CLICK_GRACE = 150

function handleIcon(kind: 'corner' | 'rotate' | 'move'): L.DivIcon {
    return L.divIcon({className: `board-handle board-handle-${kind}`, iconSize: [14, 14], iconAnchor: [7, 7]})
}

/**
 * Handles to edit a rotated rectangle on the map: one per corner to resize it with the opposite
 * corner fixed, one above it to turn it, and one in the middle to move it. While a handle is
 * dragged the shape follows at once; when it is let go, `commit` receives the new corners.
 */
export function editRectangle(
    map: L.Map,
    shape: L.Polygon | L.Polyline,
    points: LatLng[],
    commit: (points: LatLng[]) => void,
): RectangleEditor {
    let frame: RectangleFrame = frameOf(points)
    const group = L.layerGroup().addTo(map)
    const corners = [0, 1, 2, 3].map(() => L.marker([0, 0], {icon: handleIcon('corner'), draggable: true, keyboard: false}))
    const turn = L.marker([0, 0], {icon: handleIcon('rotate'), draggable: true, keyboard: false})
    const middle = L.marker([0, 0], {icon: handleIcon('move'), draggable: true, keyboard: false})
    for (const handle of [...corners, turn, middle]) handle.addTo(group)

    function place(): void {
        const cornerPoints = cornersOf(frame)
        corners.forEach((handle, index) => handle.setLatLng(cornerPoints[index]!))
        turn.setLatLng(rotationHandle(frame))
        middle.setLatLng(frame.center)
        shape.setLatLngs(cornerPoints)
    }

    function follow(handle: L.Marker, next: (position: LatLng) => RectangleFrame): void {
        handle.on('dragstart', () => map.getContainer().classList.add(HANDLE_DRAG))
        handle.on('drag', () => {
            frame = next(toLatLng(handle.getLatLng()))
            place()
        })
        handle.on('dragend', () => {
            commit(cornersOf(frame))
            setTimeout(() => map.getContainer().classList.remove(HANDLE_DRAG), CLICK_GRACE)
        })
    }

    corners.forEach((handle, index) => follow(handle, position => resized(frame, index, position)))
    follow(turn, position => rotated(frame, position))
    follow(middle, position => moved(frame, position))
    place()

    return {
        remove(): void {
            group.remove()
        },
    }
}
