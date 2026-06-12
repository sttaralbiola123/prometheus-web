FROM node:20-bookworm-slim

ENV NODE_ENV=production

WORKDIR /app

RUN apt-get update && apt-get install -y \
    git \
    curl \
    lua5.4 \
    && rm -rf /var/lib/apt/lists/*

# Download Prometheus source
RUN git clone https://github.com/prometheus-lua/Prometheus.git /opt/Prometheus

COPY package.json ./

RUN npm install --omit=dev

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
