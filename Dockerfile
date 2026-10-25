FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY src ./src
COPY business.md ./
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "src/server.js"]
