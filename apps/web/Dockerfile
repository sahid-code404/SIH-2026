FROM node:24.20.0-alpine3.24 AS deps
WORKDIR /app
COPY package.json .npmrc ./
RUN npm install --no-audit --no-fund

FROM node:24.20.0-alpine3.24 AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG BACKEND_INTERNAL_URL=http://backend:8080
ENV BACKEND_INTERNAL_URL=$BACKEND_INTERNAL_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24.20.0-alpine3.24 AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
