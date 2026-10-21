FROM node:24-bookworm-slim@sha256:91acba91b842bec0bf7ea6f5e09c644c7ccad72c4996ed9616d861d1c7cd60d4
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --chown=node:node server ./server
COPY --chown=node:node shared ./shared
COPY --chown=node:node web ./web
COPY --chown=node:node apps/customer/index.html ./apps/customer/index.html
COPY --chown=node:node apps/contractor/index.html ./apps/contractor/index.html
CMD ["node", "server/bootstrap.mjs"]
