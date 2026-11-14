"""Runtime configuration, read from environment variables with local-dev defaults."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


@dataclass(frozen=True)
class HydraConfig:
    uri: str = field(default_factory=lambda: os.environ.get("HYDRA_URI", "bolt://127.0.0.1:7687"))
    token: str = field(
        default_factory=lambda: os.environ.get("HYDRA_TOKEN", "local-development-token-32-bytes")
    )
    database: str = field(default_factory=lambda: os.environ.get("HYDRA_GRAPH", "default"))


@dataclass(frozen=True)
class Settings:
    store: str = field(default_factory=lambda: os.environ.get("DP_STORE", "hydra"))  # hydra | memory
    hydra: HydraConfig = field(default_factory=HydraConfig)
    state_dir: Path = field(
        default_factory=lambda: Path(os.environ.get("DP_STATE_DIR", ".desirepath")).resolve()
    )


def get_settings() -> Settings:
    return Settings()
