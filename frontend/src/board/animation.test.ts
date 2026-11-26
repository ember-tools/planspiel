import {describe, expect, it} from 'vitest'
import {between, betweenLines, ease} from './animation'

describe('animation helpers', () => {
    it('ease from 0 to 1 symmetrically', () => {
        expect(ease(0)).toBe(0)
        expect(ease(1)).toBe(1)
        expect(ease(0.5)).toBeCloseTo(0.5)
        expect(ease(0.25) + ease(0.75)).toBeCloseTo(1)
    })

    it('interpolate points and lines', () => {
        expect(between([0, 0], [2, 4], 0.5)).toEqual([1, 2])
        expect(betweenLines([[0, 0], [1, 1]], [[2, 2], [3, 3]], 0.5)).toEqual([[1, 1], [2, 2]])
    })
})
