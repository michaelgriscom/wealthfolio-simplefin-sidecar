# The sidecar has no bundle step: tsx runs the TypeScript sources directly. tsx
# is a runtime dependency for that reason, so the image installs only it (and
# its esbuild dependency), exactly as locked.
FROM node:22-slim

WORKDIR /app
COPY package.json package-lock.json ./
# esbuild works without its postinstall (the platform binary comes from its
# optional @esbuild/* dependency).
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY src ./src

ENV NODE_ENV=production
# The locked tsx, so `docker run ... tsx src/main.ts --once` keeps working.
ENV PATH=/app/node_modules/.bin:$PATH
EXPOSE 8080

CMD ["tsx", "src/main.ts"]
