# syntax=docker/dockerfile:1
# Imagem de produção do front Vekoo: o SPA compilado servido pelo nginx.
# Construída pelo Kamal (`cd frontend && kamal deploy`), nunca usada em
# desenvolvimento — no WSL2 o Vite roda nativo.

# --- build -----------------------------------------------------------------
FROM docker.io/library/node:22-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# VITE_* é inlinada em build time: trocar a URL da API exige nova imagem.
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

COPY . .
RUN npm run build

# --- runtime ---------------------------------------------------------------
FROM docker.io/library/nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY security-headers.inc /etc/nginx/conf.d/security-headers.inc
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
