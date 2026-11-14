"""Read commit history with the git CLI: replay tasks, ground truth, and co-change counts."""
from __future__ import annotations

import math
import subprocess
from collections import Counter
from dataclasses import dataclass, field
from itertools import combinations
from pathlib import Path


@dataclass
class Commit:
    sha: str
    ts: int
    subject: str
    body: str
    changed: list[str] = field(default_factory=list)   # modified/renamed-to .py paths
    added: list[str] = field(default_factory=list)
    deleted: list[str] = field(default_factory=list)

    @property
    def task(self) -> str:
        body = "\n".join(ln for ln in self.body.splitlines()
                         if not ln.lower().startswith(("co-authored-by", "signed-off-by")))
        return (self.subject + "\n\n" + body).strip()


def _git(root: Path, *args: str) -> str:
    return subprocess.run(["git", "-C", str(root), *args], check=True, capture_output=True,
                          text=True, errors="replace").stdout


def commits(root: Path, rev_range: str = "HEAD", max_count: int | None = None,
            paths: tuple[str, ...] = ("*.py",)) -> list[Commit]:
    """Non-merge commits touching `paths`, oldest first."""
    args = ["log", "--no-merges", "--reverse", "-M", "--name-status",
            "--format=%x1e%H%x1f%at%x1f%s%x1f%b%x1f"]
    if max_count:
        args.append(f"--max-count={max_count}")
    out = _git(root, *args, rev_range, "--", *paths)
    result: list[Commit] = []
    for rec in out.split("\x1e"):
        if not rec.strip():
            continue
        head, _, files = rec.rpartition("\x1f")
        sha, ts, subject, body = (head.split("\x1f") + ["", "", "", ""])[:4]
        c = Commit(sha.strip(), int(ts or 0), subject.strip(), body.strip())
        for line in files.strip().splitlines():
            parts = line.split("\t")
            if len(parts) < 2:
                continue
            status, path = parts[0], parts[-1]
            if not path.endswith(".py"):
                continue
            if status.startswith("A"):
                c.added.append(path)
            elif status.startswith("D"):
                c.deleted.append(path)
            else:
                c.changed.append(path)
        result.append(c)
    if max_count and len(result) > max_count:
        result = result[-max_count:]
    return result


def head_sha(root: Path, rev: str = "HEAD") -> str:
    return _git(root, "rev-parse", rev).strip()


def worktree(root: Path, sha: str, dest: Path) -> Path:
    """Materialize `sha` at `dest` (a detached worktree) for snapshot indexing."""
    dest = dest.resolve()
    if dest.exists():
        _git(dest, "checkout", "-q", "--detach", sha)
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    _git(root, "worktree", "prune")  # forget worktrees whose directories were deleted
    _git(root, "worktree", "add", "-q", "--detach", str(dest), sha)
    return dest


def remove_worktree(root: Path, dest: Path) -> None:
    try:
        _git(root, "worktree", "remove", "--force", str(dest.resolve()))
    except subprocess.CalledProcessError:
        _git(root, "worktree", "prune")


@dataclass
class CoChange:
    pair_counts: Counter
    file_counts: Counter

    def weight(self, a: str, b: str) -> float:
        c = self.pair_counts.get((a, b)) or self.pair_counts.get((b, a)) or 0
        if not c:
            return 0.0
        return c / math.sqrt(self.file_counts[a] * self.file_counts[b])


def co_change(history: list[Commit], max_files: int = 12) -> CoChange:
    """Count how often files change together. Large sweeping commits are ignored as noise."""
    pairs: Counter = Counter()
    files: Counter = Counter()
    for c in history:
        touched = sorted(set(c.changed + c.added))
        if not touched or len(touched) > max_files:
            continue
        files.update(touched)
        pairs.update(combinations(touched, 2))
    return CoChange(pairs, files)
