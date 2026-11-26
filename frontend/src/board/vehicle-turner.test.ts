import L from 'leaflet'
import {describe, expect, it} from 'vitest'
import {betweenHeadings} from './animation'
import {headingTowards, snapped} from './vehicle-turner'

describe('turning by handle', () => {
    it('reads the heading from the vehicle towards the handle, clockwise from north', () => {
        const centre = L.point(100, 100)
        expect(headingTowards(centre, L.point(100, 50))).toBe(0)
        expect(headingTowards(centre, L.point(150, 100))).toBe(90)
        expect(headingTowards(centre, L.point(100, 150))).toBe(180)
        expect(headingTowards(centre, L.point(50, 100))).toBe(270)
    })

    it('snaps to steps of 15 degrees', () => {
        expect(snapped(52)).toBe(45)
        expect(snapped(353)).toBe(0)
    })

    it('animates the shorter way round', () => {
        expect(betweenHeadings(350, 10, 0.5)).toBeCloseTo(0, 9)
        expect(betweenHeadings(10, 350, 0.25)).toBeCloseTo(5, 9)
        expect(betweenHeadings(90, 270, 1)).toBeCloseTo(270, 9)
    })
})
