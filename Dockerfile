# Decrypto — single-service image: builds the PWA client, then runs the
# Socket.IO server, which also serves the built client (see server/src/index.ts).
# npm workspaces layout: one root package-lock covering shared/, server/, client/.

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

# Install ALL dependencies, dev included: the server boots via tsx (a
# devDependency) and the client build needs vite/typescript. With
# NODE_ENV=production set, npm would omit devDependencies — --include=dev
# is what keeps the boot working (the Just One Dockerfile bug).
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm ci --include=dev

COPY shared ./shared
COPY server ./server
COPY client ./client
RUN npm run build --workspace=client

EXPOSE 8080
CMD ["npm", "start", "--prefix", "server"]
