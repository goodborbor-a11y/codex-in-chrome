/* global process, console */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { join, resolve } from 'node:path';

const root = resolve('.');
const transport = new StdioClientTransport({ command: process.execPath, args: [join(root, 'node_modules/tsx/dist/cli.mjs'), join(root, 'packages/mcp-server/src/index.ts')] });
const client = new Client({ name: 'codex-chrome-smoke', version: '0.1.0' });
try {
  await client.connect(transport);
  const tools = await client.listTools();
  if (!tools.tools.some(t => t.name === 'browsers_list') || !tools.tools.some(t => t.name === 'computer')) throw Error('Required MCP tools missing');
  const listed = await client.callTool({ name: 'browsers_list', arguments: {} });
  if (listed.isError) throw Error(JSON.stringify(listed.content));
  console.log(`MCP PASS: ${tools.tools.length} tools listed; browsers_list responded`);
} finally { await client.close(); }
