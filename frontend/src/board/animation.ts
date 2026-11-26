import type {LatLng} from './model'

/** How long moving from one snapshot to the next takes, in milliseconds. */
export const ANIMATION_MS = 800

/** Slow at both ends, fast in the middle, so a move reads as one motion. */
export function ease(progress: number): number {
    return progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2
}

/** The point a share of the way from one point to another. */
export function between(from: LatLng, to: LatLng, share: number): LatLng {
    return [from[0] + (to[0] - from[0]) * share, from[1] + (to[1] - from[1]) * share]
}

/** Every point of a line a share of the way to the same point of another line of equal length. */
export function betweenLines(from: LatLng[], to: LatLng[], share: number): LatLng[] {
    return to.map((point, index) => between(from[index] ?? point, point, share))
}

/**
 * Calls `step` once per frame with the eased progress from 0 to 1 over `ANIMATION_MS`, then
 * `done`. Returns a function that stops it early without calling `done`.
 */
export function animate(step: (progress: number) => void, done: () => void = () => undefined): () => void {
    const start = performance.now()
    let frame = 0
    const tick = (now: number) => {
        const progress = Math.min(1, (now - start) / ANIMATION_MS)
        step(ease(progress))
        if (progress < 1) frame = requestAnimationFrame(tick)
        else done()
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
}
