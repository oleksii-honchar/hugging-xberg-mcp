FROM public.ecr.aws/docker/library/node:24-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src/ ./src/

EXPOSE 3000

ENTRYPOINT ["node", "src/mcp-server.mjs"]
