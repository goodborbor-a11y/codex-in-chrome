import { describe, expect, it } from 'vitest';
import { browserToolTimeoutMs, rpcTimeoutMs } from './timeouts.js';

describe('browser action deadlines', () => {
  it('fails a stalled click sooner than the former 25-second deadline', () => {
    expect(browserToolTimeoutMs('computer', { action: 'left_click' })).toBe(12_000);
    expect(rpcTimeoutMs('computer', { action: 'left_click' })).toBe(17_000);
  });

  it('allows a long human-paced typing action to finish', () => {
    const input = { action: 'type', text: 'A'.repeat(600) };
    expect(browserToolTimeoutMs('computer', input)).toBeGreaterThan(100_000);
    expect(rpcTimeoutMs('computer', input)).toBeGreaterThan(browserToolTimeoutMs('computer', input));
  });
});
