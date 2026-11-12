import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from '../bridge/src/config.js';
import { schemas } from '../mcp-server/src/schemas.js';
import { readFileSync } from 'node:fs';

const config = loadConfig();
const sessionId = crypto.randomUUID();
const server = new McpServer({ name: 'codex-in-firefox', version: '0.1.0' });
let selected = false;
const capabilities=JSON.parse(readFileSync(new URL('./capabilities.json',import.meta.url),'utf8')) as {tools:string[]};
for (const name of capabilities.tools) {
  const schema=schemas[name as keyof typeof schemas];if(!schema)throw Error(`Unknown Firefox tool: ${name}`);
  server.tool(name, `Control Firefox tabs through the local bridge. Select the Firefox browser with browser_select when multiple browsers are connected. Website actions need Allow tab actions in the Firefox add-on popup.`, schema.shape, async (input: Record<string, unknown>) => {
    try {
      const rpc = async (method: string, args: Record<string, unknown>) => {
        const response = await fetch(`http://127.0.0.1:${config.port}/rpc`, {
          method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiToken}` },
          body: JSON.stringify({ sessionId, name: method, input: args }), signal: AbortSignal.timeout(30000)
        });
        const body = await response.json() as { result?: Record<string, unknown>; error?: string };
        if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
        return body.result;
      };
      if (name === 'browser_select') {
        const browsers = await rpc('browsers_list', {}) as unknown as { deviceId: string; platform?: string }[];
        if (!browsers.some(b => b.deviceId === input.deviceId && b.platform === 'Firefox')) throw new Error('Select a connected Firefox browser ID');
        selected = true;
      } else if (name !== 'browsers_list' && !selected) {
        const browsers = await rpc('browsers_list', {}) as unknown as { deviceId: string; platform?: string }[];
        const firefox = browsers.filter(b => b.platform === 'Firefox');
        if (firefox.length !== 1) throw new Error(`Expected one connected Firefox browser; found ${firefox.length}. Use browsers_list and browser_select.`);
        await rpc('browser_select', { deviceId: firefox[0]!.deviceId });
        selected = true;
      }
      const response = await fetch(`http://127.0.0.1:${config.port}/rpc`, {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiToken}` },
        body: JSON.stringify({ sessionId, name, input }), signal: AbortSignal.timeout(30000)
      });
      const body = await response.json() as { result?: Record<string, unknown>; error?: string };
      if (!response.ok) return { isError: true, content: [{ type: 'text' as const, text: body.error || `HTTP ${response.status}` }] };
      const result = body.result;
      if (result && typeof result.image === 'string') return { content: [
        { type: 'image' as const, data: result.image, mimeType: String(result.mimeType || 'image/png') },
        { type: 'text' as const, text: JSON.stringify({ ...result, image: '[image above]' }) }
      ] };
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    } catch (e) { return { isError: true, content: [{ type: 'text' as const, text: (e as Error).message }] }; }
  });
}
await server.connect(new StdioServerTransport());
