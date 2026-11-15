# Shared HydraDB settings for the single-container demo (sourced by the build and start scripts).
export CLOUD_PROVIDER=local LOCAL_PATH=/data/graph GRAPH_NAMESPACE=default GRAPH_ID=default
export GRAPH_CELL_ID=cell-0 GRAPH_CELLS=cell-0 GRAPH_NODE_ID=node-0
export GRAPH_BOLT_ADDR=127.0.0.1:7687 GRAPH_HTTP_ADDR=127.0.0.1:8443 GRAPH_ADMIN_ADDR=127.0.0.1:9090
export GRAPH_BOLT_NODE_ADDRESSES=node-0=127.0.0.1:7687 GRAPH_ADVERTISED_BOLT_ADDR=127.0.0.1:7687
export GRAPH_DATA_CACHE_DIR=/data/cache GRAPH_DATA_CACHE_BYTES=67108864
export GRAPH_AUTH_TOKEN_FILE=/data/auth-token GRAPH_ALLOW_PLAINTEXT=true   # loopback only, never exposed
export GRAPH_USAGE_REPORT_ENABLED=false GRAPH_CYPHER_ENGINE=legacy RUST_MIN_STACK=33554432 RUST_LOG=warn
export HYDRA_URI=bolt://127.0.0.1:7687 HYDRA_TOKEN_FILE=/data/auth-token
