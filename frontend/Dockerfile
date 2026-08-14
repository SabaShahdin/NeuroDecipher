# NeuroDecipher frontend — Vite/React build served by nginx.
# Build args set the backend's public URL at BUILD time, since Vite bakes
# import.meta.env.VITE_* values into the static bundle (the browser calls the
# API directly — nginx here only serves static files, it does not proxy).
FROM node:22-alpine AS build
WORKDIR /app

ARG VITE_API_BASE_URL=http://localhost:5000
ARG VITE_MAX_UPLOAD_MB=4096
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_MAX_UPLOAD_MB=$VITE_MAX_UPLOAD_MB

# Install deps first so this layer is cached unless package*.json changes.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Increase Node.js heap for Vite production build
ENV NODE_OPTIONS="--max-old-space-size=3072"

RUN npm run build

FROM nginx:1.27-alpine AS run
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
