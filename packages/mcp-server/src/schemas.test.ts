import { describe, expect, it } from 'vitest';
import { schemas } from './schemas.js';

describe('tool input schemas', () => {
  it('requires a tab for tab actions and rejects unknown fields', () => {
    expect(schemas.screenshot.safeParse({}).success).toBe(false);
    expect(schemas.screenshot.safeParse({ tabId: 4, format: 'png' }).success).toBe(true);
    expect(schemas.screenshot.safeParse({ tabId: 4, dangerous: true }).success).toBe(false);
  });
  it('requires explicit confirmation for file upload', () => {
    expect(schemas.file_upload.safeParse({ tabId: 3, paths: ['C:/file.txt'] }).success).toBe(false);
    expect(schemas.file_upload.safeParse({ tabId: 3, paths: ['C:/file.txt'], confirmed: true }).success).toBe(true);
  });
  it('supports direct MCP arguments for browser discovery', () => {
    expect(schemas.browsers_list.safeParse({}).success).toBe(true);
    expect(schemas.browser_select.safeParse({ deviceId: 'browser-1' }).success).toBe(true);
    expect(schemas.browser_status.safeParse({}).success).toBe(true);
    expect(schemas.browser_resume.safeParse({}).success).toBe(false);
    expect(schemas.browser_resume.safeParse({ confirmed: true }).success).toBe(true);
  });
});
