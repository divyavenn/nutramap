# syntax=docker/dockerfile:1

ARG NODE_VERSION=22.9.0

################################################################################
# Base stage: Use node image for all stages.
FROM node:${NODE_VERSION}-alpine AS base

WORKDIR /usr/src/app

################################################################################
# Dependencies stage: Install production dependencies.
FROM base AS deps

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

################################################################################
# Build stage: Build the application.
FROM deps AS build

COPY . .
RUN npm run build

################################################################################
# Final stage: Minimal runtime environment.
FROM node:${NODE_VERSION}-alpine AS final

WORKDIR /usr/src/app
ENV NODE_ENV=production

USER node

COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist ./dist
COPY package.json .

EXPOSE 4173
CMD ["vite", "preview", "--port", "4173"]