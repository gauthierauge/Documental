# Image de production du monorepo. Construire depuis la racine : docker build -f infrastructure/docker/Dockerfile -t documental .
# Vérifier qu'elle démarre (santé, non root, lecture seule) : make smoke
FROM oven/bun:1.4.2-slim@sha256:cb3bbbb08e13a4a2ff400f24c7a2a1d5efa83f6ef8544d52d95a519631e2fc61 AS build
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
COPY packages/ui/package.json packages/ui/
RUN bun install --frozen-lockfile
COPY . .
# L'écran et ses jetons de design, compilés ici : rien de généré ne vient de la machine.
RUN bun run build && rm -rf apps/*/src/test packages/*/src/test

FROM oven/bun:1.4.2-slim@sha256:cb3bbbb08e13a4a2ff400f24c7a2a1d5efa83f6ef8544d52d95a519631e2fc61 AS deps
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
COPY packages/ui/package.json packages/ui/
RUN bun install --frozen-lockfile --production --ignore-scripts

FROM oven/bun:1.4.2-slim@sha256:cb3bbbb08e13a4a2ff400f24c7a2a1d5efa83f6ef8544d52d95a519631e2fc61
WORKDIR /app
# Pas de cache de transpilation : le système de fichiers est en lecture seule (compose.yaml).
ENV NODE_ENV=production PORT=8787 BUN_RUNTIME_TRANSPILER_CACHE_PATH=0
# Les fichiers de l'app appartiennent à root : l'utilisateur bun les lit sans pouvoir les modifier.
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.base.json ./
COPY --from=build /app/apps/api/package.json /app/apps/api/tsconfig.json ./apps/api/
COPY --from=build /app/apps/api/src ./apps/api/src
COPY apps/api/drizzle ./apps/api/drizzle
COPY packages/contracts/package.json packages/contracts/tsconfig.json ./packages/contracts/
COPY --from=build /app/packages/contracts/src ./packages/contracts/src
COPY --from=build /app/apps/web/dist ./apps/web/dist
WORKDIR /app/apps/api
# Jamais root dans le conteneur : l'utilisateur bun de l'image (1000), en numérique.
USER 1000:1000
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s CMD ["bun", "-e", "fetch('http://localhost:8787/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["bun", "src/main.ts"]
