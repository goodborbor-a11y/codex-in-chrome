# Connect a browser to an MCP agent

These steps work from a fresh Git checkout. Run the bridge and agent on the **same computer** as the browser. Chrome and Firefox use the same local bridge but have separate add-ons and MCP tool sets.

## 1. Get the code

Install [Git](https://git-scm.com/downloads) and [Node.js](https://nodejs.org/en/download) (Node 20 or newer). Then, in a terminal:

```sh
git clone https://github.com/goodborbor-a11y/codex-in-chrome.git
cd codex-in-chrome
corepack pnpm install
corepack pnpm build
```

Keep this checkout in the same folder: agent MCP settings point to its absolute path. Re-run `corepack pnpm install` after pulling dependency changes and `corepack pnpm build` after Chrome extension source changes.

## 2. Start the bridge

In a terminal from the checkout, run `corepack pnpm bridge` and keep it running. It binds only to `127.0.0.1` and saves pairing information in `~/.codex-chrome/config.json`. On Windows, `./scripts/install-startup.ps1` can start it at sign-in after initial setup.

## 3. Choose and pair a browser

**Chrome:** Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select `packages/extension/dist` from this checkout. Click the add-on icon to open its panel. Copy the six-character code. Allow the websites you want the agent to use in that panel.

**Firefox:** Open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on**, and select `packages/firefox/manifest.json` from this checkout. Open the **Codex in Firefox (Local)** toolbar popup and copy its six-character code. Turn on **Allow tab actions on websites**. Firefox removes this unsigned temporary add-on on restart; load it again to use it. A permanent install needs Mozilla signing.

In a second terminal in the checkout, replace `ABC123` with the popup code and run:

```sh
corepack pnpm exec tsx packages/bridge/src/cli.ts pair ABC123 "My Firefox"
corepack pnpm exec tsx packages/bridge/src/cli.ts browsers
```

Use `"My Chrome"` instead when pairing Chrome. Repeat pairing for every browser profile you want to connect. The second command should list the paired browser. The bridge must be running before pairing.

## 4. Connect an agent

Run one of these commands **from the checkout**; it prints paths for your machine. Use `firefox` or `chrome` as the first argument:

| Agent | Command | What to do with output |
| --- | --- | --- |
| Codex | `node scripts/agent-config.mjs firefox codex` | Paste the TOML block into `~/.codex/config.toml` |
| Claude Code | `node scripts/agent-config.mjs firefox claude` | Run the printed `claude mcp add` command |
| Hermes Agent | `node scripts/agent-config.mjs firefox hermes` | Merge the YAML entry into `~/.hermes/config.yaml` under `mcp_servers` |
| Other MCP agent | `node scripts/agent-config.mjs firefox generic` | Add the printed stdio `command` and `args` in that agent's MCP settings |

For Chrome, replace `firefox` with `chrome`. The two agent entries can coexist. **Restart the agent** after editing its configuration. Hermes can also run `/reload-mcp`. Hermes' [MCP configuration guide](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp/) documents its `mcp_servers` format. Each MCP server runs as a local stdio child process; it does not need a separate network MCP endpoint.

## 5. Try it

Ask your agent: **“Use the Firefox browser tools to list tabs, open a new tab, visit https://example.com, and read the page.”** Say Chrome instead if that is what you paired. If more than one profile for that browser is connected, use `browsers_list` and `browser_select` first. The Firefox MCP automatically selects the sole connected Firefox profile.

For Firefox, you can also run `corepack pnpm test:firefox-live` from the checkout. It creates a test tab, checks navigation, page text, and screenshot, then closes that tab.

If the agent reports bridge offline, start `corepack pnpm bridge`. If it reports no paired browser, reopen the add-on and pair its current code. If a site is denied, enable it in the add-on panel or popup. Firefox's temporary add-on must be loaded again after every restart. Firefox's current tool set is smaller than Chrome's; see [Firefox limitations](../packages/firefox/README.md).
