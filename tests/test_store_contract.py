"""Both GraphStore implementations must agree. Run with DP_TEST_HYDRA=1 to include HydraDB."""
from desirepath import ids
from desirepath.schema import CALLS, CONTAINS, FILE, POINTS_TO, REPO, SYMBOL, TERM


def seed(store, repo):
    f1, f2 = ids.file_id(repo, "a.py"), ids.file_id(repo, "b.py")
    s1, s2, s3 = (ids.symbol_id(repo, q) for q in ("a.f", "a.g", "b.h"))
    store.upsert_nodes(FILE, [
        {"id": f1, "repo": repo, "key": "a.py", "path": "a.py", "tokens": 10, "sha": "x", "is_test": False},
        {"id": f2, "repo": repo, "key": "b.py", "path": "b.py", "tokens": 20, "sha": "y", "is_test": False},
    ])
    store.upsert_nodes(SYMBOL, [
        {"id": s, "repo": repo, "key": q, "qualname": q, "name": q.split(".")[-1], "kind": "function",
         "file_id": f, "path": p, "sig": f"def {q}():", "doc": "", "start": 1, "end": 2, "tokens": 5}
        for s, q, f, p in ((s1, "a.f", f1, "a.py"), (s2, "a.g", f1, "a.py"), (s3, "b.h", f2, "b.py"))
    ])
    store.upsert_edges(CONTAINS, [{"src": f1, "dst": s1, "w": 1.0}, {"src": f1, "dst": s2, "w": 1.0},
                                  {"src": f2, "dst": s3, "w": 1.0}])
    store.upsert_edges(CALLS, [{"src": s1, "dst": s3, "w": 0.5}, {"src": s2, "dst": s3, "w": 1.0}])
    return f1, f2, s1, s2, s3


def test_expand_both_directions(store, repo_key):
    f1, f2, s1, s2, s3 = seed(store, repo_key)
    out = sorted((n.src, n.dst, n.w) for n in store.expand(CALLS, "out", [s1, s2]))
    assert out == sorted([(s1, s3, 0.5), (s2, s3, 1.0)])
    inn = sorted((n.src, n.dst) for n in store.expand(CALLS, "in", [s3]))
    assert inn == sorted([(s3, s1), (s3, s2)])
    assert {n.dst for n in store.expand(CONTAINS, "in", [s3])} == {f2}
    store.delete_repo(repo_key)


def test_upsert_is_idempotent_and_updates_weight(store, repo_key):
    _, _, s1, _, s3 = seed(store, repo_key)
    store.upsert_edges(CALLS, [{"src": s1, "dst": s3, "w": 0.9}])
    out = store.expand(CALLS, "out", [s1])
    assert [(n.dst, n.w) for n in out] == [(s3, 0.9)]
    assert store.count_edges(CALLS, repo_key) == 2
    store.delete_repo(repo_key)


def test_learned_edge_stats_roundtrip(store, repo_key):
    f1, f2, *_ = seed(store, repo_key)
    t = ids.term_id(repo_key, "timeout")
    store.upsert_nodes(TERM, [{"id": t, "repo": repo_key, "key": "timeout", "text": "timeout"}])
    store.upsert_edges(POINTS_TO, [{"src": t, "dst": f2, "w": 0.6, "hits": 2, "misses": 1}])
    stats = store.edge_weights(POINTS_TO, [(t, f2), (t, f1)])
    assert stats == {(t, f2): {"w": 0.6, "hits": 2, "misses": 1}}
    store.delete_repo(repo_key)


def test_get_scan_delete(store, repo_key):
    f1, f2, s1, *_ = seed(store, repo_key)
    rows = store.get_nodes(SYMBOL, [s1], ["qualname", "sig"])
    assert rows == [{"id": s1, "qualname": "a.f", "sig": "def a.f():"}]
    assert {r["path"] for r in store.scan_nodes(FILE, repo_key, ["path"])} == {"a.py", "b.py"}
    store.delete_repo(repo_key)
    assert store.scan_nodes(FILE, repo_key, ["path"]) == []
    assert store.expand(CALLS, "out", [s1]) == []


def test_shortest_paths(store, repo_key):
    _, _, s1, s2, s3 = seed(store, repo_key)
    paths = store.shortest_paths(CALLS, s1, s2, max_len=3, k=2)
    assert paths and [p["key"] for p in paths[0]] == ["a.f", "b.h", "a.g"]
    store.delete_repo(repo_key)


def test_delete_nodes_detaches(store, repo_key):
    f1, f2, s1, s2, s3 = seed(store, repo_key)
    store.delete_nodes(SYMBOL, [s3])
    assert store.expand(CALLS, "out", [s1]) == []
    assert {n.dst for n in store.expand(CONTAINS, "out", [f1])} == {s1, s2}
    store.delete_repo(repo_key)


def test_list_nodes(store, repo_key):
    rid = ids.stable_id(repo_key, "repo")
    store.upsert_nodes(REPO, [{"id": rid, "repo": repo_key, "key": repo_key, "root": "/x"}])
    assert any(r["id"] == rid and r["root"] == "/x" for r in store.list_nodes(REPO, ["repo", "root"]))
    store.delete_repo(repo_key)
