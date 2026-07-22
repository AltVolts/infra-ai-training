# Пошаговый туториал: Настройка инфраструктуры в air-gapped среде

## Для кого это
Для маленькой команды (1-2 DevOps инженера), которые настраивают процессы разработки в изолированной от интернета сети.

## Что ты научишься
- Развертывать GitLab и GitLab Runner
- Настраивать Docker Registry и Nexus
- Создавать Docker-образы для приложений
- Настраивать CI/CD пайплайн
- Организовывать dev и prod окружения

---

# Модуль 1: Настройка GitLab + Runner

## Шаг 1.1: Зачем это нужно

**GitLab** — это не только Git-хранилище. Это:
- Хостинг кода (как GitHub)
- Container Registry (хранилище Docker-образов)
- CI/CD система (автоматическая сборка и деплой)

**GitLab Runner** — это агент, который:
- Слушает GitLab и выполняет задачи (сборка, тесты, деплой)
- Запускает Docker-контейнеры для изоляции задач
- Может быть установлен на отдельном сервере

**Почему Docker Compose:**
В air-gapped среде нет интернета. Docker Compose позволяет:
- Запускать GitLab локально
- Управлять версиями через image tags
- Переносить на другой сервер через `docker save/load`

---

## Шаг 1.2: Создаем docker-compose.yml для GitLab

### Инструкция

1. Создай папку для инфраструктуры:
```bash
mkdir -p infra/gitlab
```

2. Создай файл `infra/gitlab/docker-compose.yml`:
```bash
cat > infra/gitlab/docker-compose.yml << 'EOF'

services:
  gitlab:
    image: gitlab/gitlab-ce:16.7.0-ce.0
    container_name: gitlab
    hostname: gitlab.local
    environment:
      GITLAB_OMNIBUS_CONFIG: |
        # Базовые настройки
        external_url 'http://gitlab.local:8080'
        gitlab_rails['gitlab_shell_ssh_port'] = 2224
        
        # Отключаем SSL (для локальной сети)
        nginx['listen_https'] = false
        nginx['listen_port'] = 8080
        
        # Настройки Registry
        registry_external_url 'http://gitlab.local:8081'
        registry_nginx['listen_port'] = 8081
        registry_nginx['listen_https'] = false
    ports:
      - "8080:8080"   # GitLab UI
      - "8081:8081"   # Container Registry
      - "2224:22"     # SSH
    volumes:
      - gitlab_config:/etc/gitlab
      - gitlab_logs:/var/log/gitlab
      - gitlab_data:/var/opt/gitlab
    shm_size: '256m'
    restart: unless-stopped

volumes:
  gitlab_config:
  gitlab_logs:
  gitlab_data:
EOF
```

### Что здесь происходит

- **image** — используем готовый образ GitLab из registry
- **external_url** — адрес по которому будем доступать к GitLab
- **registry_external_url** — адрес Container Registry
- **ports** — пробрасываем порты на хост
- **volumes** — сохраняем данные между перезапусками

### Запуск

```bash
cd infra/gitlab
docker compose up -d
```

**Важно:** GitLab запускается долго (3-5 минут). Проверяем статус:

```bash
docker compose logs -f gitlab | grep "GitLab REST API"
```

Когда увидите `GitLab REST API is running` — GitLab готов.

### Проверка

1. Открой в браузере: `http://localhost:8080`
2. Первый пароль найди так:
```bash
docker exec gitlab cat /etc/gitlab/initial_root_password
```
3. Логин: `root`, пароль из вывода выше

---

## Шаг 1.3: Настраиваем Container Registry

### Инструкция

1. Войди в GitLab как root
2. Перейди в **Admin → Settings → Container Registry**
3. Убедись что Registry включен и доступен по адресу `http://gitlab.local:8081`

### Проверка Registry

Попробуй залогиниться и пушнуть тестовый образ:

```bash
# Логинимся в Registry
docker login -u root -p <пароль_из_шага_1.2> localhost:8081

# Создаем тестовый образ
docker pull alpine:3.19
docker tag alpine:3.19 localhost:8081/root/test:v1

# Пушим
docker push localhost:8081/root/test:v1
```

Если образ пушнулся — Registry работает.

---

## Шаг 1.4: Создаем проект в GitLab

### Инструкция

1. В GitLab UI нажми **New project**
2. Выбери **Create blank project**
3. Название: `platform`
4. Visibility: **Internal** (доступен всем залогиненным)
5. Сними галочку **Initialize repository with a README**
6. Нажми **Create project**

### Клонируй проект

```bash
git clone http://root:<пароль>@gitlab.local:8080/root/platform.git
cd platform
```

---

## Шаг 1.5: Регистрируем GitLab Runner

### Зачем Runner нужен

Runner — это процесс, который:
- Слушает GitLab на наличие новых задач
- Запускает задачи в изолированных Docker-контейнерах
- Возвращает результат в GitLab

### Инструкция

1. Перейди в GitLab: **Admin → Runners** (или project → Settings → CI/CD → Runners)
2. Нажми **New instance runner**
3. Выбери **Docker** executor
4. Добавь теги: `docker`, `linux`
5. Нажми **Create runner**
6. Скопируй токен (выглядит как `glrt-XXXXXX`)

### Запусти Runner в Docker

Создай файл `infra/gitlab/runner/docker-compose.yml`:

```bash
mkdir -p infra/gitlab/runner

cat > infra/gitlab/runner/docker-compose.yml << 'EOF'

services:
  gitlab-runner:
    image: gitlab/gitlab-runner:latest
    container_name: gitlab-runner
    volumes:
      - runner_config:/etc/gitlab-runner
      - runner_cache:/cache
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      - CI_SERVER_URL=http://gitlab.local:8080
      - RUNNER_TOKEN=<ТВОЙ_ТОКЕН_ИЗ_ШАГА>
      - RUNNER_EXECUTABLE_DIR=/var/lib/gitlab-runner
    restart: unless-stopped

volumes:
  runner_config:
  runner_cache:
EOF
```

**Замени `<ТВОЙ_ТОКЕН_ИЗ_ШАГА>`** на токен из шага 1.

### Запуск Runner

```bash
cd infra/gitlab/runner
docker compose up -d
```

### Проверка

1. Вернись в GitLab: **Admin → Runners**
2. Runner должен быть зеленым (online)
3. Если красный — проверь логи:
```bash
docker compose logs gitlab-runner
```

---

## Шаг 1.6: Первый CI/CD пайплайн

### Инструкция

1. В папке проекта создай `.gitlab-ci.yml`:

```bash
cat > .gitlab-ci.yml << 'EOF'
stages:
  - build
  - test

# Первый job: просто выводит сообщение
hello:
  stage: build
  script:
    - echo "Привет! Я GitLab Runner!"
    - echo "Текущая дата: $(date)"
    - echo "Hostname: $(hostname)"
    - docker --version
  tags:
    - docker

# Второй job: проверяет что Docker работает
docker-check:
  stage: test
  script:
    - docker pull alpine:3.19
    - docker run --rm alpine:3.19 echo "Docker работает!"
  tags:
    - docker
EOF
```

2. Закоммить и запушь:

```bash
git add .gitlab-ci.yml
git commit -m "feat: первый CI/CD пайплайн"
git push origin main
```

### Проверка

1. Перейди в GitLab: **platform → CI/CD → Pipelines**
2. Должен запуститься пайплайн
3. Кликни на него и смотри логи jobs
4. Оба job должны быть зелеными (passed)

---

## Вопросы для самопроверки

1. **Зачем нужен Runner, если GitLab уже собирает пайплайны?**
   [Подсказка: Runner — это агент, а GitLab — сервер]

2. **Что такое Docker-in-Docker (dind) и зачем он нужен Runner'у?**
   [Подсказка: Runner запускает задачи в контейнерах, но ему нужно собирать новые образы]

3. **Что будет если удалить volumes `gitlab_data`?**
   [Подсказка: там хранятся все проекты, пользователи, настройки]

4. **Почему мы используем `restart: unless-stopped`?**
   [Подсказка: что произойдет при перезагрузке сервера?]

---

## Готово!

Ты настроил:
- GitLab с Container Registry
- GitLab Runner в Docker
- Первый пайплайн который работает

**Следующий модуль:** Модуль 2: Контейнеризированная среда разработки (ниже)

---

# Модуль 2: Контейнеризированная среда разработки

## Для кого это

Для разработчиков и DevOps, которые хотят запускать приложения в Docker локально — с hot-reload, базой данных и кэшем.

## Что ты научишься

- Писать Dockerfile для разработки и продакшена
- Использовать `docker compose` для multi-сервисной среды
- Настраивать hot-reload через volume mounts
- Работать с PostgreSQL и Redis в контейнерах
- Отлаживать контейнеры

---

## Шаг 2.1: Зачем Docker для разработки

**Проблема:** "У меня работает, у тебя — нет."

Разработчики используют разные ОС, разные версии Node/Python, разные настройки БД. Docker решает это:
- Один и тот же контейнер = одинаковое окружение у всех
- PostgreSQL, Redis, приложение — всё запускается одной командой
- Новый разработчик: `git clone` → `docker compose up` → работает

---

## Шаг 2.2: Первый Dockerfile

### Инструкция

Создай файл `infra/dev-environment/nextjs-apollo/Dockerfile`:

```dockerfile
FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
```

### Разбор каждой строки

| Инструкция | Что делает |
|------------|-----------|
| `FROM node:24-alpine` | Берём образ Node.js 24 (Alpine = минималистичный Linux, ~50MB) |
| `WORKDIR /app` | Рабочая директория внутри контейнера (создаётся если нет) |
| `COPY package*.json ./` | Копируем package.json и package-lock.json |
| `RUN npm install` | Устанавливаем зависимости |
| `COPY . .` | Копируем весь исходный код |
| `EXPOSE 3000` | Документируем порт (не пробрасывает!) |
| `CMD ["npm", "run", "dev"]` | Команда при запуске контейнера |

### Почему `package*.json` копируется отдельно?

**Кэширование слоёв!** Docker кэширует результат каждой инструкции. Если ты меняешь код в `src/`, но `package.json` не изменился — Docker не будет заново запускать `npm install`. Это ускоряет сборку в 5-10 раз.

### Порядок имеет значение

```
❌  COPY . .           ← копируем всё
    RUN npm install    ← не кэшируется (код уже изменился)

✅  COPY package*.json ./  ← кэшируется
    RUN npm install        ← пересоздаётся только при изменении package.json
    COPY . .               ← кэшируется
```

---

## Шаг 2.3: `.dockerignore`

### Зачем

Docker отправляет **всю папку** как "build context" в Docker daemon. Если нет `.dockerignore`, он отправит:
- `node_modules/` (500MB+) — уже есть в контейнере
- `.git/` — не нужен для сборки
- `.next/` — build output
- `docker-compose.yml` — не нужен в контейнере

### Инструкция

Создай файл `infra/dev-environment/.dockerignore`:

```
node_modules
.next
.git
.env
docker-compose*.yml
Dockerfile*
*.md
```

Это уменьшает build context с ~500MB до ~10MB и ускоряет `docker build`.

---

## Шаг 2.4: Hot-reload через volume mounts

### Проблема

Без hot-reload ты меняешь код → пересобираешь контейнер → ждёшь. Это медленно.

### Решение: bind mounts

В `docker-compose.yml` монтируем папку с кодом прямо в контейнер:

```yaml
services:
  app:
    build: ./nextjs-apollo
    volumes:
      - ./nextjs-apollo:/app          # монтируем код
      - /app/node_modules              # анонимный том (см. ниже)
      - /app/.next                     # анонимный том
    ports:
      - "3000:3000"
```

### Как это работает

1. `./nextjs-apollo:/app` — содержимое папки на хосте появляется в `/app` контейнера
2. Ты меняешь файл → Next.js видит изменение → пересобирает моментально
3. Контейнер не пересоздаётся!

### Трюк с анонимным томом

```yaml
volumes:
  - ./nextjs-apollo:/app      # host mount
  - /app/node_modules          # anonymous volume
```

**Проблема:** Host mount поверх контейнера перезаписывает `node_modules`, которые установились при `docker build`.

**Решение:** Анонимный том `/app/node_modules` "защищает" эту папку — Docker создаёт пустой том и монтирует его поверх host mount. `node_modules` остаются из образа, а код монтируется из хоста.

---

## Шаг 2.5: Мульти-сервисная среда

### Инструкция

Создай файл `infra/dev-environment/docker-compose.yml`:

```yaml
services:
  app:
    build:
      context: ./nextjs-apollo
      dockerfile: Dockerfile
    container_name: platform-app
    ports:
      - "3000:3000"
    volumes:
      - ./nextjs-apollo:/app
      - /app/node_modules
      - /app/.next
    env_file:
      - .env
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

  postgres:
    image: postgres:15-alpine
    container_name: platform-postgres
    environment:
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: devpassword
      POSTGRES_DB: platform
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U dev -d platform"]
      interval: 5s
      timeout: 3s
      retries: 5
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    container_name: platform-redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
```

### Что здесь происходит

**Три сервиса:**
- `app` — наше Next.js приложение (собирается из Dockerfile)
- `postgres` — база данных (готовый образ)
- `redis` — кэш (готовый образ)

**Сетевая связь:**
- Docker Compose создаёт отдельную сеть для всех сервисов
- Сервисы обращаются друг к другу по имени: `postgres:5432`, `redis:6379`
- Приложение подключается к БД через `postgresql://dev:devpassword@postgres:5432/platform`

**`depends_on` с `condition: service_healthy`:**
- Приложение не стартует пока Postgres и Redis не будут готовы
- `healthcheck` определяет "готовность" сервиса

**Named volumes:**
- `postgres_data`, `redis_data` — данные сохраняются между перезапусками
- `docker compose down` — данные остаются
- `docker compose down -v` — данные удаляются

---

## Шаг 2.6: Healthchecks

### Зачем

`depends_on` без `condition` просто ждёт запуска контейнера, а не готовности сервиса. PostgreSQL может быть "запущен" но ещё инициализируется.

### Как работает healthcheck

```yaml
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U dev -d platform"]
  interval: 5s      # проверка каждые 5 секунд
  timeout: 3s       # таймаут команды
  retries: 5        # сколько неудач перед "healthy"
```

Команда `pg_isready` возвращает 0 если PostgreSQL готов принимать запросы.

Для Redis проще:
```yaml
healthcheck:
  test: ["CMD", "redis-cli", "ping"]
```

---

## Шаг 2.7: Example 1 — Next.js + Apollo Server

### Структура проекта

```
nextjs-apollo/
├── Dockerfile              # dev
├── Dockerfile.prod         # prod (multi-stage)
├── package.json
├── next.config.js
├── tsconfig.json
├── prisma/
│   └── schema.prisma       # схема БД
└── src/
    ├── app/
    │   ├── layout.tsx
    │   ├── page.tsx
    │   └── api/
    │       └── graphql/
    │           └── route.ts    # Apollo Server
    └── lib/
        ├── apollo-client.ts
        └── db.ts
```

### Apollo Server (route handler)

Файл `src/app/api/graphql/route.ts`:

```typescript
import { startServerAndCreateNextHandler } from "@as-integrations/next";
import { ApolloServer } from "@apollo/server";
import { NextRequest } from "next/server";
import db from "@/lib/db";
import { createClient } from "redis";

const resolvers = {
  Query: {
    health: async () => {
      const pgResult = await db.query("SELECT NOW() as time");
      const redisClient = await createClient({
        url: process.env.REDIS_URL,
      }).connect();
      const pong = await redisClient.ping();
      await redisClient.disconnect();

      return JSON.stringify({
        postgres: pgResult.rows[0].time,
        redis: pong,
        status: "ok",
      });
    },
    timestamp: () => new Date().toISOString(),
  },
};

const server = new ApolloServer({
  typeDefs: `
    type Query {
      health: String
      timestamp: String
    }
  `,
  resolvers,
});

const handler = startServerAndCreateNextHandler<NextRequest>(server);

export async function GET(request: NextRequest) {
  return handler(request);
}

export async function POST(request: NextRequest) {
  return handler(request);
}
```

### Подключение к PostgreSQL

Файл `src/lib/db.ts`:

```typescript
import { Client } from "pg";

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

client.connect();

export default client;
```

**Важно:** `DATABASE_URL` приходит из `.env` файла, который монтируется через `env_file` в docker-compose.

### `.env.example`

```
POSTGRES_USER=dev
POSTGRES_PASSWORD=devpassword
POSTGRES_DB=platform
DATABASE_URL=postgresql://dev:devpassword@postgres:5432/platform
REDIS_URL=redis://redis:6379
```

Обрати внимание: хост — `postgres` и `redis` (имена сервисов в docker-compose), а не `localhost`.

### Запуск

```bash
cd infra/dev-environment

# Копируем env файл
cp .env.example .env

# Запускаем всё
docker compose up -d

# Смотрим логи
docker compose logs -f app
```

Открой `http://localhost:3000` — увидишь страницу с GraphQL health check.

---

## Шаг 2.8: Example 2 — Quartz frontend

### Зачем другой пример

Quartz — это статический site generator. Он не нуждается в Postgres/Redis, но показывает другой паттерн:
- Dev: `npx quartz build --serve` (hot-reload через watch)
- Prod: multi-stage build → Nginx раздаёт статику

### Dev Dockerfile

```dockerfile
FROM node:24-alpine

RUN apk add --no-cache git

WORKDIR /quartz

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 8080

CMD ["npx", "quartz", "build", "--serve"]
```

### Prod Dockerfile (multi-stage)

```dockerfile
FROM node:24-alpine AS builder

RUN apk add --no-cache git

WORKDIR /quartz

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx quartz build

FROM nginx:alpine

COPY --from=builder /quartz/public /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

### Что такое multi-stage build

Два "этапа" в одном Dockerfile:

1. **Builder stage** (`FROM node:24-alpine AS builder`): устанавливает зависимости, компилирует сайт
2. **Runtime stage** (`FROM nginx:alpine`): копирует только готовые файлы, запускает Nginx

**Результат:** продакшен-образ ~30MB вместо ~300MB (без Node.js, без исходников).

### Запуск Quartz отдельно

```bash
cd infra/dev-environment/quartz-site

# Dev режим
docker build -t quartz-dev .
docker run -p 8080:8080 -v $(pwd)/content:/quartz/content quartz-dev

# Открой http://localhost:8080
# Поменяй content/index.md — сайт пересоберётся автоматически
```

---

## Шаг 2.9: Dev vs Prod Dockerfile

### Сравнение

| | Dev Dockerfile | Prod Dockerfile |
|---|---|---|
| **Основа** | `node:24-alpine` | Multi-stage |
| **Источники** | Монтируются через volumes | Копируются в образ |
| **Зависимости** | `npm install` (включая dev) | `npm ci` (только prod) |
| **Команда** | `npm run dev` (hot-reload) | `node server.js` |
| **Размер** | ~300MB + volume | ~100MB (standalone) |
| **Используется** | `docker compose up` | `docker compose -f docker-compose.prod.yml up` |

### Production Dockerfile разбор

```dockerfile
FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci                          # чистая установка (по lock файлу)
COPY . .
RUN npm run build                   # Next.js standalone build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./    # только standalone output
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

**`output: "standalone"`** в `next.config.js` позволяет Next.js собрать само-contained приложение без `node_modules`.

---

## Шаг 2.10: Отладка контейнеров

### Просмотр логов

```bash
# Все сервисы
docker compose logs

# Только приложение, с потоковым выводом
docker compose logs -f app

# Последние 50 строк
docker compose logs --tail 50 postgres
```

### Выполнение команд в контейнере

```bash
# Интерактивная сессия
docker exec -it platform-app sh

# Выполнить одну команду
docker exec platform-app npx prisma migrate dev

# Проверить подключение к БД из контейнера
docker exec platform-app sh -c "pg_isready -h postgres -p 5432"
```

### Перезапуск

```bash
# Пересобрать и перезапустить (после изменений в Dockerfile)
docker compose up -d --build

# Перезапустить один сервис
docker compose restart app

# Полная остановка (данные сохраняются)
docker compose down

# Остановка с удалением данных
docker compose down -v
```

### Полезные команды

```bash
# Список запущенных контейнеров
docker compose ps

# Использование ресурсов
docker stats

# Размер образов
docker images | grep platform

# Очистка неиспользуемых образов
docker image prune -f
```

---

## Вопросы для самопроверки

1. **Зачем нужен анонимный том `/app/node_modules`?**
   [Подсказка: что произойдёт если его не указать?]

2. **В чём разница между `npm install` и `npm ci`?**
   [Подсказка: один использует package-lock.json, другой нет]

3. **Почему в `.env` файле хост — `postgres`, а не `localhost`?**
   [Подсказка: Docker Compose networking]

4. **Что произойдёт при `docker compose down -v`?**
   [Подсказка: named volumes удаляются]

5. **Зачем multi-stage build в продакшене?**
   [Подсказка: размер образа и безопасность]

---

## Готово!

Ты настроил:
- Dockerfile для разработки с hot-reload
- Multi-сервисную среду (app + PostgreSQL + Redis)
- Multi-stage продакшен-сборку
- Два примера: Next.js + Apollo и Quartz

**Следующий модуль:** Модуль 3: CI/CD пайплайн
