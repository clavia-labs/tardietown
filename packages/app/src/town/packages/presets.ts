export const MCP_PRESETS = [
        { name: "exa", label: "Exa", description: "Web search · Free access, no key", url: "https://mcp.exa.ai/mcp", auth: "none" as const },
        { name: "notion", label: "Notion", description: "Pages and documents · Sign in", url: "https://mcp.notion.com/mcp", auth: "oauth" as const },
        { name: "linear", label: "Linear", description: "Issues and projects · Sign in", url: "https://mcp.linear.app/mcp", auth: "oauth" as const },
        { name: "sentry", label: "Sentry", description: "Errors and diagnostics · Sign in", url: "https://mcp.sentry.dev/mcp", auth: "oauth" as const },
        { name: "atlassian", label: "Atlassian", description: "Jira and Confluence · Sign in", url: "https://mcp.atlassian.com/v2/mcp", auth: "oauth" as const }
      ] as const
