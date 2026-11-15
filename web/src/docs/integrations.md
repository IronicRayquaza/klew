# Integrations and plans

Klew is one engine with several front doors. Pick the one that fits how your team works.

## What ships today

| Surface | For | How to get it |
|---|---|---|
| [Claude Code plugin](#docs/mcp) | Claude Code | `/plugin install klew --marketplace IronicRayquaza/klew` |
| [Claude Desktop extension](#docs/mcp) | Claude Desktop | `klew.mcpb` from the GitHub release |
| [MCP server](#docs/mcp) | Cursor, Windsurf, any MCP client | `npx -y klew-mcp mcp` or `uvx klew mcp` |
| [CLI](#docs/cli) | developers and scripts | `pip install klew` |
| [REST API](#docs/api) | internal tools, dashboards, other agents | `klew serve` |
| [GitHub Action](#docs/github-action) | learning from every merged PR | `action/` in the repo |
| [Python library](#docs/library) | embedding the engine in your own agent | `pip install klew` |
| Web dashboard | trying tasks, seeing why-paths, teaching outcomes | `web/` in the repo |

## Coming next

| | Why |
|---|---|
| TypeScript and Go parsing | the graph model is language-agnostic; only the tree-sitter reader is Python-specific today |
| Hosted team graph | one learned graph per repository, shared by the whole team |
| Editor extension | context and why-paths beside the code, without an agent |

## Who it's for

Engineering teams of roughly 20–500 people who use coding agents every day on repositories too large to
fit in a prompt. The buyer is whoever owns developer productivity, or the agent bill.

## Why teams would pay

- **Token spend.** In our replay, Klew spends about half the context tokens per correct file
  compared with vector RAG. That's input you stop paying for on every agent call.
- **Agent success.** The right file is in context far more often, so agents spend fewer turns looking.
- **It compounds.** Every merge makes the graph better for everyone. A shared team graph is an asset that
  grows, and it's specific to your codebase.
- **It's auditable.** Every file an agent saw comes with the reason it was chosen.

## Proposed plans

| Plan | Price | What you get |
|---|---|---|
| Open source | free | Local MCP server, CLI, REST API, GitHub Action. Your graph on your machine. |
| Team graph | $18 per engineer per month | A shared, learned graph per repository on HydraDB object storage. Every engineer's merges sharpen everyone's agent. |
| Enterprise | contact us | Self-hosted in your cloud, SSO, and export of every context decision for audit. |

Only the open-source tier exists today. The paid tiers are what we would build next.

## Why HydraDB

The learned graph is small per repository but there are many of them, and each one is read on every agent
call and written on every merge. HydraDB keeps graphs on object storage, with compute that scales
separately. A per-repository graph costs storage, not a running server, which is what makes a cheap
per-seat team graph viable.
