FROM node:20-alpine AS builder
WORKDIR /app

ENV NODE_ENV=development
ENV NPM_CONFIG_PRODUCTION=false

COPY package*.json ./
RUN npm install --include=dev

COPY . .

RUN npm run build   # <-- gunakan script, bukan npx

FROM node:20-alpine AS runner
WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

CMD ["node", "dist/main.js"]
