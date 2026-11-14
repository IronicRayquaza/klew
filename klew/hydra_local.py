"""Run a local HydraDB node in Docker for `pip install klew` users (no compose file needed).

Plaintext + the HydraDB development token: local use only. Data lives in the Docker volume
`klew-hydradb-store`, so it survives `klew hydra down` / `up`.
"""
from __future__ import annotations

import shutil
import subprocess
import time
import urllib.request
from pathlib import Path

IMAGE = "ghcr.io/hydra-db/hydradb:latest"
CONTAINER = "klew-hydradb"
VOLUME = "klew-hydradb-store"
DEV_TOKEN = "local-development-token-32-bytes"
TOKEN_FILE = Path.home() / ".klew" / "hydra" / "auth-token"
ENV = {
    "CLOUD_PROVIDER": "local", "LOCAL_PATH": "/tmp/graph", "GRAPH_NAMESPACE": "default",
    "GRAPH_ID": "default", "GRAPH_CELL_ID": "cell-0", "GRAPH_CELLS": "cell-0", "GRAPH_NODE_ID": "node-0",
    "GRAPH_BOLT_ADDR": "0.0.0.0:7687", "GRAPH_HTTP_ADDR": "0.0.0.0:8443", "GRAPH_ADMIN_ADDR": "0.0.0.0:9090",
    "GRAPH_BOLT_NODE_ADDRESSES": "node-0=127.0.0.1:7687", "GRAPH_ADVERTISED_BOLT_ADDR": "127.0.0.1:7687",
    "GRAPH_DATA_CACHE_DIR": "/var/cache/slatedb", "GRAPH_AUTH_TOKEN_FILE": "/run/hydradb/auth-token",
    "GRAPH_ALLOW_PLAINTEXT": "true", "GRAPH_USAGE_REPORT_ENABLED": "false", "GRAPH_CYPHER_ENGINE": "legacy",
    "RUST_MIN_STACK": "33554432",
}


def _docker(*args: str, check: bool = True) -> subprocess.CompletedProcess:
    if not shutil.which("docker"):
        raise RuntimeError("Docker is not installed or not on PATH. Install Docker Desktop, then retry.")
    return subprocess.run(["docker", *args], capture_output=True, text=True, check=check)


def ready(admin: str = "http://127.0.0.1:9090") -> bool:
    try:
        with urllib.request.urlopen(f"{admin}/readyz", timeout=2) as r:
            return r.status == 200
    except OSError:
        return False


def up(wait_s: int = 90) -> str:
    if ready():
        return "HydraDB is already running on bolt://127.0.0.1:7687"
    state = _docker("inspect", "-f", "{{.State.Status}}", CONTAINER, check=False)
    if state.returncode == 0:
        _docker("start", CONTAINER)
    else:
        TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
        if not TOKEN_FILE.exists():
            TOKEN_FILE.write_text(DEV_TOKEN + "\n")
        TOKEN_FILE.chmod(0o644)
        args = ["run", "-d", "--name", CONTAINER, "-p", "7687:7687", "-p", "8443:8443", "-p", "9090:9090",
                "-v", f"{VOLUME}:/tmp/graph", "-v", f"{TOKEN_FILE}:/run/hydradb/auth-token:ro"]
        for k, v in ENV.items():
            args += ["-e", f"{k}={v}"]
        _docker(*args, IMAGE)
    deadline = time.time() + wait_s
    while time.time() < deadline:
        if ready():
            return "HydraDB is up on bolt://127.0.0.1:7687 (local development mode)"
        time.sleep(1)
    raise RuntimeError(f"HydraDB did not become ready within {wait_s}s; check `docker logs {CONTAINER}`.")


def down() -> str:
    r = _docker("stop", CONTAINER, check=False)
    return "HydraDB stopped (data kept in the Docker volume)." if r.returncode == 0 else "HydraDB was not running."


def status() -> str:
    return "HydraDB: ready on bolt://127.0.0.1:7687" if ready() else "HydraDB: not running (start it with `klew hydra up`)"
