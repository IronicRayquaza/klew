"""Parse a Python repository into files, symbols, imports, calls and inheritance with tree-sitter.

Name resolution is best-effort and static: we resolve through each file's imports, its own
top-level definitions, `self.`/`cls.` method lookups, and (when unambiguous) global names.
Learned edges make up for what static resolution misses.
"""
from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass, field
from pathlib import Path

import tree_sitter_python as tsp
from tree_sitter import Language, Node, Parser

from ..text import tokenize
from .tokens import count_tokens

_PY = Language(tsp.language())
SKIP_DIRS = {".git", ".venv", "venv", "env", "node_modules", "build", "dist", "site-packages",
             "__pycache__", ".tox", ".nox", ".mypy_cache", ".pytest_cache", ".eggs"}
MAX_FILE_BYTES = 400_000


@dataclass
class ParsedSymbol:
    qualname: str
    name: str
    kind: str            # class | function | method | test
    sig: str
    doc: str
    start: int           # 1-based inclusive line numbers
    end: int
    tokens: int
    calls: set[tuple[str, str]] = field(default_factory=set)  # (receiver, name); receiver "" | "self" | "x"
    bases: list[str] = field(default_factory=list)
    parent_class: str | None = None
    terms: str = ""      # distinctive words used in the body (for lexical seeding)


@dataclass
class ParsedFile:
    path: str            # repo-relative, posix
    module: str          # dotted module name
    sha: str
    tokens: int
    is_test: bool
    symbols: list[ParsedSymbol]
    # local name -> dotted target ("pkg.mod" or "pkg.mod.Name"), from import statements
    bindings: dict[str, str]
    imported_modules: set[str]
    doc: str = ""


def module_name(path: str) -> str:
    parts = Path(path).with_suffix("").parts
    if parts and parts[0] == "src" and len(parts) > 1:
        parts = parts[1:]
    if parts and parts[-1] == "__init__":
        parts = parts[:-1]
    return ".".join(parts)


def is_test_path(path: str) -> bool:
    p = Path(path)
    return (any(seg in ("tests", "test", "testing") for seg in p.parts[:-1])
            or p.name.startswith("test_") or p.name.endswith("_test.py") or p.name == "conftest.py")


def iter_python_files(root: Path):
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS and not d.startswith("."))
        for fn in sorted(filenames):
            if fn.endswith(".py"):
                full = Path(dirpath) / fn
                if full.stat().st_size <= MAX_FILE_BYTES:
                    yield full


def _text(node: Node | None) -> str:
    return node.text.decode("utf-8", "replace") if node is not None and node.text else ""


MAX_BODY_TERMS = 48


def _body_terms(body_text: str, own: set[str]) -> str:
    seen: dict[str, None] = {}
    for t in tokenize(body_text):
        if t not in own and t not in seen:
            seen[t] = None
            if len(seen) >= MAX_BODY_TERMS:
                break
    return " ".join(seen)


def _docstring(block: Node | None) -> str:
    if block is None:
        return ""
    for child in block.children:
        if child.type == "expression_statement":
            s = child.children[0] if child.children else None
            if s is not None and s.type == "string":
                raw = _text(s).strip("rRbBuUfF")
                raw = raw.strip('"').strip("'").strip()
                return raw.splitlines()[0].strip() if raw else ""
            return ""
        if child.type not in ("comment",):
            return ""
    return ""


def _signature(node: Node, src: bytes) -> str:
    body = node.child_by_field_name("body")
    end = body.start_byte if body is not None else node.end_byte
    raw = src[node.start_byte:end].decode("utf-8", "replace")
    lines = [ln.split(" #", 1)[0].rstrip() for ln in raw.splitlines() if not ln.strip().startswith("#")]
    sig = " ".join(" ".join(lines).split()).rstrip(":").strip()
    return sig[:300]


def _collect_calls(node: Node, out: set[tuple[str, str]]) -> None:
    stack = [node]
    while stack:
        n = stack.pop()
        if n.type == "call":
            fn = n.child_by_field_name("function")
            if fn is not None:
                if fn.type == "identifier":
                    out.add(("", _text(fn)))
                elif fn.type == "attribute":
                    obj = fn.child_by_field_name("object")
                    attr = fn.child_by_field_name("attribute")
                    recv = _text(obj) if obj is not None and obj.type == "identifier" else "?"
                    out.add((recv, _text(attr)))
        # Do not descend into nested defs/classes: they are their own symbols.
        for c in n.children:
            if c.type not in ("function_definition", "class_definition", "decorated_definition"):
                stack.append(c)


def _resolve_relative(module: str, is_pkg: bool, level: int, name: str) -> str:
    base = module.split(".") if module else []
    if not is_pkg:
        base = base[:-1]
    if level > 1:
        base = base[: len(base) - (level - 1)] if level - 1 <= len(base) else []
    return ".".join([*base, name] if name else base)


def _imports(root: Node, module: str, is_pkg: bool) -> tuple[dict[str, str], set[str]]:
    bindings: dict[str, str] = {}
    modules: set[str] = set()
    stack = [root]
    while stack:
        n = stack.pop()
        if n.type == "import_statement":
            for c in n.named_children:
                if c.type == "dotted_name":
                    full = _text(c)
                    modules.add(full)
                    bindings[full.split(".")[0]] = full.split(".")[0]
                elif c.type == "aliased_import":
                    full = _text(c.child_by_field_name("name"))
                    modules.add(full)
                    bindings[_text(c.child_by_field_name("alias"))] = full
        elif n.type == "import_from_statement":
            mod_node = n.child_by_field_name("module_name")
            if mod_node is None:
                continue
            if mod_node.type == "relative_import":
                prefix = next((c for c in mod_node.children if c.type == "import_prefix"), None)
                level = len(_text(prefix)) if prefix is not None else 1
                dn = next((c for c in mod_node.children if c.type == "dotted_name"), None)
                target = _resolve_relative(module, is_pkg, level, _text(dn))
            else:
                target = _text(mod_node)
            modules.add(target)
            for c in n.named_children:
                if c is mod_node:
                    continue
                if c.type == "dotted_name":
                    nm = _text(c)
                    bindings[nm.split(".")[-1]] = f"{target}.{nm}" if target else nm
                elif c.type == "aliased_import":
                    nm = _text(c.child_by_field_name("name"))
                    alias = _text(c.child_by_field_name("alias"))
                    bindings[alias] = f"{target}.{nm}" if target else nm
        else:
            # imports inside functions / try blocks / if TYPE_CHECKING still count
            if n.type not in ("string", "comment"):
                stack.extend(n.children)
    return bindings, modules


def parse_file(root: Path, full: Path) -> ParsedFile:
    rel = full.relative_to(root).as_posix()
    src = full.read_bytes()
    text = src.decode("utf-8", "replace")
    tree = Parser(_PY).parse(src)
    module = module_name(rel)
    is_pkg = full.name == "__init__.py"
    test_file = is_test_path(rel)
    symbols: list[ParsedSymbol] = []

    def visit(block: Node, prefix: str, parent_class: str | None) -> None:
        for child in block.children:
            node = child
            if node.type == "decorated_definition":
                node = node.child_by_field_name("definition") or node
            if node.type not in ("function_definition", "class_definition"):
                continue
            name = _text(node.child_by_field_name("name"))
            qual = f"{prefix}.{name}" if prefix else name
            body = node.child_by_field_name("body")
            start, end = child.start_point[0] + 1, child.end_point[0] + 1
            body_text = "\n".join(text.splitlines()[start - 1 : end])
            if node.type == "class_definition":
                bases: list[str] = []
                sup = node.child_by_field_name("superclasses")
                if sup is not None:
                    for b in sup.named_children:
                        if b.type in ("identifier", "attribute"):
                            bases.append(_text(b))
                sym = ParsedSymbol(qual, name, "class", _signature(node, src), _docstring(body),
                                   start, end, count_tokens(body_text), bases=bases,
                                   parent_class=parent_class)
                symbols.append(sym)
                if body is not None:
                    visit(body, qual, qual)
            else:
                kind = "method" if parent_class else "function"
                if test_file and name.startswith("test"):
                    kind = "test"
                sym = ParsedSymbol(qual, name, kind, _signature(node, src), _docstring(body),
                                   start, end, count_tokens(body_text), parent_class=parent_class,
                                   terms=_body_terms(body_text, set(tokenize(name))))
                if body is not None:
                    _collect_calls(body, sym.calls)
                symbols.append(sym)
                if body is not None:
                    visit(body, qual, None)  # nested functions

    visit(tree.root_node, module, None)
    bindings, imported = _imports(tree.root_node, module, is_pkg)
    return ParsedFile(
        path=rel, module=module, sha=hashlib.sha1(src).hexdigest(), tokens=count_tokens(text),
        is_test=test_file, symbols=symbols, bindings=bindings, imported_modules=imported,
        doc=_docstring(tree.root_node),
    )


def parse_repo(root: Path) -> list[ParsedFile]:
    root = root.resolve()
    files = []
    for full in iter_python_files(root):
        try:
            files.append(parse_file(root, full))
        except (OSError, UnicodeError):
            continue
    return files


def read_span(root: Path, path: str, start: int, end: int) -> str:
    try:
        lines = (root / path).read_text("utf-8", "replace").splitlines()
    except OSError:
        return ""
    return "\n".join(lines[max(0, start - 1) : end])
