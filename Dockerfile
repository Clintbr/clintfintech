FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

COPY . .

ENV NODE_ENV=production
ENV APP_ROOT=/app
ENV DATA_DIR=/app/prototyp/data

EXPOSE 3000

CMD ["npm", "start"]
