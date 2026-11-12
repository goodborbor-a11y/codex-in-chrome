# Saint in Firefox (local add-on)

This Firefox add-on connects to the Saint in Browsers loopback bridge. Any stdio MCP agent can use its tools. It creates a **Saint** tab group and draws a cyan/magenta frame, animated page cursor, status pill, and Stop button **inside the tab**. It does not touch the Windows desktop.

## Load and pair

1. Keep the existing bridge running (`corepack pnpm bridge` from the repository root, if it is not already running).
2. In Firefox, open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select this folder's `manifest.json`.
3. Open the **Saint in Firefox (Local)** toolbar popup. It shows a six-character pairing code.
4. In PowerShell, from the repository root, run `corepack pnpm exec tsx packages/bridge/src/cli.ts pair CODE Firefox` with that code.
5. In the popup, enable **Allow tab actions on websites**. Restart Codex and Claude Code terminal sessions. The `firefox` MCP selects the paired Firefox automatically when there is one; use `browsers_list` and `browser_select` if you pair more than one Firefox profile.

Firefox removes temporary add-ons when it closes. Permanent installation requires Mozilla signing. The current build supports tab listing/creation/activation, owned-tab closing, navigation, text/HTML reading, interactive element discovery, finding controls, element inspection, waiting for selectors or text, click/type/scroll, basic text editing keys, form filling, selection/checkbox controls, focus/blur, and visible-tab screenshots. Use CSS selectors for `form_input` fields; `insert_text` types into the focused field. `computer` supports `left_click`, `type`, `scroll`, `key`, `wait`, and `screenshot`; `key` currently handles Ctrl+A, Backspace, Delete, and Tab. The Chrome build still has additional CDP-dependent features. Password and card input are blocked. User tabs require `confirmed:true` before activation; only agent-created tabs can be closed.

When the updated bridge is running, it watches the Firefox add-on source and reloads the connected add-on after code changes. If it does not reload, click **Reload** on the add-on card in `about:debugging#/runtime/this-firefox`. The saved pairing normally reconnects. The Stop button pauses actions; use the popup's **Resume** button or the `browser_resume({confirmed:true})` MCP tool to continue.

`computer.coordinate` uses screenshot pixel positions. The add-on converts them to Firefox page coordinates using the page's display scale; screenshot responses include the CSS viewport size and display scale for inspection.
