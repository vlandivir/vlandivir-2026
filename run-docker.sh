#!/bin/bash
set -e

# Generate a tag name based on the current date and time (YYYYMMDDHHMM)
TAG_NAME=$(date +%Y%m%d%H%M)

TELEGRAN_BOT_TOKEN=$(grep TEST_BOT_TOKEN .env | cut -d '=' -f2)
POSTGRES_CONNECTION_STRING=$(grep POSTGRES_CONNECTION_STRING .env | cut -d '=' -f2)
DO_SPACES_ACCESS_KEY=$(grep DO_SPACES_ACCESS_KEY .env | cut -d '=' -f2)
DO_SPACES_SECRET_KEY=$(grep DO_SPACES_SECRET_KEY .env | cut -d '=' -f2)
NOTE_API_KEY=$(grep NOTE_API_KEY .env | cut -d '=' -f2)

docker build \
  --build-arg TELEGRAM_BOT_TOKEN="${TELEGRAN_BOT_TOKEN}" \
  --build-arg TAG_NAME="${TAG_NAME}" \
  --build-arg ENVIRONMENT="DOCKER" \
  --build-arg POSTGRES_CONNECTION_STRING="${POSTGRES_CONNECTION_STRING}" \
  --build-arg DO_SPACES_ACCESS_KEY="${DO_SPACES_ACCESS_KEY}" \
  --build-arg DO_SPACES_SECRET_KEY="${DO_SPACES_SECRET_KEY}" \
  --build-arg NOTE_API_KEY="${NOTE_API_KEY}" \
  -t vlandivir-2025 .

if docker ps -a | grep -q vlandivir-2025; then
  docker stop vlandivir-2025 || true
  docker rm vlandivir-2025 || true
fi

docker run -p 3042:3000 --name vlandivir-2025 vlandivir-2025
