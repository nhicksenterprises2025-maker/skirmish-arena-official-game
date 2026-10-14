FROM node:24.15.0-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY . .
ENV NODE_ENV=production SAR_HOST=0.0.0.0 SAR_DB_PATH=/data/skirmish.sqlite
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8803
CMD ["node", "server/index.cjs"]
