import { describe, expect, it } from 'vitest';
import { rankElements } from './ranker.js';

describe('element ranker', () => {
  it('prefers a named interactive match to unrelated page text', () => {
    const matches = rankElements('search button', [
      { ref:'ref_1', name:'Search', role:'button', inViewport:true },
      { ref:'ref_2', name:'Article', role:'paragraph', text:'button search tips' }
    ]);
    expect(matches[0]?.ref).toBe('ref_1');
    expect(matches[0]?.reason).toContain('name matches search');
  });
});
