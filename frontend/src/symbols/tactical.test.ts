import {describe, expect, it} from 'vitest'
import {MARK_KINDS, escapeSvg, markSymbol, unitSymbol} from './tactical'

describe('escapeSvg', () => {
    it('escapes everything that could leave a text node or an attribute', () => {
        expect(escapeSvg(`<script>&"'`)).toBe('&#60;script&#62;&#38;&#34;&#39;')
    })
})

describe('unitSymbol', () => {
    it('never puts its text into the markup unescaped', () => {
        const svg = unitSymbol({shape: 'vehicle', organisation: 'fire', text: '<img src=x onerror=alert(1)>'})
        expect(svg).not.toContain('<img')
        expect(svg).toContain('&#60;img')
    })

    it('draws one dot for a squad and three for a group', () => {
        const dots = (size: 'squad' | 'group') =>
            unitSymbol({shape: 'unit', organisation: 'fire', text: 'A', size}).match(/<circle/g)?.length
        expect(dots('squad')).toBe(1)
        expect(dots('group')).toBe(3)
    })

    it('draws medical units red on white', () => {
        expect(unitSymbol({shape: 'vehicle', organisation: 'medical', text: 'RTW'})).toContain('fill="white"')
    })
})

describe('markSymbol', () => {
    it('is a complete SVG element for every kind', () => {
        for (const kind of MARK_KINDS) {
            expect(markSymbol(kind)).toMatch(/^<svg [^>]*>.*<\/svg>$/)
        }
    })
})
