# ---- build (instala deps) ----
FROM node:20 AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .

# ---- runtime (ligero y estable, sin Alpine) ----
FROM node:20
WORKDIR /app
ENV NODE_ENV=production
ENV NODE_OPTIONS=--enable-source-maps
COPY --from=build /app /app

# Cloud Run inyecta PORT; Express debe escuchar en 0.0.0.0:PORT
EXPOSE 8080
CMD ["node","src/server.js"]
