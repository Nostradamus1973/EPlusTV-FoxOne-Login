FROM node:22-alpine

RUN apk add --no-cache su-exec shadow yt-dlp \
    && mkdir -p /etc/udhcpc \
    && printf 'RESOLV_CONF="no"\n' > /etc/udhcpc/udhcpc.conf

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
RUN chmod +x entrypoint.sh

ENTRYPOINT ["./entrypoint.sh"]
