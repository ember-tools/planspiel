import {describe, expect, it} from 'vitest'
import {applyOperation, applyOperations, remove, set} from './operations'

describe('applyOperation', () => {
    it('sets and replaces values at a path', () => {
        const document: Record<string, unknown> = {a: {b: 1}}
        expect(applyOperation(document, set(['a', 'b'], 2))).toBe(true)
        expect(applyOperation(document, set(['a', 'c'], {d: [1, 2]}))).toBe(true)
        expect(document).toEqual({a: {b: 2, c: {d: [1, 2]}}})
    })

    it('copies the value, so later changes to it do not leak into the document', () => {
        const value = {x: 1}
        const document: Record<string, unknown> = {}
        applyOperation(document, set(['v'], value))
        value.x = 2
        expect(document).toEqual({v: {x: 1}})
    })

    it('deletes values', () => {
        const document: Record<string, unknown> = {a: {b: 1, c: 2}}
        expect(applyOperation(document, remove(['a', 'b']))).toBe(true)
        expect(document).toEqual({a: {c: 2}})
        expect(applyOperation(document, remove(['a', 'b']))).toBe(false)
    })

    it('drops an operation whose parent is gone instead of recreating it', () => {
        const document: Record<string, unknown> = {snapshots: {}}
        expect(applyOperation(document, set(['snapshots', 'gone', 'vehicles', 'v'], {position: [1, 2]}))).toBe(false)
        expect(document).toEqual({snapshots: {}})
    })

    it('never walks into inherited properties', () => {
        const document: Record<string, unknown> = {}
        expect(applyOperation(document, set(['__proto__', 'polluted'], true))).toBe(false)
        expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    })

    it('counts the operations that changed something', () => {
        expect(applyOperations({a: {}}, [set(['a', 'b'], 1), set(['x', 'y'], 1), remove(['a', 'b'])])).toBe(2)
    })
})

describe('prototype keys', () => {
    it('are refused at any place of a path', () => {
        const document: Record<string, unknown> = {vehicles: {}}
        for (const key of ['__proto__', 'constructor', 'prototype']) {
            expect(applyOperation(document, set(['vehicles', key], {polluted: true}))).toBe(false)
            expect(applyOperation(document, remove(['vehicles', key]))).toBe(false)
        }
        expect(Object.getPrototypeOf(document.vehicles)).toBe(Object.prototype)
        expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    })
})
