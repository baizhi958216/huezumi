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
RUN npm install --global pnpm@10.15.1
COPY --from=builder /app/.output ./.output
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/server ./server
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/workflows ./workflows
RUN mkdir -p /app/.data && chown -R node:node /app
USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
