# Codex in Firefox (local prototype)

This Firefox add-on connects to the existing Codex in Chrome loopback bridge. Codex and Claude Code each have a `firefox` MCP entry. It controls Firefox tabs through WebExtension APIs; it does not touch the Windows desktop or show the desktop overlay.

## Load and pair

1. Keep the existing bridge running (`corepack pnpm bridge` from the repository root, if it is not already running).
2. In Firefox, open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select this folder's `manifest.json`.
3. Open the **Codex in Firefox (Local)** toolbar popup. It shows a six-character pairing code.
4. In PowerShell, from the repository root, run `corepack pnpm exec tsx packages/bridge/src/cli.ts pair CODE Firefox` with that code.
5. In the popup, enable **Allow tab actions on websites**. Restart Codex and Claude Code terminal sessions. The `firefox` MCP selects the paired Firefox automatically when there is one; use `browsers_list` and `browser_select` if you pair more than one Firefox profile.

Firefox removes temporary add-ons when it closes. Permanent installation requires Mozilla signing. The current build has tab listing, creation, activation, owned-tab closing, navigation, text/HTML reading, finding controls, basic click/type/scroll/key actions, and visible-tab screenshots. The Chrome build has additional CDP-dependent features that are not in this Firefox build. Password and card input are blocked. User tabs require `confirmed:true` before activation; only agent-created tabs can be closed.
