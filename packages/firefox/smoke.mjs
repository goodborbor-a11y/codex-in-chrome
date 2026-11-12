/* global process, console */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { join, resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const root = resolve('.');
const transport = new StdioClientTransport({ command: process.execPath,
  args: [join(root, 'node_modules/tsx/dist/cli.mjs'), join(root, 'packages/firefox/mcp.ts')] });
const client = new Client({ name: 'firefox-mcp-smoke', version: '0.1.0' });
try {
  await client.connect(transport);
  const listed = await client.listTools();
  const names = listed.tools.map(t => t.name);
  const capabilities=JSON.parse(readFileSync(join(root,'packages/firefox/capabilities.json'),'utf8'));
  if(names.length!==capabilities.tools.length||capabilities.tools.some(name=>!names.includes(name)))throw Error('Firefox MCP tools differ from capabilities.json');
  for (const required of ['browsers_list', 'tabs_context', 'navigate', 'read_page', 'computer', 'screenshot'])
    if (!names.includes(required)) throw Error(`Missing Firefox MCP tool: ${required}`);
  const result = await client.callTool({ name: 'browsers_list', arguments: {} });
  if (result.isError) throw Error(JSON.stringify(result.content));
  console.log(`Firefox MCP PASS: ${names.length} tools listed; browsers_list responded`);
} finally { await client.close(); }
