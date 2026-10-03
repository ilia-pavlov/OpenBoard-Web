import { describe, expect, it } from 'vitest'
import { axisIndices, monotonePath, ticks, yDomain } from './chart'

const entry = (pre: number, post: number) => ({ id: `${pre}-${post}`, name: '', date: null, pre, post, matches: true })

describe('yDomain', () => {
  it('pads the range so markers never touch the edges', () => {
    expect(yDomain([entry(1400, 1460), entry(1460, 1520)])).toEqual([1380, 1540])
  })

  it('never returns a flat range', () => {
    expect(yDomain([entry(1000, 1000)])).toEqual([950, 1050])
  })
})

describe('ticks', () => {
  it('picks round values inside the domain', () => {
    expect(ticks([1380, 1540])).toEqual([1400, 1450, 1500])
    expect(ticks([600, 3000])).toEqual([1000, 2000, 3000])
  })
})

describe('axisIndices', () => {
  it('labels every event when there are few', () => {
    expect(axisIndices(3)).toEqual([0, 1, 2])
  })

  it('labels four evenly spaced events including the first and last', () => {
    expect(axisIndices(10)).toEqual([0, 3, 6, 9])
  })
})

describe('monotonePath', () => {
  it('draws a single point as a move', () => {
    expect(monotonePath([5], [10])).toBe('M5,10')
  })

  it('keeps control points within the y-range of each segment (no overshoot)', () => {
    const ys = [100, 50, 50, 0]
    const path = monotonePath([0, 10, 20, 30], ys)
    const numbers = path.match(/-?\d+(\.\d+)?/g)!.map(Number)
    const yValues = numbers.filter((_, i) => i % 2 === 1)
    expect(Math.max(...yValues)).toBeLessThanOrEqual(100)
    expect(Math.min(...yValues)).toBeGreaterThanOrEqual(0)
  })
})
