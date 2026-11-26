import type {Organisation, SymbolShape} from '../catalog'

/**
 * Tactical symbols after DIN 14034-6 and the recommendations of the BBK for DV 102, drawn as SVG
 * strings so they can be placed on the map as Leaflet icons and shown in lists alike.
 *
 * Every symbol is drawn on the same 120 × 80 canvas: the size mark above, the basic form in the
 * middle, wheels or keel below. The fire service draws red with white writing; medical services
 * draw red on white. Colours come from the theme's signal palette, so a symbol has to be inlined
 * into the page (not loaded as an image) for them to apply.
 */

/** The size of a unit, shown by dots or bars above its symbol. */
export type UnitSize = 'squad' | 'section' | 'group' | 'platoon'

/** The kinds of map marks that are not units: places and events of an incident. */
export type MarkKind = 'incident' | 'fire' | 'hazard' | 'staging' | 'command-post' | 'water' | 'casualty-collection'

/** What a symbol is drawn from. */
export interface SymbolSpec {
    shape: SymbolShape
    organisation: Organisation
    text: string
    size?: UnitSize
}

export const SYMBOL_WIDTH = 120
export const SYMBOL_HEIGHT = 80

const RED = 'var(--color-signal-500)'
const WHITE = 'white'
const STROKE = 3
const MAX_TEXT_WIDTH = 86

interface Colours {
    fill: string
    line: string
    text: string
}

/** The colours of an organisation. */
function colours(organisation: Organisation): Colours {
    return organisation === 'medical'
        ? {fill: WHITE, line: RED, text: RED}
        : {fill: RED, line: RED, text: WHITE}
}

/** Escapes text for use inside SVG markup. */
export function escapeSvg(text: string): string {
    return text.replace(/[&<>"']/g, character => `&#${character.charCodeAt(0)};`)
}

/** The writing inside a symbol, squeezed to fit when it is long. */
function label(text: string, x: number, y: number, colour: string): string {
    const size = text.length > 8 ? 17 : 22
    const squeeze = text.length * size * 0.5 > MAX_TEXT_WIDTH
        ? ` textLength="${MAX_TEXT_WIDTH}" lengthAdjust="spacingAndGlyphs"`
        : ''
    return `<text x="${x}" y="${y}" fill="${colour}" font-size="${size}" font-weight="700" `
        + `font-family="Barlow Condensed, Barlow, sans-serif" text-anchor="middle" dominant-baseline="central"${squeeze}>`
        + `${escapeSvg(text)}</text>`
}

/** The dots or bars above a unit that tell its size. */
function sizeMark(size: UnitSize | undefined, colour: string): string {
    if (!size) return ''
    if (size === 'platoon') {
        return `<line x1="60" y1="1" x2="60" y2="11" stroke="${colour}" stroke-width="${STROKE}"/>`
    }
    const count = {squad: 1, section: 2, group: 3}[size]
    return Array.from({length: count}, (_, index) => {
        const x = 60 + (index - (count - 1) / 2) * 10
        return `<circle cx="${x}" cy="6" r="3.5" fill="${colour}"/>`
    }).join('')
}

/** The basic form of a symbol, with the writing inside. */
function body(shape: SymbolShape, colour: Colours, text: string): string {
    const outline = `fill="${colour.fill}" stroke="${colour.line}" stroke-width="${STROKE}"`
    const wheel = (x: number) => `<circle cx="${x}" cy="70" r="6" fill="${WHITE}" stroke="${colour.line}" stroke-width="${STROKE}"/>`
    switch (shape) {
        case 'vehicle':
            return `<rect x="10" y="16" width="100" height="44" ${outline}/>${wheel(34)}${wheel(86)}${label(text, 60, 38, colour.text)}`
        case 'container':
            return `<rect x="14" y="16" width="92" height="44" ${outline}/>`
                + `<path d="M8 66 H112" stroke="${colour.line}" stroke-width="${STROKE}"/>`
                + `<path d="M14 60 L8 66 M106 60 L112 66" stroke="${colour.line}" stroke-width="${STROKE}"/>`
                + label(text, 60, 38, colour.text)
        case 'trailer':
            return `<rect x="24" y="16" width="86" height="44" ${outline}/>`
                + `<path d="M24 50 H6" stroke="${colour.line}" stroke-width="${STROKE}"/>${wheel(67)}`
                + label(text, 67, 38, colour.text)
        case 'boat':
            return `<path d="M10 16 H110 L100 56 Q60 72 20 56 Z" ${outline}/>${label(text, 60, 36, colour.text)}`
        case 'unit':
            return `<rect x="10" y="16" width="100" height="52" ${outline}/>${label(text, 60, 42, colour.text)}`
    }
}

/** An SVG string of a unit's symbol: a vehicle, container, trailer, boat or squad. */
export function unitSymbol(spec: SymbolSpec): string {
    const colour = colours(spec.organisation)
    return svg(sizeMark(spec.size, colour.line) + body(spec.shape, colour, spec.text))
}

/** An SVG string of a place or event of an incident. */
export function markSymbol(kind: MarkKind): string {
    const outline = `fill="${WHITE}" stroke="${RED}" stroke-width="${STROKE}"`
    const triangle = `<path d="M60 6 L108 74 H12 Z" ${outline}/>`
    switch (kind) {
        case 'incident':
            return svg(triangle)
        case 'fire':
            return svg(triangle + `<path d="M60 30 C50 44 46 52 52 62 C54 54 58 52 60 48 C62 54 66 56 68 62 C74 52 70 42 60 30 Z" fill="${RED}"/>`)
        case 'hazard':
            return svg(triangle + label('!', 60, 52, RED))
        case 'staging':
            return svg(`<rect x="10" y="14" width="100" height="52" rx="26" ${outline}/>${label('BR', 60, 40, RED)}`)
        case 'command-post':
            return svg(`<path d="M30 70 V8 M30 10 H96 L84 24 L96 38 H30" ${outline}/>${label('EL', 58, 24, RED)}`)
        case 'water':
            return svg(`<circle cx="60" cy="40" r="30" ${outline}/>${label('W', 60, 40, RED)}`)
        case 'casualty-collection':
            return svg(`<circle cx="60" cy="40" r="30" ${outline}/>`
                + `<path d="M60 22 V58 M42 40 H78" stroke="${RED}" stroke-width="8"/>`)
    }
}

/** Wraps symbol content into an SVG element of the common canvas. */
function svg(content: string): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SYMBOL_WIDTH} ${SYMBOL_HEIGHT}" `
        + `width="${SYMBOL_WIDTH}" height="${SYMBOL_HEIGHT}">${content}</svg>`
}
