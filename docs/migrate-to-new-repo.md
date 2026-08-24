# Переезд в новый репозиторий (без истории)

Текущий GitHub-репозиторий `vlandivir/vlandivir-2025` публичный. В git-истории остаются уже удалённые из дерева файлы (ops-notes с хостом Postgres, дамп рилсов, debug SSH workflow и т.д.). Переезд **снимком рабочего дерева без `.git`** обнуляет эту историю. Старый репозиторий после переезда делается **private**.

Сайт, droplet, база, Spaces, Telegram-бот и домен **не меняются**. Меняется только GitHub remote и то, откуда GitHub Actions собирает образ.

## Зачем так

- История текущего репо больше не должна быть публичной.
- Смесь технологий оставляем: это экспериментальный монорепозиторий, не «чистый» продукт.
- Вложенных git-репозиториев сейчас нет (проверяли: нет `.gitmodules`, нет вложенных `.git`). Клиенты — обычные папки.

## Что не копировать

Не класть в новый репозиторий:

| Путь | Почему |
|---|---|
| `.git/` | Как раз историю и выбрасываем |
| `.env`, `.secret/`, `.secret-backup/` | Секреты и сертификаты |
| `node_modules/`, `*/node_modules/`, `dist/`, `telegram-app/dist/` | Сборка |
| `gpx-samples/`, `custom-images/`, `pdf/`, `.dairy/`, `.data/` | Локальный мусор |
| `--version/` | Случайная папка |
| `.DS_Store` | Шум |

Копировать **текущий `main` после мержа docs**, не случайную feature-ветку.

## Рекомендуемая раскладка нового репо

Сейчас на корне слишком много разнородных папок (`telegram-app/`, `desktop/`, `mobile/` рядом с `src/` и `web/`). В **новом** репозитории имеет смысл сразу сложить клиенты в `apps/`, не трогая Nest и статику (их пути зашиты в Docker, URL и Xcode только у клиентов).

```
vlandivir/                  # новое имя репо, без года
  README.md
  AGENTS.md
  Dockerfile
  package.json              # Nest-сервер
  prisma/
  src/                      # как сейчас
  web/                      # как сейчас — URL /shared, /places, …
  apps/
    telegram/               # было telegram-app/
    desktop/                # было desktop/trip-montage/ (единственное desktop-приложение)
    mobile/
      gtd-ios/
      gps-tracker-ios/
  docs/
  assets/
  test/
  .github/workflows/
  .cursor/rules/
```

`web/` на корне оставляем: Nest отдаёт её как статику, абсолютные пути `/shared/…`. Перенос `web/` → `apps/web` сломает URL без отдельной работы.

При копировании с переименованием поправить:

- `Dockerfile`: `COPY telegram-app/…` → `apps/telegram/`
- корневой `package.json`: скрипты `telegram-app:*` и `--prefix`
- `src/main.ts` (откуда берётся `telegram-app/dist`)
- `desktop/trip-montage` README и Xcode пути в `mobile/*/README.md`
- этот файл и [repo-map.md](repo-map.md)

Если не хочется трогать пути в день переезда — копировать 1:1, а `apps/` сделать вторым шагом уже в новом репо.

## Имя и видимость

Предложение: новый публичный репозиторий `vlandivir/vlandivir` (без `-2025`), homepage `https://vlandivir.com`. Старый `vlandivir/vlandivir-2025` → **private**, не удалять сразу (запас на случай, если в истории понадобится файл).

Создать можно так (из этой машины, аккаунт `vlandivir`, scope `repo`):

```bash
gh repo create vlandivir/vlandivir --public --description "Personal experimental server for vlandivir.com" --homepage "https://vlandivir.com" --disable-wiki --disable-issues
```

Issues/wiki — по желанию. Не делать `--clone` поверх текущего каталога.

## Чеклист переезда

### 1. Снимок файлов

Из чистого `main`:

```bash
rsync -a --delete \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude '*/node_modules/' \
  --exclude 'dist/' \
  --exclude 'telegram-app/dist/' \
  --exclude '.env' \
  --exclude '.secret/' \
  --exclude '.secret-backup/' \
  --exclude '.dairy/' \
  --exclude '.data/' \
  --exclude 'gpx-samples/' \
  --exclude 'custom-images/' \
  --exclude 'pdf/' \
  --exclude '--version/' \
  --exclude '.DS_Store' \
  ./ /tmp/vlandivir-export/
```

Потом в пустом клоне нового репо: скопировать содержимое `/tmp/vlandivir-export/`, `git add`, один первый коммит («Initial public snapshot without history»).

Локальный `.env` и `.secret/` **не** коммитить; они остаются на диске в старом каталоге или копируются вручную рядом с новым клоном.

### 2. Секреты GitHub

Прод собирается из GitHub Actions secrets. Их **история git не содержит**, но в новом репо их нет, пока не перенесёшь.

Сверить `gh secret list --repo vlandivir/vlandivir-2025` с `docker run -e` в `.github/workflows/deploy-production.yml`. Как минимум:

- `VLANDIVIR_2025_BOT_TOKEN` → в контейнере это `TELEGRAM_BOT_TOKEN` (имя секрета и имя env **разные**)
- `POSTGRES_CONNECTION_STRING`
- `DO_SPACES_ACCESS_KEY` / `DO_SPACES_SECRET_KEY`
- `OPENAI_API_KEY`
- `VLANDIVIR_2025_WEBHOOK_URL`
- `NOTE_API_KEY`, `MAP_API_KEY`, `MCP_API_KEY`
- `EMAIL_ACCOUNTS`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
- `SESSION_SECRET`
- `ALLOWED_GOOGLE_EMAILS`
- `TELEGRAM_OWNER_CHAT_ID` / `TELEGRAM_CHANNEL_IDS`
- `DO_REGISTRY_TOKEN`
- `DIGITAL_OCEAN_IP`
- `SSH_PRIVATE_KEY`

Значения не логировать. Копировать: `gh secret set NAME --repo vlandivir/vlandivir < value` (или вручную в Settings). После переноса — пробный `workflow_dispatch` **из нового репо**, ещё не делая старый private, чтобы откатиться.

### 3. Деплой

Пока Actions живёт в старом репо, прод катится оттуда. После зелёного деплоя из нового:

1. В Droplet ничего менять не нужно, если тег образа тот же registry (`registry.digitalocean.com/vlandivir-main/vlandivir-2025`). Имя образа можно оставить — это не имя GitHub-репо.
2. Workflow в новом репо — тот же файл. Проверить, что secrets подхватились.
3. Отключить или архивировать workflow в старом репо, чтобы не задеплоить старый `main` по ошибке.

Webhook Telegram (`VLANDIVIR_2025_WEBHOOK_URL`) смотрит на `vlandivir.com`, не на GitHub — не трогать.

### 4. Локальная машина

```bash
git remote rename origin old-vlandivir-2025   # в старом клоне, опционально
# новый клон:
git clone git@github.com:vlandivir/vlandivir.git
# скопировать .env и .secret из старого рабочего каталога
```

Cursor/Cloud: обновить путь workspace и секреты Cloud Agent, если они привязаны к репо.

Xcode и Tauri открывают пути внутри клона — после переименования `apps/` поправить Signing не нужно, только path.

### 5. Старый репозиторий → private

```bash
gh repo edit vlandivir/vlandivir-2025 --visibility private
```

GitHub может попросить подтверждение и 2FA. Проверить: инкогнито не открывает `github.com/vlandivir/vlandivir-2025`. Stars/forks у публичного репо после private пропадают из публичного поиска; форки, если были, остаются у форкнувших — на это нельзя повлиять переездом.

Не делать `git filter-repo` на старом репо: он станет private, этого достаточно. Не удалять старый репо минимум несколько недель.

### 6. Описания после переезда

- `gh repo edit vlandivir/vlandivir --description "…" --homepage https://vlandivir.com`
- В README и AGENTS заменить URL git, если там зашит `vlandivir-2025`
- Docker image tag можно оставить `vlandivir-2025` или сменить отдельным деплоем (не обязательно в день переезда)

## Что улучшить уже в новом репо (не блокер переезда)

- ~~Вынести Telegram chat/channel id в env~~ — сделано: `TELEGRAM_OWNER_CHAT_ID`, `TELEGRAM_CHANNEL_IDS`.
- Удалить неиспользуемые Prisma-модели (`Todo`, `Question`, …) только после проверки, что в общей БД нет нужных строк.
- `.dockerignore` сейчас слишком дырявый (в образ уходит лишнее). Сузить перед следующим деплоем.
- В `Dockerfile` нет всех ключей, которые читает код через `ConfigService` (например опциональный `REELS_API_KEY`) — сверить с `.env`.
- Не тащить в git `web/subs/vendor/**` source maps, если они не нужны в рантайме (экономия, не безопасность).

## Что не делать

- Не `git clone --mirror` и не `git push --mirror` в новый репо — это перенесёт историю.
- Не коммитить `.env`.
- Не менять DNS, certbot, Postgres, Spaces в рамках переезда GitHub.
- Не гонять `prisma migrate reset`.
