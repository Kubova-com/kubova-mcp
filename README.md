# @kubova/mcp

Model Context Protocol server for the [Kubova](https://kubova.com) container loading calculator.

Lets Claude, Cursor, Cline, ChatGPT, n8n, and any other MCP-aware AI agent pack shipping containers as a tool call.

## Install

```bash
# Get an API key first at
#   https://kubova.com/dashboard/api-keys
# (Pro plan; 14-day trial available.)
```

## Configure

### Claude Code / Claude Desktop

Add to `~/.claude/settings.json` (or the Claude Desktop config file):

```json
{
  "mcpServers": {
    "kubova": {
      "command": "npx",
      "args": ["-y", "@kubova/mcp@latest"],
      "env": {
        "KUBOVA_API_KEY": "kbv_..."
      }
    }
  }
}
```

### Cursor / Cline / Codex

Same JSON shape — point your MCP-aware client at the package via `npx`.

## Tools exposed

| Tool | Purpose |
|---|---|
| `pack_containers` | Pack a list of cargo SKUs into one or more shipping containers. Returns placements, utilization, weight, and any unplaced pieces. |
| `verify_key` | Sanity-check the configured API key. Returns identity, scopes, and rate limit. |

## Input schema (pack_containers)

```ts
{
  cargos: [
    {
      id: string,
      name: string,
      shape?: "box" | "cylinder",
      lengthCm: number,
      widthCm: number,
      heightCm: number,
      quantity: number,
      weightKg: number,
      color?: string,
      includeInLoading?: boolean,
      allowStacking?: boolean,
      allowRotation?: boolean
    }
  ],
  container?: {
    id: string,
    name: string,
    innerLengthCm: number,
    innerWidthCm: number,
    innerHeightCm: number,
    doorWidthCm: number,
    doorHeightCm: number,
    maxPayloadKg: number
  },
  containers?: [ /* multiple types — Kubova picks the best mix */ ],
  options?: {
    loadingDirection?: "floor-to-top" | "right-to-left",
    maxContainers?: number
  }
}
```

## Env

| Variable | Default | Notes |
|---|---|---|
| `KUBOVA_API_KEY` | — | **Required.** Generated from the dashboard. |

## License

MIT.
