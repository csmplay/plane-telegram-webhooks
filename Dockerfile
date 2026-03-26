# SPDX-FileCopyrightText: 2026 CyberSport Masters <git@csmpro.ru>
# SPDX-License-Identifier: AGPL-3.0-only

FROM node:22-alpine AS build

# better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

RUN corepack enable \
    && corepack prepare yarn@stable --activate

COPY package.json ./
COPY yarn.lock ./

ENV YARN_NODE_LINKER=node-modules
RUN yarn install --immutable

COPY . .


FROM node:22-alpine AS runtime

WORKDIR /app

COPY --from=build /app ./

VOLUME ["/app/config", "/app/data"]

EXPOSE 3111

CMD ["node", "app/app.js"]

LABEL org.opencontainers.image.source="https://git.csmpro.ru/csmpro/plane-telegram-webhooks"
LABEL org.opencontainers.image.url="https://git.csmpro.ru/csmpro/plane-telegram-webhooks"
LABEL org.opencontainers.image.authors="CyberSport Masters"
LABEL org.opencontainers.image.title="plane-telegram-webhooks"
LABEL org.opencontainers.image.description="Forwards Plane webhook events to Telegram"
LABEL org.opencontainers.image.licenses="AGPL-3.0-only AND CC-BY-SA-4.0 AND MIT"
