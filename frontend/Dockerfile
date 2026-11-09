# Build the Angular app, then serve it with Caddy. Build context: this folder.
FROM node:22-slim AS web
WORKDIR /web
COPY package.json package-lock.json ./
RUN npm ci
COPY . ./
RUN npx ng build

FROM caddy:2
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=web /web/dist/web/browser /srv/web
