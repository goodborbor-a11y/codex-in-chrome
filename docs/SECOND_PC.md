# Install Saint in Browsers on another Windows PC

**Source:** [Public GitHub repository](https://github.com/goodborbor-a11y/codex-in-chrome) · [Download the latest `main` ZIP](https://github.com/goodborbor-a11y/codex-in-chrome/archive/refs/heads/main.zip)

Saint runs **on the same PC** as the browsers it controls. Install the bridge, browser add-ons, and agent MCP entry separately on your second PC. You do not need to upload anything from your first PC or copy its pairing tokens.

## 1. Download and build

Install [Node.js 24](https://nodejs.org/en/download) and [Git for Windows](https://git-scm.com/downloads/win). Open PowerShell, then choose **one** download method:

```powershell
git clone https://github.com/goodborbor-a11y/codex-in-chrome.git
cd codex-in-chrome
```

Or use **Download ZIP** above, extract it to a permanent folder, and `cd` into the extracted `codex-in-chrome-main` folder. Keep that folder in place after setup because the MCP entries use its absolute path.

```powershell
corepack pnpm install
corepack pnpm build
```

If `corepack` is missing, run `npm install -g corepack`, then retry those two commands.

## 2. Start the local bridge

In that folder run `corepack pnpm bridge` and leave the terminal open. For automatic startup on Windows, run `./scripts/install-startup.ps1` after the first successful connection.

## 3. Add Chrome, Firefox, or both

| Browser | Install the Saint add-on | Allow actions |
| --- | --- | --- |
| Chrome | Open `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select `packages/extension/dist` | In the Saint side panel, allow the websites you want to control |
| Firefox | Close Firefox, then run `./scripts/start-firefox-advanced.ps1` to open your default profile and install Saint | In the Saint toolbar popup, turn on **Allow tab actions on websites** |

For Firefox, close the browser first, then run `./scripts/start-firefox-advanced.ps1` from the checkout. It opens your default profile and installs Saint automatically. The manual basic-mode option is `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → `packages/firefox/manifest.json`.

Open each add-on's panel or popup and copy its six-character code. In a **second PowerShell window** in the checkout, pair each browser you installed:

```powershell
corepack pnpm exec tsx packages/bridge/src/cli.ts pair ABC123 "My Chrome"
corepack pnpm exec tsx packages/bridge/src/cli.ts pair DEF456 "My Firefox"
corepack pnpm exec tsx packages/bridge/src/cli.ts browsers
```

Replace each sample code with that browser's actual code. Run only the pairing line for browsers you installed. The final command should list each connected browser.

Firefox's add-on is unsigned and temporary. Run `./scripts/start-firefox-advanced.ps1` whenever you start Firefox; it reopens the same default profile with trusted input enabled and reinstalls Saint automatically. Chrome's unpacked add-on remains loaded. Firefox has fewer tools than Chrome; see its [capability list](../packages/firefox/README.md).

## 4. Connect an agent

From the checkout, run the line for the agent you use. The script prints settings with the **correct absolute paths for this PC**:

| Agent | Generate its MCP settings | Apply them |
| --- | --- | --- |
| Claude Code | `node scripts/agent-config.mjs both claude` | Run the printed `claude mcp add` command, then restart Claude Code; `/mcp` should show `saint-in-browsers` |
| Codex | `node scripts/agent-config.mjs both codex` | Paste the printed TOML into `~/.codex/config.toml`, then restart Codex |
| Hermes Agent | `node scripts/agent-config.mjs both hermes` | Merge the printed entry into `~/.hermes/config.yaml`, then run `/reload-mcp` |
| Any stdio MCP agent | `node scripts/agent-config.mjs both generic` | Put its printed `command` and `args` into that agent's local MCP settings |

Use `chrome` or `firefox` instead of `both` if you installed only one browser. Then paste the [Saint agent prompt](PROMPT.md) into a connected agent and name the browser you want it to use. A prompt alone cannot create an MCP connection.

## 5. Verify and update

Run `corepack pnpm test:mcp` to check the MCP server. With Firefox open and paired, `corepack pnpm test:firefox-live` checks navigation, screenshots, form filling, typing, local file upload, downloads, and other browser controls in a temporary local test tab. In your agent, call `browser_capabilities` after selecting a browser to see its current supported tools.

For a Git checkout, get newer code with `git pull`, `corepack pnpm install`, and `corepack pnpm build`. In Chrome, reload the Saint add-on at `chrome://extensions`; in Firefox, click **Reload** on its card in `about:debugging`. Restart your agent if MCP tool descriptions changed. For a ZIP install, download the latest ZIP again and replace the source in the **same folder** before rebuilding, so the saved MCP paths remain valid.
