# ---- Stage 1: build the React/Vite frontend ----
FROM node:20-alpine AS client
WORKDIR /app/client
COPY client/package.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# ---- Stage 2: runtime (Express + better-sqlite3) ----
FROM node:20-alpine
WORKDIR /app

# better-sqlite3 ships prebuilt binaries for node20-alpine, but keep python3 +
# build tools available in case a source build is needed.
RUN apk add --no-cache python3 make g++

COPY package.json ./
RUN npm install --omit=dev

COPY server.js db.js ./
COPY --from=client /app/client/dist ./client/dist

ENV PORT=8080
ENV DATA_DIR=/data
EXPOSE 8080

CMD ["node", "server.js"]
