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

# Declare build args that will be passed as environment variables
ARG TELEGRAM_BOT_TOKEN
ARG TAG_NAME
ARG ENVIRONMENT
ARG POSTGRES_CONNECTION_STRING
ARG DO_SPACES_ACCESS_KEY
ARG DO_SPACES_SECRET_KEY
ARG OPENAI_API_KEY
ARG VLANDIVIR_2025_WEBHOOK_URL
ARG NOTE_API_KEY
ARG MAP_API_KEY
ARG MCP_API_KEY
ARG EMAIL_ACCOUNTS
ARG GOOGLE_CLIENT_ID
ARG GOOGLE_CLIENT_SECRET
ARG SESSION_SECRET
ARG ALLOWED_GOOGLE_EMAILS
ARG TELEGRAM_OWNER_CHAT_ID
ARG TELEGRAM_CHANNEL_IDS
ARG THREADS_ACCESS_TOKEN

# Set environment variables from build args
ENV TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN
ENV TAG_NAME=$TAG_NAME
ENV ENVIRONMENT=$ENVIRONMENT
ENV POSTGRES_CONNECTION_STRING=$POSTGRES_CONNECTION_STRING
ENV DO_SPACES_ACCESS_KEY=$DO_SPACES_ACCESS_KEY
ENV DO_SPACES_SECRET_KEY=$DO_SPACES_SECRET_KEY
ENV OPENAI_API_KEY=$OPENAI_API_KEY
ENV VLANDIVIR_2025_WEBHOOK_URL=$VLANDIVIR_2025_WEBHOOK_URL
ENV NOTE_API_KEY=$NOTE_API_KEY
ENV MAP_API_KEY=$MAP_API_KEY
ENV MCP_API_KEY=$MCP_API_KEY
ENV EMAIL_ACCOUNTS=$EMAIL_ACCOUNTS
ENV GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID
ENV GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET
ENV SESSION_SECRET=$SESSION_SECRET
ENV ALLOWED_GOOGLE_EMAILS=$ALLOWED_GOOGLE_EMAILS
ENV TELEGRAM_OWNER_CHAT_ID=$TELEGRAM_OWNER_CHAT_ID
ENV TELEGRAM_CHANNEL_IDS=$TELEGRAM_CHANNEL_IDS
ENV THREADS_ACCESS_TOKEN=$THREADS_ACCESS_TOKEN

# Копируем сгенерированный Prisma клиент в папку dist
RUN cp -r src/generated dist/

# Открываем порт 3000 для HTTP (development)
EXPOSE 443 3000

# Запускаем приложение
CMD ["node", "dist/main.js"]
