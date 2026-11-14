import os
import uuid

import pytest

from desirepath.adapters.memory_store import MemoryGraphStore

HYDRA = os.environ.get("DP_TEST_HYDRA") == "1"


def _hydra():
    from desirepath.adapters.hydra_store import HydraGraphStore
    return HydraGraphStore()


@pytest.fixture(params=["memory"] + (["hydra"] if HYDRA else []))
def store(request):
    s = MemoryGraphStore() if request.param == "memory" else _hydra()
    yield s
    s.close()


@pytest.fixture
def repo_key():
    return f"test-{uuid.uuid4().hex[:8]}"
