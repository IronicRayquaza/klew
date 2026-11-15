#!/bin/sh
# Wait for HydraDB, index the demo repos once (with warm start), then serve API + site.
set -e
ADMIN="${HYDRA_ADMIN_URL:-http://hydradb:9090}"
echo "waiting for HydraDB at $ADMIN ..."
for i in $(seq 1 120); do
  curl -sf -o /dev/null "$ADMIN/readyz" && break
  sleep 1
done
for repo in httpx flask; do
  if python -c "
import sys
from klew.runtime import get_runtime
from klew.schema import FILE
sys.exit(0 if get_runtime().store.scan_nodes(FILE, '$repo', ('path',)) else 1)
"; then
    echo "$repo already indexed"
  else
    klew index /repos/$repo --name $repo --learn-history 300
  fi
done
exec klew serve --host 0.0.0.0 --port "${PORT:-8000}"
