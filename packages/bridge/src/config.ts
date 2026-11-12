import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type Device = { deviceId: string; name: string; token: string; profile?: string };
export type Config = { port: number; apiToken: string; devices: Device[]; uploadRoots: string[]; downloadDir: string; firefoxBidiPort?: number };
export const configDir = process.env.CODEX_CHROME_CONFIG_DIR || join(homedir(), '.codex-chrome');
export const configPath = join(configDir, 'config.json');
export function loadConfig(): Config {
  mkdirSync(configDir, { recursive: true });
  if (existsSync(configPath)) return JSON.parse(readFileSync(configPath, 'utf8')) as Config;
  const config: Config = {
    port: 17345,
    apiToken: crypto.randomUUID(),
    devices: [],
    uploadRoots: [homedir()],
    downloadDir: join(homedir(), 'Downloads', 'Saint')
  };
  saveConfig(config);
  return config;
}
export function saveConfig(config: Config): void {
  mkdirSync(configDir, { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
}
