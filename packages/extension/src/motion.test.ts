import { describe, expect, it } from 'vitest';
import { humanPath } from './motion.js';

describe('virtual cursor path', () => {
  it('ends exactly on the target after overshooting', () => {
    const points = humanPath([0,0], [200,0], () => .5);
    expect(points.at(-1)).toEqual([200,0]);
    expect(points.at(-2)?.[0]).toBeGreaterThan(200);
    expect(points.length).toBeGreaterThanOrEqual(14);
  });
  it('caps movement steps for long distances', () => {
    expect(humanPath([0,0], [5000,0], () => .5).length).toBe(42);
  });
});
