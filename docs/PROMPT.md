# Copy-paste prompt for a connected MCP agent

Use this after connecting the agent to the `saint-in-browsers` MCP server using the [setup guide](CONNECT.md):

> Use Saint in Browsers for this task. Call `browsers_list`, then `browser_select` to choose my Chrome or Firefox profile. Work in its Saint tab group: call `tabs_context` with `createIfEmpty: true`, then use that tab ID for browser actions. Ask me which profile if the choice is unclear. Use Saint's tab, page, click, type, and screenshot tools. Do not use desktop control. If Saint is unavailable, tell me which setup step is missing.

Tell the agent the task after that prompt, for example: “In Firefox, open example.com and summarize the page.” The prompt helps an already connected agent choose tools; it cannot install an MCP connection by itself. If an existing Claude Code session cannot see Saint, check `/mcp`, then exit and run `claude --continue` in the same directory. The bridge is local to the browser computer. Remote agents need a separate secure connection to that machine.
