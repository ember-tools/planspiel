import {unitSymbol, type SymbolSpec} from '@emberbox/ui'
import {baseOf, squadFunction, symbolText, typeInRegion} from '../catalog'

const MEDICAL_FUNCTIONS = new Set(['emergency-doctor', 'paramedic'])

/** What the symbol of a vehicle of a type is drawn from, written as the region names that type. */
export function vehicleSpec(typeId: string, regionId: string): SymbolSpec {
    const base = baseOf(typeId)
    const name = typeInRegion(typeId, regionId)?.name ?? base.name
    return {shape: base.shape, organisation: base.organisation, text: symbolText(name)}
}

/** What the symbol of a dismounted squad is drawn from: a unit of squad size named by its function. */
export function squadSpec(functionId: string): SymbolSpec {
    return {
        shape: 'unit',
        organisation: MEDICAL_FUNCTIONS.has(functionId) ? 'medical' : 'fire',
        text: squadFunction(functionId).short,
        size: 'squad',
    }
}

/** The SVG markup of a vehicle's symbol, for map icons. */
export function vehicleSymbol(typeId: string, regionId: string): string {
    return unitSymbol(vehicleSpec(typeId, regionId))
}

/** The SVG markup of a dismounted squad's symbol, for map icons. */
export function squadSymbol(functionId: string): string {
    return unitSymbol(squadSpec(functionId))
}
