#!/bin/bash
# Run time: HydraDB on loopback, then the Klew API + site on $PORT. If either exits, the container exits.
. /opt/klew/demo-env.sh
graph-node &
NODE=$!
for i in $(seq 1 120); do curl -sf -o /dev/null http://127.0.0.1:9090/readyz && break; sleep 1; done
klew serve --host 0.0.0.0 --port "${PORT:-7860}" &
SERVE=$!
# Warm both engines (name index, text ranker, tokenizer) so a visitor's first query isn't the slow one.
(
  for i in $(seq 1 120); do curl -sf -o /dev/null "http://127.0.0.1:${PORT:-7860}/api/health" && break; sleep 1; done
  for repo in httpx flask; do
    curl -s -o /dev/null -X POST "http://127.0.0.1:${PORT:-7860}/api/context" -H 'Content-Type: application/json' \
      -d "{\"repo\": \"$repo\", \"task\": \"warm up the engine\", \"budget_tokens\": 500}"
  done
) &
# Exit (so the platform restarts us) only if HydraDB or the API dies, not when the warm-up finishes.
wait -n $NODE $SERVE
exit 1
