FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
COPY scripts ./scripts
RUN mkdir -p public && npm install --omit=dev
COPY . .
RUN node scripts/copy-vendor.js && mkdir -p data uploads
ENV PORT=3000 NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
