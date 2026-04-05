# ========================
# BUILD STAGE
# ========================
FROM node:20-alpine AS builder

WORKDIR /app

ENV NODE_ENV=development

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build


# ========================
# RUNNER STAGE
# ========================
FROM node:20-alpine AS runner

WORKDIR /app

# install curl untuk healthcheck
RUN apk add --no-cache curl

ENV NODE_ENV=production

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

CMD ["node", "dist/main.js"]