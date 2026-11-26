import {describe, expect, it} from 'vitest'
import type {LatLng} from './model'
import {
    MIN_SIDE, atLeastMinimum, betweenFrames, cornersOf, frameOf, isRectangle, moved, resized, rotated, rotationHandle, upright,
    type RectangleFrame,
} from './rectangle'

const CENTER: LatLng = [52.5, 13.4]
const FRAME: RectangleFrame = {center: CENTER, width: 80, height: 40, angle: 0}

function close(actual: number, expected: number, digits = 6): void {
    expect(actual).toBeCloseTo(expected, digits)
}

function sameFrame(actual: RectangleFrame, expected: RectangleFrame): void {
    close(actual.center[0], expected.center[0])
    close(actual.center[1], expected.center[1])
    close(actual.width, expected.width, 3)
    close(actual.height, expected.height, 3)
    close(actual.angle, expected.angle, 3)
}

describe('rectangle geometry', () => {
    it('reads back the frame its corners were made from, turned or not', () => {
        for (const angle of [0, 30, 90, -135]) {
            const frame = {...FRAME, angle}
            sameFrame(frameOf(cornersOf(frame)), frame)
        }
    })

    it('keeps the opposite corner in place when a corner is dragged', () => {
        const frame = {...FRAME, angle: 30}
        const corners = cornersOf(frame)
        const target = cornersOf({...frame, width: 120, height: 60, center: cornersOf(frame)[0]!})[0]!
        const result = resized(frame, 2, target)
        const fixed = cornersOf(result)[0]!
        close(fixed[0], corners[0]![0])
        close(fixed[1], corners[0]![1])
        close(result.angle, 30)
    })

    it('grows and shrinks with the dragged corner', () => {
        const grown = resized(FRAME, 2, cornersOf({...FRAME, width: 120, height: 80, center: [CENTER[0] + 20 / 111_320, CENTER[1] + 20 / (111_320 * Math.cos(CENTER[0] * Math.PI / 180))]})[2]!)
        close(grown.width, 120, 2)
        close(grown.height, 80, 2)
    })

    it('never collapses below the smallest side', () => {
        const collapsed = resized(FRAME, 2, cornersOf(FRAME)[0]!)
        expect(collapsed.width).toBe(MIN_SIDE)
        expect(collapsed.height).toBe(MIN_SIDE)
    })

    it('turns toward the point the rotation handle is dragged to', () => {
        const east: LatLng = [CENTER[0], CENTER[1] + 0.001]
        close(rotated(FRAME, east).angle, -90, 3)
        const handle = rotationHandle(FRAME)
        expect(handle[0]).toBeGreaterThan(CENTER[0])
        close(handle[1], CENTER[1])
        close(rotated(FRAME, handle).angle, 0, 3)
    })

    it('moves without changing size or angle', () => {
        const target: LatLng = [52.6, 13.5]
        expect(moved({...FRAME, angle: 45}, target)).toEqual({...FRAME, angle: 45, center: target})
    })
})

describe('upright', () => {
    it('describes a rectangle with its angle within 45° either way, the same corners', () => {
        for (const angle of [90, 120, -100, 200]) {
            const frame = {...FRAME, angle}
            const result = upright(frame)
            expect(Math.abs(result.angle)).toBeLessThanOrEqual(45)
            const before = cornersOf(frame).map(point => point.map(value => value.toFixed(7)).join()).sort()
            const after = cornersOf(result).map(point => point.map(value => value.toFixed(7)).join()).sort()
            expect(after).toEqual(before)
        }
    })
})

describe('isRectangle', () => {
    it('accepts drawn rectangles and refuses other four-point areas', () => {
        expect(isRectangle(cornersOf({...FRAME, angle: 33}))).toBe(true)
        const skewed = cornersOf(FRAME)
        skewed[2] = [skewed[2]![0] + 0.0002, skewed[2]![1]]
        expect(isRectangle(skewed)).toBe(false)
        expect(isRectangle(cornersOf(FRAME).slice(0, 3))).toBe(false)
    })
})

describe('atLeastMinimum', () => {
    it('gives a rectangle drawn with two close clicks a usable size', () => {
        const tiny = atLeastMinimum({...FRAME, width: 0, height: 1})
        expect([tiny.width, tiny.height]).toEqual([MIN_SIDE, MIN_SIDE])
    })
})

describe('betweenFrames', () => {
    it('turns the shorter way and stays a rectangle halfway', () => {
        const half = betweenFrames({...FRAME, angle: 170}, {...FRAME, angle: -170}, 0.5)
        close(Math.abs(half.angle), 180, 6)
        expect(isRectangle(cornersOf(betweenFrames({...FRAME, angle: 0}, {...FRAME, angle: 80, width: 120}, 0.5)))).toBe(true)
    })
})
