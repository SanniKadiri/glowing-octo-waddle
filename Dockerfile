FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN --mount=type=secret,id=npm_ca \
    if [ -f /run/secrets/npm_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca; fi; npm ci
COPY index.html vite.config.js ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787 SQLITE_PATH=/data/action-review.sqlite
COPY --chown=node:node --from=build /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node package.json ./
COPY --chown=node:node server ./server
COPY --chown=node:node src/domain.js ./src/domain.js
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 8787
HEALTHCHECK --interval=5s --timeout=3s --start-period=5s CMD ["node", "-e", "fetch('http://127.0.0.1:'+process.env.PORT+'/api/register',{signal:AbortSignal.timeout(2000)}).then(r=>process.exit([200,401].includes(r.status)?0:1),()=>process.exit(1))"]
CMD ["node", "server/index.js"]
