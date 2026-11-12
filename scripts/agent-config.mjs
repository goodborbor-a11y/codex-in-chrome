#!/usr/bin/env node
/* global process, console */
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const [browser, agent = 'generic'] = process.argv.slice(2);
if (!['chrome', 'firefox'].includes(browser) || !['codex', 'claude', 'hermes', 'generic'].includes(agent)) {
  console.error('Usage: node scripts/agent-config.mjs <chrome|firefox> <codex|claude|hermes|generic>');
  process.exitCode = 2;
} else {
  const command = process.execPath;
  const args = [join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
    browser === 'chrome' ? join(root, 'packages', 'mcp-server', 'src', 'index.ts') : join(root, 'packages', 'firefox', 'mcp.ts')];
  if (!existsSync(args[0])) { console.error('Run corepack pnpm install first.'); process.exitCode = 1; }
  else if (agent === 'codex') {
    console.log(`[mcp_servers.${browser}]\ncommand = ${JSON.stringify(command)}\nargs = [${args.map(JSON.stringify).join(', ')}]`);
    console.log('\nAdd this to ~/.codex/config.toml, then restart Codex.');
  } else if (agent === 'claude') {
    const quote = process.platform === 'win32'
      ? (value) => `'${value.replaceAll("'", "''")}'`
      : (value) => `'${value.replaceAll("'", `'"'"'`)}'`;
    console.log(`claude mcp add --scope user ${browser} -- ${[command, ...args].map(quote).join(' ')}`);
    console.log('Run this command, then restart Claude Code.');
  } else if (agent === 'hermes') {
    console.log(`mcp_servers:\n  ${browser}:\n    command: ${JSON.stringify(command)}\n    args: [${args.map(JSON.stringify).join(', ')}]`);
    console.log('\nMerge this entry into ~/.hermes/config.yaml, then restart Hermes or run /reload-mcp.');
  } else {
    console.log(JSON.stringify({ mcpServers: { [browser]: { command, args } } }, null, 2));
    console.log('\nUse this stdio MCP entry in any compatible client on the same computer as the bridge.');
  }
}
