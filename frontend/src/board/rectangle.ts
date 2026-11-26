import type {LatLng} from './model'

/** A rotated rectangle on the map: its centre, size in metres and turn in degrees from east. */
export interface RectangleFrame {
    center: LatLng
    width: number
    height: number
    angle: number
}

/** A point relative to a rectangle's centre in metres, east and north. */
type Local = [number, number]

const METRES_PER_DEGREE = 111_320

/** The smallest a side may get when resizing, in metres, so a rectangle never collapses. */
export const MIN_SIDE = 5

function toLocal(center: LatLng, [lat, lng]: LatLng): Local {
    const east = (lng - center[1]) * METRES_PER_DEGREE * Math.cos(center[0] * Math.PI / 180)
    const north = (lat - center[0]) * METRES_PER_DEGREE
    return [east, north]
}

function fromLocal(center: LatLng, [east, north]: Local): LatLng {
    return [
        center[0] + north / METRES_PER_DEGREE,
        center[1] + east / (METRES_PER_DEGREE * Math.cos(center[0] * Math.PI / 180)),
    ]
}

function turn([x, y]: Local, degrees: number): Local {
    const radians = degrees * Math.PI / 180
    return [x * Math.cos(radians) - y * Math.sin(radians), x * Math.sin(radians) + y * Math.cos(radians)]
}

/**
 * The rectangle four corners describe, in order around it: the first side gives the angle and
 * the width, the second the height. Corners of a rectangle drawn on the map or computed here
 * come back unchanged.
 */
export function frameOf(points: LatLng[]): RectangleFrame {
    const center: LatLng = [
        points.reduce((sum, point) => sum + point[0], 0) / points.length,
        points.reduce((sum, point) => sum + point[1], 0) / points.length,
    ]
    const [a, b, c] = points.map(point => toLocal(center, point)) as [Local, Local, Local]
    const width = Math.hypot(b[0] - a[0], b[1] - a[1])
    const height = Math.hypot(c[0] - b[0], c[1] - b[1])
    const angle = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI
    return {center, width, height, angle}
}

/** The corners of a rectangle, starting at its lower left and going round counter-clockwise. */
export function cornersOf(frame: RectangleFrame): LatLng[] {
    const halfWidth = frame.width / 2
    const halfHeight = frame.height / 2
    const local: Local[] = [[-halfWidth, -halfHeight], [halfWidth, -halfHeight], [halfWidth, halfHeight], [-halfWidth, halfHeight]]
    return local.map(point => fromLocal(frame.center, turn(point, frame.angle)))
}

/**
 * The rectangle after dragging corner `index` to a point: the opposite corner stays where it is,
 * the angle stays the same, and neither side gets shorter than `MIN_SIDE`.
 */
export function resized(frame: RectangleFrame, index: number, target: LatLng): RectangleFrame {
    const opposite = turn(toLocal(frame.center, cornersOf(frame)[(index + 2) % 4]!), -frame.angle)
    const dragged = turn(toLocal(frame.center, target), -frame.angle)
    const signX = index === 1 || index === 2 ? 1 : -1
    const signY = index === 2 || index === 3 ? 1 : -1
    const width = Math.max(MIN_SIDE, (dragged[0] - opposite[0]) * signX)
    const height = Math.max(MIN_SIDE, (dragged[1] - opposite[1]) * signY)
    const middle: Local = [opposite[0] + signX * width / 2, opposite[1] + signY * height / 2]
    return {center: fromLocal(frame.center, turn(middle, frame.angle)), width, height, angle: frame.angle}
}

/** Where the rotation handle sits: above the upper side, a little way out. */
export function rotationHandle(frame: RectangleFrame): LatLng {
    const distance = frame.height / 2 + Math.max(6, frame.height * 0.2)
    return fromLocal(frame.center, turn([0, distance], frame.angle))
}

/** The rectangle turned so that its rotation handle points at a point. */
export function rotated(frame: RectangleFrame, toward: LatLng): RectangleFrame {
    const [east, north] = toLocal(frame.center, toward)
    const angle = Math.atan2(north, east) * 180 / Math.PI - 90
    return {...frame, angle}
}

/** The rectangle moved so that its centre lies on a point. */
export function moved(frame: RectangleFrame, center: LatLng): RectangleFrame {
    return {...frame, center}
}

/**
 * The same rectangle described with its angle between -45° and 45°, swapping width and height as
 * needed, so that a rectangle drawn on the map gets its rotation handle on top.
 */
export function upright(frame: RectangleFrame): RectangleFrame {
    let {width, height, angle} = frame
    while (angle > 45) {
        angle -= 90;
        [width, height] = [height, width]
    }
    while (angle <= -45) {
        angle += 90;
        [width, height] = [height, width]
    }
    return {...frame, width, height, angle}
}

/**
 * Whether four points form a rectangle, within a little tolerance for rounding: adjacent sides at
 * right angles and opposite sides of equal length. Older free areas with four points are not
 * edited as rectangles, since that would change their outline.
 */
export function isRectangle(points: LatLng[]): boolean {
    if (points.length !== 4) return false
    const frame = frameOf(points)
    const [a, b, c, d] = points.map(point => toLocal(frame.center, point)) as [Local, Local, Local, Local]
    const sides: Local[] = [[b[0] - a[0], b[1] - a[1]], [c[0] - b[0], c[1] - b[1]], [d[0] - c[0], d[1] - c[1]], [a[0] - d[0], a[1] - d[1]]]
    const lengths = sides.map(([x, y]) => Math.hypot(x, y))
    if (lengths.some(length => length < 0.5)) return false
    const square = (first: number, second: number) =>
        Math.abs(sides[first]![0] * sides[second]![0] + sides[first]![1] * sides[second]![1]) / (lengths[first]! * lengths[second]!) < 0.02
    const equal = (first: number, second: number) => Math.abs(lengths[first]! - lengths[second]!) / Math.max(lengths[first]!, lengths[second]!) < 0.02
    return square(0, 1) && square(1, 2) && square(2, 3) && equal(0, 2) && equal(1, 3)
}

/** The same rectangle with no side shorter than `MIN_SIDE`, as for one drawn with two close clicks. */
export function atLeastMinimum(frame: RectangleFrame): RectangleFrame {
    return {...frame, width: Math.max(MIN_SIDE, frame.width), height: Math.max(MIN_SIDE, frame.height)}
}

/** The rectangle a share of the way between two others, turning the shorter way round. */
export function betweenFrames(from: RectangleFrame, to: RectangleFrame, share: number): RectangleFrame {
    const turn = ((to.angle - from.angle) % 360 + 540) % 360 - 180
    return {
        center: [from.center[0] + (to.center[0] - from.center[0]) * share, from.center[1] + (to.center[1] - from.center[1]) * share],
        width: from.width + (to.width - from.width) * share,
        height: from.height + (to.height - from.height) * share,
        angle: from.angle + turn * share,
    }
}
