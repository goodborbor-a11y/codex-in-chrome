# Saint in Browsers

**Saint in Browsers** is an unofficial, experimental browser extension, local bridge, and MCP server that lets terminal agents use Chrome or Firefox tabs. Any local agent with stdio MCP support can connect, including Codex, Claude Code, and Hermes Agent. This community project is not affiliated with OpenAI, Anthropic, Mozilla, or Google. It is not production ready.

**Start here:** [Install on a second PC](docs/SECOND_PC.md) · [Full setup guide](docs/CONNECT.md) · [Copy-paste agent prompt](docs/PROMPT.md). [Download the latest source ZIP](https://github.com/goodborbor-a11y/codex-in-chrome/archive/refs/heads/main.zip).

Once connected, copy the [short prompt for any MCP agent](docs/PROMPT.md).

Chrome has the original full tool set. Firefox supports tab and window control, page reading, form filling, uploads, downloads, cookies, storage, screenshots, and more. The unified MCP exposes Chrome's full list of tools; call `browser_capabilities` after selecting a browser to see exactly what its connected version supports. Both use a **Saint** tab group and an in-page frame, cursor, status pill, and Stop control. The extension acts inside the browser; it does not use desktop control. The single `saint-in-browsers` MCP entry can select either browser.

The Chrome extension draws a cyan to magenta cursor and page glow and uses Chrome DevTools Protocol for input. Firefox uses WebExtension APIs and optional WebDriver BiDi for trusted mouse, keyboard, and smooth wheel input. Neither extension moves the operating system pointer. The bridge listens on loopback and connects both extensions to terminal tools.

## Quick start

Follow the [connection guide](docs/CONNECT.md) to install the Chrome and Firefox add-ons, pair them with the local bridge, and register the single `saint-in-browsers` MCP entry in Codex, Claude Code, Hermes, or another MCP agent.

## Multiple Chrome profiles and updates

Load the same `packages/extension/dist` folder in each profile and pair each profile once. A rebuild updates that shared folder. While the bridge is running, it detects the change and asks connected profiles to reload the extension after writes settle. Offline profiles pick up the rebuilt files when Chrome next loads the extension. Each profile keeps its own site permissions.

On Windows, run `./scripts/install-startup.ps1` once to start the local bridge when you sign in. The task runs hidden, retries after failure, and does not create a second bridge if one is already running. `./scripts/remove-startup.ps1` removes the task. Pairing is stored in Chrome extension storage and in `~/.codex-chrome/config.json`; it normally survives a restart. If a profile shows a new code while the bridge is online, that profile's extension storage was reset or a different Chrome profile is open, so pair it again.

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
