FROM node:20-slim

WORKDIR /app

# Install Python3 & pytest so both Node server and deterministic Python acceptance suite work inside container
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pytest \
    ca-certificates \
    curl \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev || true

COPY . .

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", "src/server.js"]
