# =====================================================
# ISCIACUS Frontend - Dockerfile
# =====================================================
# Multi-stage build for development and production
# =====================================================

# =====================================================
# Stage 1: Base
# =====================================================
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./

# =====================================================
# Stage 2: Development
# =====================================================
FROM base AS development
RUN npm install
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# =====================================================
# Stage 3: Build
# =====================================================
FROM base AS build

# Accept VITE environment variables as build args
ARG VITE_API_BASE_URL
ARG VITE_POCKETBASE_URL
ARG VITE_GCP_PROJECT_ID
ARG VITE_GCP_API_KEY

# Set them as env vars for the build process
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_POCKETBASE_URL=$VITE_POCKETBASE_URL
ENV VITE_GCP_PROJECT_ID=$VITE_GCP_PROJECT_ID
ENV VITE_GCP_API_KEY=$VITE_GCP_API_KEY

RUN npm ci
COPY . .
RUN npm run build

# =====================================================
# Stage 4: Production (nginx)
# =====================================================
FROM nginx:alpine AS production
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
