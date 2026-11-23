# Kubova

Plan container and pallet loads in 3D from your AI assistant. Kubova packs cargo into shipping containers, shows how
many complete products fit in one container, and creates a PDF load report with 3D views. Every figure comes from the
Kubova calculation, not from the assistant's own arithmetic.

## Install

Claude Code:

```
/plugin marketplace add Kubova-com/kubova-mcp
/plugin install kubova-plugin@kubova
```

Claude (claude.ai, Desktop, mobile): Settings → Connectors → add the custom connector `https://kubova.com/mcp`.

## What is in this plugin

- **Connector**: the remote Kubova server at `https://kubova.com/mcp`. You sign in with your Kubova account the first
  time a tool runs (OAuth). Nothing runs on your computer.
- **Skill** `plan-container-load`: tells the assistant which details to collect (carton sizes, weights, quantities,
  container), which tool to call, and to report only the figures the tools return. It ships the inner sizes of the
  standard 20' DC, 40' DC and 40' HC containers in `skills/plan-container-load/references/standard-containers.json`.

## Tools

| Tool | What it does |
|---|---|
| `pack_containers` | Loads a list of cartons into one or more containers, in bulk or on pallets, and returns the placements in loading order, utilization, weight, weight balance and any unplaced pieces. |
| `estimate_capacity` | Counts how many complete products (sets of one or more cartons) fit in one container. |
| `generate_report` | Creates a PDF load report with 3D views of a plan. |
| `verify_key` | Shows the signed-in account, workspace and plan. |
| `send_feedback` | Sends feedback to the Kubova team, only when you ask. |

## Data

The plugin sends the cargo you describe to `https://kubova.com/mcp` for the calculation, and nowhere else. Feedback you
choose to send is stored with your account. Privacy policy: https://kubova.com/en/privacy. Terms:
https://kubova.com/en/terms.

## Requirements

A Kubova account (https://kubova.com). Calculations count toward the monthly limits of that account's plan.

## Support

https://kubova.com/en/contact · documentation: https://kubova.com/en/docs/mcp
