"""Desirepath MCP server (stdio). Point a coding agent at it from inside a repository.

    claude mcp add desirepath -- desirepath mcp

Tools:
  get_context     task → token-budgeted context pack with a why-path per file
  record_outcome  which files the run actually changed → the graph learns
  explain         why a file was served and what the graph has learned about it
  graph_stats     size of the graph and of what it has learned
There is no raw-Cypher tool: the agent cannot write arbitrary data into the graph.
"""
from __future__ import annotations

import os
import subprocess
from pathlib import Path

from mcp.server.mcpserver import MCPServer

from . import ids
from .domain.seeder import task_terms
from .runtime import get_runtime, repo_key_for
from .schema import POINTS_TO

INSTRUCTIONS = """Desirepath maps this repository as a graph and remembers which code mattered for
past tasks. Call get_context with the task before reading files. It returns the files and
symbols most likely to matter, each with the path through the code that connects it to the
task. When you finish, call record_outcome with the run_id so the next pack is sharper."""

server = MCPServer("desirepath", instructions=INSTRUCTIONS)


def _root() -> Path:
    return Path(os.environ.get("DP_REPO_ROOT", os.getcwd())).resolve()


def _engine():
    root = _root()
    return get_runtime().ensure_indexed(root, os.environ.get("DP_REPO") or repo_key_for(root))


def _render(pack) -> str:
    if pack.abstained:
        return f"run_id: {pack.run_id}\nNo confident context: {pack.abstain_reason}."
    out = [f"run_id: {pack.run_id}  ({pack.tokens}/{pack.budget_tokens} tokens, "
           f"{pack.timings.total_ms:.0f} ms)"]
    for it in pack.items:
        why = " → ".join(f"{s.via + ' ' if s.via else ''}{s.node}" for s in it.why)
        out.append(f"\n## {it.path}   score {it.score:.2f}\nwhy: {why}")
        if it.seed_reason:
            out.append(f"seed: {it.seed_reason}")
        out.extend(f"  {sig}" for sig in it.symbols)
        if it.snippet:
            out.append("```python\n" + it.snippet + "\n```")
    return "\n".join(out)


@server.tool()
def get_context(task: str, budget_tokens: int = 2000) -> str:
    """Return the code most relevant to `task`, within `budget_tokens`, with a why-path per file."""
    eng = _engine()
    return _render(eng.get_context(task, budget_tokens, source="agent"))


def _git_changed(root: Path) -> list[str]:
    try:
        out = subprocess.run(["git", "-C", str(root), "status", "--porcelain"], check=True,
                             capture_output=True, text=True).stdout
    except (OSError, subprocess.CalledProcessError):
        return []
    return [ln[3:].split(" -> ")[-1] for ln in out.splitlines() if ln[3:].endswith(".py")]


@server.tool()
def record_outcome(run_id: int, touched_files: list[str] | None = None) -> str:
    """Tell Desirepath which files this run changed. Defaults to the working tree's changed .py files."""
    eng = _engine()
    files = touched_files or _git_changed(_root())
    if not files:
        return "No changed .py files found; nothing to learn."
    rep = eng.record_outcome(run_id, files)
    return (f"Learned from {len(files)} file(s). Served and touched: {rep.hits or 'none'}. "
            f"Touched but not served: {rep.unserved or 'none'}. Edges reinforced "
            f"{rep.edges_reinforced}, created {rep.edges_created}, decayed {rep.edges_decayed}.")


@server.tool()
def explain(task: str, path: str) -> str:
    """Show what the graph has learned linking the words of `task` to the file at `path`."""
    eng = _engine()
    fid = eng.fid_of.get(path)
    if fid is None:
        return f"{path} is not in the graph."
    terms = task_terms(task)
    pairs = [(ids.term_id(eng.repo, t), fid) for t in terms]
    stats = eng.store.edge_weights(POINTS_TO, pairs)
    lines = [f"Learned links from this task's words to {path}:"]
    for t, pair in zip(terms, pairs, strict=True):
        s = stats.get(pair)
        if s:
            lines.append(f"  '{t}' → w={s['w']:.2f} (hits {s['hits']}, misses {s['misses']})")
    if len(lines) == 1:
        lines.append("  none yet; this file was reached through code structure only.")
    return "\n".join(lines)


@server.tool()
def graph_stats() -> str:
    """Size of the code graph and of what it has learned."""
    eng = _engine()
    s = get_runtime().stats(eng.repo)
    return s.model_dump_json(indent=1)


def main() -> None:
    # Warm up before serving: index on first use, load the tokenizer and the name index,
    # so the agent's first get_context is as fast as the rest.
    try:
        from .adapters.tokens import count_tokens
        count_tokens("warm up")
        _engine()
    except Exception as e:  # never block the server from starting
        import sys
        print(f"desirepath: warm-up skipped: {e}", file=sys.stderr)
    server.run("stdio")


if __name__ == "__main__":
    main()
