import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from '../../bridge/src/config.js';
import { rpcTimeoutMs } from '../../bridge/src/timeouts.js';
import { schemas } from './schemas.js';

const config = loadConfig();
const sessionId = crypto.randomUUID();
const server = new McpServer({ name: 'saint-in-browsers', version: '0.2.0' });
const firefoxTools = new Set([
  'browsers_list', 'browser_select', 'browser_status', 'browser_resume', 'extension_reload',
  'permissions_status', 'permissions_set', 'tabs_list_all', 'tabs_context', 'tabs_create',
  'tabs_close', 'tabs_activate', 'navigate', 'screenshot', 'screenshot_to_file',
  'read_page', 'get_page_text', 'get_html', 'find', 'computer', 'insert_text',
  'clear_field', 'form_input', 'get_element', 'wait_for', 'focus', 'blur',
  'select_option', 'check', 'uncheck', 'scroll_into_view', 'scroll_page',
  'macro_record', 'macro_replay', 'gif_record'
]);
for (const [name, schema] of Object.entries(schemas)) {
  const firefox = firefoxTools.has(name) ? 'Firefox supported.' : 'Chrome only; Firefox has not implemented this tool.';
  const limits = name === 'computer' ? ' Firefox computer supports left_click, type, scroll, key, wait, and screenshot actions only.' : '';
  server.tool(name, `Saint in Browsers ${name}. ${firefox}${limits} Use browsers_list and browser_select to choose a connected browser. Provide tabId for tab actions. Browser actions require pairing and site permission.`, schema.shape, async (input: Record<string, unknown>) => {
    const timeout = rpcTimeoutMs(name, input);
    let response: Response;
    try {
      response = await fetch(`http://127.0.0.1:${config.port}/rpc`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiToken}` }, body: JSON.stringify({ sessionId, name, input }), signal: AbortSignal.timeout(timeout) });
    } catch (e) {
      const reason = e instanceof Error && e.name === 'TimeoutError' ? `browser_bridge_timed_out: ${name} after ${Math.ceil(timeout / 1000)}s` : (e as Error).message;
      return { isError: true, content: [{ type: 'text' as const, text: reason }] };
    }
    const body = await response.json() as { result?: unknown; error?: string };
    if (!response.ok) return { isError: true, content: [{ type: 'text' as const, text: body.error || `HTTP ${response.status}` }] };
    const result = body.result as Record<string, unknown>;
    if (result && typeof result.image === 'string') return { content: [{ type: 'image' as const, data: result.image, mimeType: String(result.mimeType || 'image/png') }, { type: 'text' as const, text: JSON.stringify({ ...result, image: '[image above]' }) }] };
    return { content: [{ type: 'text' as const, text: JSON.stringify(body.result) }] };
  });
}
await server.connect(new StdioServerTransport());
