import {baseOf, squadFunction, symbolText, typeInRegion} from '../catalog'
import {unitSymbol} from './tactical'

const MEDICAL_FUNCTIONS = new Set(['emergency-doctor', 'paramedic'])

/** The symbol of a vehicle of a type, written as the region names that type. */
export function vehicleSymbol(typeId: string, regionId: string): string {
    const base = baseOf(typeId)
    const name = typeInRegion(typeId, regionId)?.name ?? base.name
    return unitSymbol({shape: base.shape, organisation: base.organisation, text: symbolText(name)})
}

/** The symbol of a squad that has dismounted: a unit of squad size named by its function. */
export function squadSymbol(functionId: string): string {
    return unitSymbol({
        shape: 'unit',
        organisation: MEDICAL_FUNCTIONS.has(functionId) ? 'medical' : 'fire',
        text: squadFunction(functionId).short,
        size: 'squad',
    })
}
