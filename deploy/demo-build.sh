#!/bin/bash
# Build time: start HydraDB, index the demo repos with warm start (learn from history), stop HydraDB.
set -e
. /opt/klew/demo-env.sh
mkdir -p /data/graph /data/cache
printf '%s\n' 'local-development-token-32-bytes' > /data/auth-token
graph-node > /tmp/graph-node.log 2>&1 &
NODE=$!
for i in $(seq 1 120); do curl -sf -o /dev/null http://127.0.0.1:9090/readyz && break; sleep 1; done
klew index /repos/httpx --name httpx --learn-history 300
klew index /repos/flask --name flask --learn-history 300
kill $NODE; wait $NODE || true
