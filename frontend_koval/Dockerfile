FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# En producción idealmente es npm run build && npm start, pero usaremos dev para el MVP local si hay cambios en vivo
CMD ["npm", "run", "dev"]
EXPOSE 3030
