# Klew hosted demo: API + web app in one image. HydraDB runs as a separate service (see compose.prod.yml).
FROM node:22-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends git curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY pyproject.toml README.md LICENSE ./
COPY klew/ klew/
RUN pip install --no-cache-dir . && python -c "from klew.adapters.tokens import count_tokens; count_tokens('warm')"
COPY eval/results/ eval/results/
COPY --from=web /web/dist web/dist
# Demo repositories with full history (warm start learns from their past commits).
RUN git clone -q https://github.com/encode/httpx.git /repos/httpx \
 && git clone -q https://github.com/pallets/flask.git /repos/flask
COPY deploy/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && useradd -m klew && chown -R klew /app /repos
USER klew
ENV KLEW_RATE_PER_MIN=30 KLEW_WEB_DIR=/app/web/dist KLEW_RESULTS_DIR=/app/eval/results
EXPOSE 8000
ENTRYPOINT ["/entrypoint.sh"]
