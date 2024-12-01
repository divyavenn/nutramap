# syntax=docker/dockerfile:1

ARG NODE_VERSION=22.9.0
ARG PORT

################################################################################
# Base stage: Use node image for all stages.
FROM node:16 AS build
ENV PORT=${PORT}
WORKDIR /app

################################################################################
# Dependencies stage: Install production dependencies.
# FROM base AS deps

COPY package.json package-lock.json ./
RUN npm install
RUN npm i -g serve
COPY . .
RUN npm run build


# Serve stage
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html

# Expose the default Nginx port
EXPOSE 8080

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
