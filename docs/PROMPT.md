# Copy-paste prompt for a connected MCP agent

Use this after connecting the agent to the `saint-in-browsers` MCP server using the [setup guide](CONNECT.md):

> Use the `saint-in-browsers` MCP for this browser task. Call `browsers_list`, then `browser_select` to choose my Chrome or Firefox profile. Call `tabs_context` with `createIfEmpty: true`, and use that Saint tab ID for browser actions. Use Saint's page reading, click, form, typing, and screenshot tools; check each tool's Firefox support in its description. Do not use desktop control. If Saint is unavailable, tell me which connection step failed.

Tell the agent the task after that prompt, for example: “In Firefox, open example.com and summarize the page.” The prompt helps an already connected agent choose tools; it cannot install an MCP connection by itself. If an existing Claude Code session cannot see Saint, check `/mcp`, then exit and run `claude --continue` in the same directory. The bridge is local to the browser computer. Remote agents need a separate secure connection to that machine.
