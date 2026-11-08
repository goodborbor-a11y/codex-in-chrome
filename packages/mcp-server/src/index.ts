import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from '../../bridge/src/config.js';
import { schemas } from './schemas.js';

const config = loadConfig();
const sessionId = crypto.randomUUID();
const server = new McpServer({ name: 'codex-in-chrome', version: '0.1.0' });
for (const [name, schema] of Object.entries(schemas)) {
  server.tool(name, `Codex Chrome ${name}. Provide tabId for tab actions. Browser actions require pairing and the selected site permission setting.`, schema.shape, async (input: Record<string, unknown>) => {
    const response = await fetch(`http://127.0.0.1:${config.port}/rpc`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiToken}` }, body: JSON.stringify({ sessionId, name, input }) });
    const body = await response.json() as { result?: unknown; error?: string };
    if (!response.ok) return { isError: true, content: [{ type: 'text' as const, text: body.error || `HTTP ${response.status}` }] };
    const result = body.result as Record<string, unknown>;
    if (result && typeof result.image === 'string') return { content: [{ type: 'image' as const, data: result.image, mimeType: String(result.mimeType || 'image/png') }, { type: 'text' as const, text: JSON.stringify({ ...result, image: '[image above]' }) }] };
    return { content: [{ type: 'text' as const, text: JSON.stringify(body.result) }] };
  });
}
await server.connect(new StdioServerTransport());
