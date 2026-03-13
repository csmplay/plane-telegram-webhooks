FROM node:22-alpine

# Build tools for better-sqlite3 native compilation
RUN apk add --no-cache python3 make g++

WORKDIR /usr/src/app

# Copy package manifest and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy the rest of the application code
COPY . .

# Mountable volumes for config and data persistence
VOLUME ["/usr/src/app/config", "/usr/src/app/data"]

EXPOSE 3111

CMD ["npm", "start"]
