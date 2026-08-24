# Используем официальный образ Node.js
FROM node:22

# Устанавливаем рабочую директорию
WORKDIR /usr/src/app

# Копируем package.json и package-lock.json корня проекта
COPY package*.json ./
# Копируем package.json и package-lock.json Telegram mini-app
COPY telegram-app/package*.json telegram-app/

# Системные зависимости для сборки нативных модулей (canvas, sharp и т.п.)
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       python3 \
       make \
       g++ \
       pkg-config \
       ffmpeg \
       libcairo2-dev \
       libpango1.0-dev \
       libjpeg-dev \
       libgif-dev \
       librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

# yt-dlp — скачивание видео из Instagram (standalone-бинарник, нужен python3)
RUN curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
      -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# Устанавливаем все зависимости (включая dev зависимости для сборки)
RUN npm ci && npm ci --prefix telegram-app

# Копируем все файлы приложения
COPY . .

# Генерируем Prisma клиент
RUN npx prisma generate

# Собираем фронтенд Telegram mini-app
RUN npm run telegram-app:build

# Компилируем TypeScript в JavaScript
RUN npm run build

# Удаляем dev dependencies после сборки для уменьшения размера образа
RUN npm prune --production && rm -rf telegram-app/node_modules

# Image label only — runtime secrets are passed with `docker run -e`, not baked in.
ARG TAG_NAME=local
ENV TAG_NAME=$TAG_NAME

# Копируем сгенерированный Prisma клиент в папку dist
RUN cp -r src/generated dist/

# Открываем порт 3000 для HTTP (development)
EXPOSE 443 3000

# Запускаем приложение
CMD ["node", "dist/main.js"]
