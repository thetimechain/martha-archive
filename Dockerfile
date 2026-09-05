# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=20.18.0

FROM node:${NODE_VERSION}-alpine AS base
WORKDIR /app
# Install pnpm directly via npm — corepack's pnpm signing verification fails
# on this image — pinned to the major version matching pnpm-lock.yaml's
# lockfileVersion (9.x) so the lockfile format always matches.
RUN npm install -g pnpm@9.15.9

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm run build

FROM base AS prune
COPY --from=build /app/package.json /app/pnpm-lock.yaml ./
COPY --from=build /app/node_modules ./node_modules
RUN pnpm prune --prod --no-optional

FROM node:${NODE_VERSION}-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=prune --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=build --chown=app:app /app/drizzle ./drizzle
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/data/entity-wiki-links.json ./data/entity-wiki-links.json
COPY --from=build --chown=app:app /app/data/places-geo.json ./data/places-geo.json
COPY --from=build --chown=app:app /app/package.json ./package.json
USER app
EXPOSE 8080
CMD ["node", "dist/server.js"]
