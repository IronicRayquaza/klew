"""Tokenization shared by seeding, learning, and the lexical baselines.

Identifiers are split on snake_case and camelCase so that a task saying "read timeout"
meets a symbol called `ReadTimeout` or `read_timeout`.
"""
from __future__ import annotations

import re

_WORD = re.compile(r"[A-Za-z][A-Za-z0-9]*")
_CAMEL = re.compile(r"[A-Z]+(?=[A-Z][a-z])|[A-Z]?[a-z]+|[A-Z]+|[0-9]+")

STOPWORDS = frozenset(
    """a an the and or of to in on for with without from by at as is are was were be been being
    this that these those it its into via not no yes do does did done can could should would will
    shall may might must if else then than so such but also all any each every some more most
    use used using add added adds adding fix fixed fixes fixing update updated updates updating
    change changed changes make makes made remove removed removes support supports allow allows
    new now when where which who what why how there here we our you your they them i me my
    self cls none true false return returns def class import from pass
    pr issue issues bump version release minor typo docs doc readme
    py python file files code
    while handle handles handled handling properly correctly instead case cases able
    ensure ensures avoid avoids improve improves improved minor small tweak tweaks
    refactor refactors refactored cleanup clean tidy unused related various""".split()
)


def _stem(w: str) -> str:
    for suf in ("ization", "ations", "ation", "ings", "ing", "ers", "ies", "ed", "es", "er", "s"):
        if len(w) > len(suf) + 3 and w.endswith(suf):
            return w[: -len(suf)] + ("y" if suf == "ies" else "")
    return w


def split_identifier(ident: str) -> list[str]:
    out: list[str] = []
    for part in ident.replace("-", "_").split("_"):
        out.extend(m.group(0) for m in _CAMEL.finditer(part))
    return out


def tokenize(text: str, *, keep_stopwords: bool = False) -> list[str]:
    """Lowercased, stemmed tokens. Identifiers are split into their words."""
    toks: list[str] = []
    for m in _WORD.finditer(text):
        for piece in split_identifier(m.group(0)):
            w = piece.lower()
            if len(w) < 2:
                continue
            if not keep_stopwords and w in STOPWORDS:
                continue
            toks.append(_stem(w))
    return toks


def identifiers(text: str) -> set[str]:
    """Raw code-looking identifiers in free text: snake_case, CamelCase, dotted.paths, `ticked`."""
    found: set[str] = set()
    for m in re.finditer(r"`([^`]+)`", text):
        found.update(re.findall(r"[A-Za-z_][A-Za-z0-9_]*", m.group(1)))
    for m in re.finditer(r"\b[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+\b", text):
        found.update(m.group(0).split("."))
    for m in re.finditer(r"\b[a-z]+_[a-z0-9_]+\b|\b[A-Z][a-z0-9]+[A-Z][A-Za-z0-9]*\b", text):
        found.add(m.group(0))
    return {f for f in found if len(f) > 2 and f.lower() not in STOPWORDS}
