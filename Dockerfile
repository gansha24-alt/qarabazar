FROM node:20-alpine

# Устанавливаем рабочую директорию
WORKDIR /app

# Копируем package.json и устанавливаем зависимости
COPY package*.json ./
RUN npm ci --only=production

# Копируем исходный код
COPY . .

# Указываем папки, которые должны быть постоянными (Persistent Volumes)
# /app/data - для базы данных SQLite
# /app/public/uploads - для загруженных картинок товаров
VOLUME ["/app/data", "/app/public/uploads"]

EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production

CMD ["npm", "start"]
