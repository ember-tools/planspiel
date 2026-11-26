import {describe, expect, it} from 'vitest'
import {TILE_RETRIES, TILE_RETRY_DELAY, retryDelay} from './tiles'

describe('tile retries', () => {
    it('wait twice as long each time, 35 seconds in all', () => {
        expect(retryDelay(1)).toBe(TILE_RETRY_DELAY)
        expect(retryDelay(2)).toBe(2 * TILE_RETRY_DELAY)
        const total = Array.from({length: TILE_RETRIES}, (_, index) => retryDelay(index + 1)).reduce((a, b) => a + b)
        expect(total).toBe(35_000)
    })
})
