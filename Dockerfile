FROM node:22-alpine AS builder
WORKDIR /app
RUN npm install --global pnpm@10.15.1
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile=false
COPY . .
RUN pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
COPY --from=builder /app/.output ./.output
RUN mkdir -p /app/.data && chown -R node:node /app
USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
