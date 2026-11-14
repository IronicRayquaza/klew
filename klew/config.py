"""Runtime configuration, read from environment variables with local-dev defaults."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


def _token() -> str:
    path = os.environ.get("HYDRA_TOKEN_FILE")
    if path and os.path.exists(path):
        return open(path).read().strip()
    return os.environ.get("HYDRA_TOKEN", "local-development-token-32-bytes")


@dataclass(frozen=True)
class HydraConfig:
    uri: str = field(default_factory=lambda: os.environ.get("HYDRA_URI", "bolt://127.0.0.1:7687"))
    token: str = field(default_factory=lambda: _token())
    database: str = field(default_factory=lambda: os.environ.get("HYDRA_GRAPH", "default"))


@dataclass(frozen=True)
class Settings:
    store: str = field(default_factory=lambda: os.environ.get("KLEW_STORE", "hydra"))  # hydra | memory
    hydra: HydraConfig = field(default_factory=HydraConfig)
    state_dir: Path = field(
        default_factory=lambda: Path(os.environ.get("KLEW_STATE_DIR", ".klew")).resolve()
    )


def get_settings() -> Settings:
    return Settings()
