"""desirepath CLI."""
from __future__ import annotations

import json
from pathlib import Path

import typer

app = typer.Typer(add_completion=False, no_args_is_help=True,
                  help="Desirepath: a self-improving code-context layer for coding agents.")


def _rt():
    from .runtime import get_runtime
    return get_runtime()


@app.command()
def index(path: Path = typer.Argument(Path("."), exists=True, file_okay=False),
          name: str = typer.Option(None, help="Repo key (default: directory name)"),
          history: int = typer.Option(2000, help="Commits of git history to mine for co-change")):
    """Index a repository into the code graph."""
    rep = _rt().index(path, name, history)
    typer.echo(f"indexed {rep.repo}: {rep.files} files, {rep.symbols} symbols, "
               f"{sum(rep.edges.values())} edges in {rep.seconds}s")


@app.command()
def context(task: str, repo: str = typer.Option(None), budget: int = typer.Option(2000),
            as_json: bool = typer.Option(False, "--json")):
    """Print the context pack for a task."""
    from .mcp_server import _render
    from .runtime import repo_key_for
    rt = _rt()
    eng = rt.engine(repo or repo_key_for(Path(".")))
    pack = eng.get_context(task, budget, source="cli")
    typer.echo(pack.model_dump_json(indent=1) if as_json else _render(pack))


@app.command("learn-git")
def learn_git(rev_range: str = typer.Argument(..., help="e.g. HEAD~20..HEAD, or a merge commit sha"),
              path: Path = typer.Option(Path("."), exists=True, file_okay=False),
              repo: str = typer.Option(None)):
    """Learn from commits (what the GitHub Action runs on every merged PR)."""
    from .adapters.git_miner import commits
    from .runtime import repo_key_for
    root = path.resolve()
    eng = _rt().engine(repo or repo_key_for(root), root)
    rng = rev_range if ".." in rev_range else f"{rev_range}^..{rev_range}"
    n = 0
    for c in commits(root, rng):
        files = c.changed + c.added
        if not files:
            continue
        pack = eng.get_context(c.task, 2000, source="pr")
        rep = eng.record_outcome(pack.run_id, files)
        n += 1
        typer.echo(f"{c.sha[:8]} {c.subject[:60]!r}: hit {len(rep.hits)}, "
                   f"missed {len(rep.unserved)}, +{rep.edges_created} edges")
    typer.echo(f"learned from {n} commit(s)")


@app.command()
def stats(repo: str = typer.Option(None)):
    """Graph and learning statistics."""
    from .runtime import repo_key_for
    typer.echo(_rt().stats(repo or repo_key_for(Path("."))).model_dump_json(indent=1))


@app.command("eval")
def eval_(path: Path = typer.Argument(..., exists=True, file_okay=False),
          name: str = typer.Option(None), window: int = typer.Option(300),
          reindex_every: int = typer.Option(50), budget: int = typer.Option(2000),
          arms: str = typer.Option("vector,bm25,graph_static,graph_learn"),
          out: Path = typer.Option(Path("eval/results"))):
    """Replay git history: every arm retrieves for each commit; the learning arm learns."""
    from .eval.replay import run_replay
    res = run_replay(_rt().store, path, name or path.resolve().name, window=window,
                     reindex_every=reindex_every, budget=budget, arms=tuple(arms.split(",")),
                     out_dir=out)
    typer.echo(json.dumps(res["summary"], indent=1))


@app.command()
def plot(result: Path = typer.Argument(..., exists=True, dir_okay=False),
         out: Path = typer.Option(Path("docs/img"))):
    """Render an eval result JSON to PNG charts."""
    from .eval.plots import plot as _plot
    for p in _plot(result, out):
        typer.echo(p)


@app.command()
def serve(host: str = "127.0.0.1", port: int = 8000):
    """Run the REST API for the dashboard."""
    import uvicorn
    uvicorn.run("desirepath.api:app", host=host, port=port)


@app.command()
def mcp():
    """Run the MCP server on stdio (for Claude Code, Cursor, …)."""
    from .mcp_server import main
    main()


if __name__ == "__main__":
    app()
