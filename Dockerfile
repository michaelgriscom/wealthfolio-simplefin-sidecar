# The sidecar has no runtime third-party dependencies (TypeScript types are
# erased at runtime), so tsx alone is enough to run it — no install/bundle step.
FROM node:22-slim

WORKDIR /app
RUN npm install -g tsx@4.19.2

COPY src ./src

ENV NODE_ENV=production
EXPOSE 8080

CMD ["tsx", "src/main.ts"]
