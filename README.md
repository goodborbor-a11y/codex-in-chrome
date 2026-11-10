# Codex in Chrome

An **unofficial, experimental** Chrome extension, local bridge, and MCP server that let a terminal coding agent work in a visible Chrome window. This community project is not affiliated with OpenAI, Anthropic, or Google. It is not production ready.

The extension draws a cyan to magenta cursor and page glow, pulses the cursor magenta on clicks, and sends browser actions through Chrome DevTools Protocol. The status pill fades near the pointer so page controls beneath it stay clickable. The extension does not move the operating system pointer. The bridge listens on loopback and connects the extension to terminal tools.

## Quick start

You need Chrome, Node.js, and Corepack. Development has been tested with Node 24 on Windows.

```powershell
corepack pnpm install
corepack pnpm build
corepack pnpm bridge
```

In Chrome, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select this checkout's `packages/extension/dist` folder. Open the extension side panel and note its six-character pairing code. In a second terminal, run:

```powershell
corepack pnpm exec tsx packages/bridge/src/cli.ts pair ABC123 "My Chrome"
corepack pnpm exec tsx packages/bridge/src/cli.ts install
corepack pnpm exec tsx packages/bridge/src/cli.ts doctor
```

Replace `ABC123` with the code shown in your panel. `install` adds an MCP server entry with paths to this checkout in `~/.codex/config.toml`; restart Codex CLI afterward. Other MCP clients can launch `packages/mcp-server/src/index.ts` with `tsx` from this checkout.

Claude Code can use the same stdio server. From this checkout in PowerShell, register a local MCP entry with `claude mcp add --scope local codex-in-chrome -- node "$((Get-Location).Path)/node_modules/tsx/dist/cli.mjs" "$((Get-Location).Path)/packages/mcp-server/src/index.ts"`, then check it with `claude mcp get codex-in-chrome`. The connection was smoke-tested with Claude Code 2.1.322; browser actions still need a paired Chrome profile and site approval.

If browser control is paused, `corepack pnpm exec tsx packages/bridge/src/cli.ts status` shows the state and `corepack pnpm exec tsx packages/bridge/src/cli.ts resume` resumes it after you decide to continue. The MCP `browser_resume` tool requires `confirmed: true`. Ordinary clicks have a short deadline with a named timeout error; long typing actions get a longer deadline based on their length.

The panel lets you approve a site before the agent acts there. To try the bundled local form demo, run `corepack pnpm exec tsx packages/bridge/src/cli.ts demo` and follow its site approval prompt. The demo opens and closes its own tab and saves a screenshot and GIF under your configured download directory. GIF recording requires `ffmpeg` on `PATH`.

## Multiple Chrome profiles and updates

Load the same `packages/extension/dist` folder in each profile and pair each profile once. A rebuild updates that shared folder. While the bridge is running, it detects the change and asks connected profiles to reload the extension after writes settle. Offline profiles pick up the rebuilt files when Chrome next loads the extension. Each profile keeps its own site permissions.

## Permissions and local data

The Chrome manifest requests broad host access because the extension needs to operate on sites you approve. The side panel starts with per-site permission controls; **Allow all websites** is an optional, persistent setting for ordinary HTTP and HTTPS actions. Pause and Stop controls are available in the panel. The page overlay has a Stop button that yields to site controls beneath it. Press **Ctrl+Alt+Shift+X** to stop browser control from the page at any time.

The bridge binds to `127.0.0.1` and requires a generated bearer token for its local HTTP API. It stores the token, paired devices, upload roots, and download directory in `~/.codex-chrome/config.json`. Keep that file private. The browser stores its pairing and permission settings in extension storage. The bridge logs activity in `~/.codex-chrome/activity.jsonl` with common credential field names redacted; review logs before sharing them.

Uploads and downloads require an explicit confirmation flag. Password entry needs a separate site credential switch. Card number, CVV, and SSN fields are blocked. The bridge limits file uploads to configured roots. These checks reduce accidental access but are not a security guarantee. Review browser actions and use a separate Chrome profile for untrusted testing.

## Tools and checks

The MCP server exposes tab, navigation, page reading, cursor, typing, form, screenshot, upload, download, and recording tools. Tool names and argument shapes are in `packages/mcp-server/src/schemas.ts`.

```powershell
corepack pnpm check
corepack pnpm lint
corepack pnpm test
corepack pnpm build
corepack pnpm test:mcp
corepack pnpm test:e2e
```

The last command uses a paired Chrome profile and a local fixture. With multiple connected browsers, set `CODEX_CHROME_DEVICE_ID` to the desired device ID. It creates and closes only its test tab.

GitHub Actions runs the type check, lint, unit tests, build, and MCP smoke test on pushes and pull requests. Browser end-to-end tests still require a paired, interactive Chrome profile and run locally.

## Current limits

This build lacks native messaging fallback, complete cross-origin iframe and shadow-root targeting, full-page screenshot stitching, video recording, and a full browser acceptance suite. `read_page` uses DOM semantics rather than a merged accessibility tree. Some advertised tool variants still need real-site testing. Treat successful compilation and unit tests as separate from browser acceptance.

## License

MIT. See [LICENSE](LICENSE).
