/**
 * A change to a board, as a path into the document and what happens there. Every edit is a list of
 * these, which keeps the local store, the saved copy and every other client of a shared board on
 * the same footing: they all apply the same operations.
 */
export type Operation =
    | {op: 'set', path: string[], value: unknown}
    | {op: 'delete', path: string[]}

type Node = Record<string, unknown>

/** Keys that would reach an object's prototype; no path and no id may use them. */
export const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype'])

function isNode(value: unknown): value is Node {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Applies one operation to a document in place and tells whether it changed anything. An
 * operation whose parent is gone, because someone else deleted it in the meantime, is dropped
 * rather than recreating half an object, and so is any path through a key that would reach an
 * object's prototype.
 */
export function applyOperation(document: Node, operation: Operation): boolean {
    const {path} = operation
    if (!path.length || path.some(key => FORBIDDEN_KEYS.has(key))) return false
    let parent: unknown = document
    for (const key of path.slice(0, -1)) {
        if (!isNode(parent) || !Object.hasOwn(parent, key)) return false
        parent = parent[key]
    }
    if (!isNode(parent)) return false
    const last = path[path.length - 1]!
    if (operation.op === 'delete') {
        if (!Object.hasOwn(parent, last)) return false
        delete parent[last]
        return true
    }
    parent[last] = structuredClone(operation.value)
    return true
}

/** Applies operations in order and tells how many changed something. */
export function applyOperations(document: Node, operations: Operation[]): number {
    return operations.filter(operation => applyOperation(document, operation)).length
}

/** An operation that sets a value. */
export function set(path: string[], value: unknown): Operation {
    return {op: 'set', path, value}
}

/** An operation that removes a value. */
export function remove(path: string[]): Operation {
    return {op: 'delete', path}
}
