import {describe, expect, it} from 'vitest'
import {BASE_TYPES, PREFERRED, REGIONS, defaultSquads, findType, formatStrength, region, strength, symbolText, typeInRegion} from './index'

describe('regions', () => {
    it('give every type a unique id', () => {
        const ids = REGIONS.flatMap(region => region.types.map(type => type.id))
        expect(new Set(ids).size).toBe(ids.length)
    })

    it('list no name twice within one region', () => {
        for (const region of REGIONS) {
            const names = region.types.map(type => type.name)
            expect(new Set(names).size, region.id).toBe(names.length)
        }
    })

    it('only name base types that exist', () => {
        const bases = new Set(BASE_TYPES.map(base => base.id))
        for (const type of REGIONS.flatMap(region => region.types)) expect(bases.has(type.base), type.id).toBe(true)
    })
})

describe('typeInRegion', () => {
    it('keeps a type the region has', () => {
        expect(typeInRegion('be:LHF', 'BE')?.name).toBe('LHF')
    })

    it('shows the preferred type of the same base elsewhere', () => {
        expect(typeInRegion('be:LHF 20/12 CAFS', 'HE')?.name).toBe('HLF 20')
        expect(typeInRegion('de-he:DLAK 23/12', 'BE')?.name).toBe('DLK 23-12')
        expect(typeInRegion('be:LHF-M', 'BW')?.name).toBe('VLF')
    })

    it('falls back to the own type when the region has nothing of that base', () => {
        expect(typeInRegion('be:STEMO', 'HE')?.name).toBe('STEMO')
    })

    it('knows nothing of unknown ids', () => {
        expect(typeInRegion('xx:nothing', 'BE')).toBeUndefined()
        expect(findType('xx:nothing')).toBeUndefined()
    })
})

describe('strength', () => {
    it('reports a group as 0/1/8/9', () => {
        expect(formatStrength(strength(defaultSquads('de-he:HLF 20')))).toBe('0/1/8/9')
    })

    it('reports a Berlin LHF as a squad of six', () => {
        expect(formatStrength(strength(defaultSquads('be:LHF')))).toBe('0/1/5/6')
    })

    it('starts every Berlin LHF but the LHF-M as a squad, whatever its size', () => {
        for (const type of ['be:LHF 10/5', 'be:LHF 16/12', 'be:LHF 20/12', 'be:LHF 20/12 CAFS', 'be:LHF 20/8']) {
            expect(formatStrength(strength(defaultSquads(type))), type).toBe('0/1/5/6')
        }
        expect(formatStrength(strength(defaultSquads('be:LHF-M')))).toBe('0/1/3/4')
    })

    it('keeps a large Berlin LHF a group vehicle in other states', () => {
        expect(typeInRegion('be:LHF 20/12', 'HE')?.name).toBe('HLF 20')
    })

    it('counts a platoon leader as leader', () => {
        expect(formatStrength(strength([{function: 'platoon-leader', strength: 1}, {function: 'driver', strength: 1}])))
            .toBe('1/0/1/2')
    })

    it('hands out copies, so editing a vehicle never changes the catalogue', () => {
        defaultSquads('be:LHF')[0]!.strength = 99
        expect(defaultSquads('be:LHF')[0]!.strength).toBe(1)
    })
})

describe('symbolText', () => {
    it('takes the first word', () => {
        expect(symbolText('LHF 20/12 CAFS')).toBe('LHF')
    })

    it('keeps the second word where the first says nothing on its own', () => {
        expect(symbolText('GW SAN')).toBe('GW SAN')
        expect(symbolText('ELW 1 C')).toBe('ELW 1')
        expect(symbolText('AB Atemschutz')).toBe('AB')
    })
})

describe('vehicles shown in another region', () => {
    it('keep their kind and size in every region', () => {
        for (const region of REGIONS) {
            const engine = typeInRegion('be:LHF 20/12', region.id)!.name
            const tanker = typeInRegion('be:TLF 4000', region.id)!.name
            const ladder = typeInRegion('be:DLK 23-12', region.id)!.name
            expect(engine, region.id).toMatch(/LF|LHF/)
            expect(tanker, region.id).toMatch(/TLF/)
            expect(ladder, region.id).toMatch(/23|30/)
        }
    })
})

describe('preferred types of a state', () => {
    it('all exist in that state with the base they stand for', () => {
        for (const [regionId, entries] of Object.entries(PREFERRED)) {
            if (regionId === '*') continue
            for (const [base, name] of Object.entries(entries)) {
                expect(region(regionId).types.some(type => type.name === name && type.base === base), `${regionId} ${name}`).toBe(true)
            }
        }
    })
})
