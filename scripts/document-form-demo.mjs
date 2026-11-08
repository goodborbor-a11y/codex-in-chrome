/* global URL, console */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../packages/extension/fixtures/document-form.html', import.meta.url));
const server = createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(html);
});
server.listen(17667, '127.0.0.1', () => console.log('Document form: http://127.0.0.1:17667/'));
