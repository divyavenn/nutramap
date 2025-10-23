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
ARG PORT
ENV PORT=${PORT}

COPY --from=build /app/dist /usr/share/nginx/html

# Create nginx config that uses PORT variable
RUN echo 'server { \n\
    listen ${PORT}; \n\
    server_name localhost; \n\
    location / { \n\
        root /usr/share/nginx/html; \n\
        index index.html index.htm; \n\
        try_files $uri $uri/ /index.html; \n\
    } \n\
}' > /etc/nginx/templates/default.conf.template

# Expose the configured port
EXPOSE ${PORT}

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
