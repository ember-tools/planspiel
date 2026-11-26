import {describe, expect, it} from 'vitest'
import {symbolSize} from './markers'

describe('symbolSize', () => {
    it('is 48 pixels at zoom 17 and doubles every two zoom levels', () => {
        expect(symbolSize(17)).toBe(48)
        expect(symbolSize(15)).toBe(28)
        expect(symbolSize(18)).toBe(68)
    })

    it('stays between 28 and 80 pixels', () => {
        expect(symbolSize(10)).toBe(28)
        expect(symbolSize(22)).toBe(80)
    })
})
