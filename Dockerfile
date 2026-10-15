FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
RUN mkdir -p src/logs

ENV NODE_ENV=production
CMD ["node", "src/client.js"]
