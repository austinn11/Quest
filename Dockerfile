FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY . .
# Railway passes public service variables as Docker build arguments.
# These values are compiled into the frontend. Never add private keys here.
ARG VITE_SPACETIMEDB_HOST
ARG VITE_SPACETIMEDB_DB_NAME
ARG VITE_SPACETIMEAUTH_CLIENT_ID
ARG VITE_MAP_STYLE_URL=https://tiles.openfreemap.org/styles/liberty
ARG VITE_MAP_DEFAULT_LATITUDE=32.9858
ARG VITE_MAP_DEFAULT_LONGITUDE=-96.7501
RUN npm run build

FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
ENV PORT=8080
EXPOSE 8080
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
