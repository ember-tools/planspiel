import {describe, expect, it} from 'vitest'
import {createBoard, sortedSnapshots} from './document'
import {copySnapshot, updateSnapshot} from './edits'
import {applyOperations} from './operations'
import {currentSnapshot, showBoard, stepSnapshot} from './store'

/** A board with three snapshots, two of them at the same time, created in the order a, b, c. */
function boardWithThree() {
    const board = createBoard()
    const a = sortedSnapshots(board)[0]!.id
    const apply = (operations: Parameters<typeof applyOperations>[1]) =>
        applyOperations(board as unknown as Record<string, unknown>, operations)
    apply(updateSnapshot(a, {time: '2026-11-26T10:00'}))
    const b = copySnapshot(board, a)!
    apply(b.operations)
    apply(updateSnapshot(b.id, {time: '2026-11-26T10:00'}))
    const c = copySnapshot(board, a)!
    apply(c.operations)
    apply(updateSnapshot(c.id, {time: '2026-11-26T09:00'}))
    return {board, ids: [a, b.id, c.id] as const}
}

describe('snapshot order and stepping', () => {
    it('sorts by time and keeps the order of creation for equal times', () => {
        const {board, ids: [a, b, c]} = boardWithThree()
        expect(sortedSnapshots(board).map(snapshot => snapshot.id)).toEqual([c, a, b])
    })

    it('steps forward and back in that order and stops at the ends', () => {
        const {board, ids: [a, b, c]} = boardWithThree()
        showBoard(board)
        expect(currentSnapshot.value?.id).toBe(c)
        stepSnapshot(-1)
        expect(currentSnapshot.value?.id).toBe(c)
        stepSnapshot(1)
        expect(currentSnapshot.value?.id).toBe(a)
        stepSnapshot(1)
        expect(currentSnapshot.value?.id).toBe(b)
        stepSnapshot(1)
        expect(currentSnapshot.value?.id).toBe(b)
        stepSnapshot(-1)
        expect(currentSnapshot.value?.id).toBe(a)
    })
})
