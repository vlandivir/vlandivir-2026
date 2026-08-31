# Переезд в новый репозиторий — завершён

Текущий рабочий GitHub-репозиторий: `vlandivir/vlandivir-2026`.

Именно он является источником `main`, GitHub Actions и repository secrets для production-деплоя. Старый репозиторий `vlandivir/vlandivir-2025` больше не использовать для новых коммитов, секретов или запуска deployment workflow.

## Рабочие команды

```bash
git remote get-url origin
gh repo view vlandivir/vlandivir-2026
gh secret list --repo vlandivir/vlandivir-2026
gh workflow run deploy-production.yml --repo vlandivir/vlandivir-2026 --ref main
```

Ожидаемый Git remote:

```text
git@github.com:vlandivir/vlandivir-2026.git
```

Перед деплоем нужно получить свежий `main`, влить проверенную task-ветку, отправить `main` и убедиться, что локальная и удалённая ветки совпадают. Production workflow запускается только после push.

## Что сохранило старое имя

Следующие идентификаторы намеренно пока содержат `2025` и не должны переименовываться как часть обновления документации:

- Docker image `registry.digitalocean.com/vlandivir-main/vlandivir-2025`;
- production container `vlandivir-2025`;
- DigitalOcean Spaces bucket `vlandivir-2025`;
- GitHub secret `VLANDIVIR_2025_BOT_TOKEN`;
- переменная `VLANDIVIR_2025_WEBHOOK_URL`;
- имя npm-пакета, пока отдельная техническая миграция не запланирована.

Эти имена используются инфраструктурой или кодом. Их изменение требует отдельного проверяемого деплоя и не связано с адресом GitHub-репозитория.

## Секреты

Новые и обновлённые GitHub Actions secrets записывать только в текущий репозиторий:

```bash
gh secret set NAME --repo vlandivir/vlandivir-2026
```

Значения секретов нельзя добавлять в Git, документацию или вывод команд. Локальные значения остаются в игнорируемом `.env`.

Если секрет ранее был добавлен в `vlandivir/vlandivir-2025`, его нужно отдельно удалить или обновить там после подтверждения владельца. Это не влияет на deployment из `vlandivir/vlandivir-2026`.

## Что не менялось при переезде

Сайт, droplet, база Postgres, Spaces, Telegram webhook, DNS и TLS-сертификаты остались прежними. Переезд изменил только GitHub repository и источник GitHub Actions.
