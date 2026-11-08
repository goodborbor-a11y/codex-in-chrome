import { defineConfig } from 'vitest/config';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
export default defineConfig({ test: { include: ['packages/**/*.test.ts'], env: { CODEX_CHROME_CONFIG_DIR: join(tmpdir(), `codex-chrome-test-${process.pid}`) } } });
