---
title: Добро пожаловать
---

# Платформа — Контейнеризированная разработка

Этот сайт построен с помощью **Quartz** и запущен в Docker-контейнере.

## Как это работает

1. Markdown файлы в папке `content/` компилируются в статический сайт
2. В dev-режиме `quartz build --serve` следит за изменениями и пересобирает
3. В продакшене Nginx раздаёт готовые HTML/CSS/JS файлы

## Структура

```
quartz-site/
├── content/          ← твои Markdown файлы
├── Dockerfile        ← dev (hot-reload)
├── Dockerfile.prod   ← production (multi-stage + nginx)
└── package.json
```
