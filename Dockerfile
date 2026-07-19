# ── SwarmAI / Maya — HuggingFace Space Dockerfile ────────────────────────────
# Builds the full monorepo: API server + dashboard, served from one container.
# Exposes the dashboard (Vite preview) on $PORT and the API on $PORT_API.
#
# Required HuggingFace Space secrets (set in Space Settings → Repository secrets):
#   SUPABASE_URL          — Supabase project URL (https://<id>.supabase.co)
#   SUPABASE_ANON_KEY     — Supabase anon/public key
#   SUPABASE_SERVICE_ROLE_KEY — Supabase service role key (server-only)
#   SUPABASE_DB_URL       — Supabase direct Postgres connection string
#   OPENROUTER_API_KEY    — OpenRouter API key (for LLM inference)
#   NVIDIA_API_KEY        — NVIDIA NIM API key (for LLM inference)
#   GITHUB_TOKEN          — GitHub PAT (for repo creation + push)
#   HF_TOKEN              — HuggingFace token (for Spaces/Inference, if needed)

FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    git python3 make g++ libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY lib/ ./lib/
COPY artifacts/api-server/ ./artifacts/api-server/
COPY artifacts/swarm-dashboard/ ./artifacts/swarm-dashboard/
COPY scripts/ ./scripts/

RUN pnpm install --frozen-lockfile

RUN pnpm --filter @workspace/api-server run build && \
    pnpm --filter @workspace/swarm-dashboard run build

ENV NODE_ENV=production
ENV PORT=7860
ENV PORT_API=3001

EXPOSE 7860 3001

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

CMD ["/docker-entrypoint.sh"]
