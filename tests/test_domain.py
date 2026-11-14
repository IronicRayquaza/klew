"""Pure domain tests: no HydraDB, no disk."""
from klew import ids
from klew.adapters.memory_store import MemoryGraphStore
from klew.domain import learning
from klew.domain.packer import (
    RankedFile,
    fuse_ranks,
    pack,
    promote_companions,
    rank_files,
    why_path,
)
from klew.domain.seeder import Lexicon, Seed, lexical_seeds, merge_seeds
from klew.domain.walker import walk
from klew.schema import CALLS, CONTAINS, FILE, SYMBOL
from klew.text import identifiers, tokenize


def test_tokenize_splits_identifiers_and_drops_stopwords():
    assert tokenize("Raise ReadTimeout for the read_timeout") == ["raise", "read", "timeout", "read", "timeout"]
    assert "test" in tokenize("test the parser")  # tests are a real signal


def test_identifiers_finds_code_mentions():
    assert {"Client", "send", "ReadTimeout", "url_parse"} <= identifiers(
        "`Client.send` raises ReadTimeout from url_parse")


def test_learning_reinforces_truth_and_decays_served_misses():
    t, f_hit, f_miss = 1, 10, 20
    cur = {(t, f_miss): {"w": 0.5, "hits": 1, "misses": 0}}
    d = learning.apply([t], served=[f_miss, f_hit], truth=[f_hit], pt_current=cur, cc_current={})
    by = {(u.src, u.dst): u for u in d.points_to}
    assert by[(t, f_hit)].w == 0.35 and by[(t, f_hit)].hits == 1          # created and reinforced
    assert by[(t, f_miss)].w == 0.425 and by[(t, f_miss)].misses == 1     # decayed by beta
    assert d.created == 1 and d.decayed == 1


def test_learning_converges_and_stays_bounded():
    w = 0.0
    cur = {}
    for _ in range(30):
        d = learning.apply([1], [], [2], cur, {})
        w = d.points_to[0].w
        cur = {(1, 2): {"w": w, "hits": 0, "misses": 0}}
    assert 0.99 < w <= 1.0


def test_learning_skips_sweeping_changes_and_links_cochanged_files():
    d = learning.apply([1], [], list(range(100, 130)), {}, {})
    assert not d.points_to and not d.co_changed
    d = learning.apply([1], [], [7, 8], {}, {})
    assert {(u.src, u.dst) for u in d.co_changed} == {(7, 8), (8, 7)}


def _toy():
    st = MemoryGraphStore()
    repo = "toy"
    f_a, f_b = ids.file_id(repo, "a.py"), ids.file_id(repo, "b.py")
    s_f, s_g = ids.symbol_id(repo, "a.parse_url"), ids.symbol_id(repo, "b.normalize")
    st.upsert_nodes(FILE, [{"id": f_a, "repo": repo, "path": "a.py", "key": "a.py"},
                           {"id": f_b, "repo": repo, "path": "b.py", "key": "b.py"}])
    st.upsert_nodes(SYMBOL, [
        {"id": s_f, "repo": repo, "key": "a.parse_url", "qualname": "a.parse_url", "name": "parse_url",
         "file_id": f_a, "kind": "function", "sig": "def parse_url(s)", "doc": "Parse a URL.",
         "start": 1, "end": 3},
        {"id": s_g, "repo": repo, "key": "b.normalize", "qualname": "b.normalize", "name": "normalize",
         "file_id": f_b, "kind": "function", "sig": "def normalize(p)", "doc": "", "start": 1, "end": 2}])
    st.upsert_edges(CONTAINS, [{"src": f_a, "dst": s_f, "w": 1.0}, {"src": f_b, "dst": s_g, "w": 1.0}])
    st.upsert_edges(CALLS, [{"src": s_f, "dst": s_g, "w": 1.0}])
    return st, repo, (f_a, f_b, s_f, s_g)


def test_walk_reaches_callee_file_with_why_path():
    st, repo, (f_a, f_b, s_f, s_g) = _toy()
    res = walk(st, [Seed(s_f, SYMBOL, 1.0, "seed")], hops=3)
    ranked = rank_files(res, {s_f: f_a, s_g: f_b}, {f_a, f_b})
    assert [r.file_id for r in ranked] == [f_a, f_b]
    keys = {f_a: "a.py", f_b: "b.py", s_f: "a.parse_url", s_g: "b.normalize"}
    path = why_path(res, ranked[1], keys.get)
    assert [s.node for s in path] == ["a.parse_url", "b.normalize", "b.py"]
    assert [s.via for s in path] == [None, "calls", "defined in"]


def test_lexical_seeds_prefer_exact_identifier():
    st, repo, (f_a, f_b, s_f, s_g) = _toy()
    lex = Lexicon.build(st.scan_nodes(FILE, repo, ["path"]),
                        st.scan_nodes(SYMBOL, repo, ["qualname", "name", "kind", "file_id", "doc"]))
    seeds = lexical_seeds(lex, "bug in `normalize` for urls")
    assert seeds[0].node_id == s_g and "normalize" in seeds[0].reason


def test_merge_seeds_adds_learned_signal():
    a = [Seed(1, FILE, 0.5, "lex")]
    b = [Seed(1, FILE, 0.4, "learned"), Seed(2, FILE, 0.9, "learned")]
    m = {s.node_id: s.score for s in merge_seeds(a, b)}
    assert m == {1: 0.9, 2: 0.9}


def test_pack_respects_budget():
    st, repo, (f_a, f_b, s_f, s_g) = _toy()
    res = walk(st, [Seed(s_f, SYMBOL, 1.0, "seed")], hops=3)
    ranked = rank_files(res, {s_f: f_a, s_g: f_b}, {f_a, f_b})
    rows = {r["id"]: r for r in st.get_nodes(SYMBOL, [s_f, s_g], ["sig", "doc", "start", "end"])}
    items = pack(ranked, 12, path_of={f_a: "a.py", f_b: "b.py"}.get, sym_rows=rows,
                 snippet_of=None, why_of=lambda r: [], seed_reason={})
    assert sum(i.tokens for i in items) <= 12 and len(items) >= 1


def test_companions_are_promoted_with_a_why_step():
    st, repo, (f_a, f_b, s_f, s_g) = _toy()
    res = walk(st, [Seed(s_f, SYMBOL, 1.0, "seed")], hops=1)
    ranked = rank_files(res, {s_f: f_a, s_g: f_b}, {f_a, f_b})
    test_file = 999
    out = promote_companions(ranked, {f_a: [(test_file, "tested in")]}, top_k=1, weight=0.5)
    comp = next(r for r in out if r.file_id == test_file)
    assert comp.score == ranked[0].score * 0.5 or comp.score > 0
    keys = {f_a: "a.py", f_b: "b.py", s_f: "a.parse_url", test_file: "tests/test_a.py"}
    by_id = {r.file_id: r for r in out}
    path = why_path(res, comp, lambda n: keys.get(n, str(n)), by_id)
    assert path[-1].node == "tests/test_a.py" and path[-1].via == "tested in"
    assert isinstance(out[0], RankedFile)


def test_protected_head_is_not_reordered_by_companions():
    a = RankedFile(1, 10.0, [], 1)
    b = RankedFile(2, 5.0, [], 2)
    c = RankedFile(3, 1.0, [], 3)
    out = promote_companions([a, b, c], {1: [(9, "tested in")]}, top_k=1, weight=0.9, protect=2)
    assert [r.file_id for r in out[:2]] == [1, 2]
    assert next(r for r in out if r.file_id == 9).score < 5.0


def test_relevance_cutoff_stops_packing_weak_tail():
    ranked = [RankedFile(i, s, [], i) for i, s in enumerate([10.0, 9.0, 8.0, 0.5, 0.4], start=1)]
    items = pack(ranked, 10_000, path_of=lambda f: f"f{f}.py", sym_rows={}, snippet_of=None,
                 why_of=lambda r: [], seed_reason={}, max_items=30, min_relative=0.1, min_items=2)
    assert [i.path for i in items] == ["f1.py", "f2.py", "f3.py"]


def test_rank_fusion_promotes_files_both_rankers_agree_on():
    graph = [RankedFile(1, 9.0, [], 1), RankedFile(2, 8.0, [], 2), RankedFile(3, 7.0, [], 3)]
    out = fuse_ranks(graph, external=[3, 2, 4], k=10, weight=1.0)
    assert {r.file_id for r in out[:2]} == {2, 3}          # in both lists beats graph-only #1
    assert out[2].file_id == 1
    added = next(r for r in out if r.file_id == 4)
    assert added.via == (4, "text match")
    assert why_path(None, added, lambda n: f"f{n}.py")[0].via == "text match"
    assert next(r for r in out if r.file_id == 1).score == 9.0   # displayed score unchanged
