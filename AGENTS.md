# Project: Infrastructure Training for Airgapped Networks

This repository is for learning and practicing infrastructure deployment for development in an airgapped (isolated) network environment.

## Source Material

- `ai-adviс.json`: Dialogue with AI assistant about setting up development processes for microservices in an airgapped network. Contains detailed architecture recommendations, CI/CD setup, and infrastructure deployment guidance.

## Project Context

**Problem:** Setting up a development process for a system with two main parts (central and client), each containing multiple microservices, in an isolated network environment.

**System Architecture:**
- **Central Service:** Backend + Frontend + Webhook Service (tusd integration)
- **Client Service:** Backend + Frontend + Webhook Service (tusd integration)
- **Key Difference:** Central uses SeaweedFS for file storage, Client uses local filesystem

## Architecture Recommendations

### 1. Monorepo Approach (Recommended)
Use a single repository instead of 7 separate projects to avoid version synchronization issues.

**Repository Structure:**
```
/platform-repo
├── packages/               # Shared libraries
│   ├── shared-core/        # Base classes, utilities, DB models
│   ├── tusd-adapter/       # Common tusd webhook logic
│   └── auth-lib/           # Common authorization library
├── apps/
│   ├── central/            # Central service
│   │   ├── back/           # Backend (imports packages/*, config: S3/SeaweedFS)
│   │   └── front/          # Frontend
│   └── client/             # Client service
│       ├── back/           # Backend (imports packages/*, config: Local FS)
│       └── front/          # Frontend
├── opensource/             # External service configs (tusd, seaweedfs, postgres, redis)
├── infra/                  # Infrastructure as Code
│   ├── dev/                # docker-compose for local development
│   ├── main-prod/          # Deployment configs for central service
│   └── client-prod/        # Deployment configs for client service
├── scripts/                # Helper bash scripts
└── .gitlab-ci.yml
```

### 2. Air-Gapped Infrastructure Components
- **GitLab + GitLab Container Registry:** Stores built images of your microservices
- **Sonatype Nexus:** Proxy cache for Docker, NPM, Maven, PyPI (acts as dependency proxy)
- **GitLab Runner:** Builds projects in docker mode

**Dependency Management Without Internet:**
- Docker images: Pull on internet machine → `docker save` → transfer via USB → `docker load` → push to local registry
- NPM/Pip packages: Use vendoring (commit `.yarn-offline-mirror` or `vendor/` to Git)

**Initial base images to pre-load:** `postgres:15`, `redis:7`, `tusproject/tusd:latest`, `node:18-alpine`, `python:3.11-slim`

**Docker daemon config:** Configure `daemon.json` on all dev machines and GitLab Runner to use Nexus as `registry-mirrors`.

**Python vendoring:** `pip download -r requirements.txt -d ./packages` → commit `packages/` to Git.

**NPM alternatives:** `verdaccio` (local npm registry for `.tgz` archives) or `npm-pack-all` utility.

### 3. Development Environment
- Developers only need Git and Docker Desktop installed
- Use `make dev` or `docker compose up` to run the entire system
- Code is mounted into containers with hot-reload enabled
- All dependencies pulled from local Nexus

**Dev vs Prod:**
- **Dev:** Uses `build:` directive in docker-compose, mounts source code, hot-reload enabled
- **Prod:** Uses `image:` directive, pulls pre-built images from registry

**Example docker-compose.yml (tusd + webhook):**
```yaml
services:
  tusd:
    image: registry.local.dev/tusproject/tusd:latest
    command: -upload-dir /data -hooks-http http://webhook-service:3000/hooks -hooks-http-forward-headers Origin
    ports:
      - "8080:8080"
    volumes:
      - ./uploads:/data
  webhook-service:
    build: ../../apps/webhook-service
    ports:
      - "3000:3000"
    environment:
      - TUSD_SECRET=mysecret
```

**Example Dockerfile (Node.js backend):**
```dockerfile
FROM registry.local.dev/node:18-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --registry=http://nexus.local.dev/repository/npm-group/
COPY . .
CMD ["npm", "start"]
```

### 4. CI/CD Pipeline (`.gitlab-ci.yml`)
- **Lint & Test:** Code validation
- **Build:** Builds Docker images only for changed services (using `git diff` or `rules: changes`)
- **Push:** Sends images to GitLab Registry
- **Deploy:** SSH to server, `docker compose pull` and `up -d`

**CI job structure:**
- Use `docker:dind` service for Docker-in-Docker builds
- Include `docker login -u $CI_REGISTRY_USER -p $CI_REGISTRY_PASSWORD registry.local` step
- Use `needs:` for job dependencies (e.g., deploy waits for build)
- Use `when: manual` for deploy jobs (or auto-trigger on `develop` branch)

**CI/CD trigger logic:**
- Changes in `apps/` → rebuild Docker image
- Changes in `opensource/` → redeploy containers (no rebuild needed)

### 5. Versioning Strategy
- **Development:** Tag images with Git SHA (e.g., `main-back:sha-a1b2c3d`)
- **Release:** Git tag on entire repository (e.g., `v2.4.0`)
- **Benefit:** Atomic commits ensure version compatibility between frontend and backend

### 6. Key Configuration Details

**Docker Registry Usage:**
- **GitLab Registry:** Stores built application images (your intellectual property)
- **Nexus:** Stores base images (node:18, python:3.11) and dependency packages

**Yarn vs NPM:**
- Yarn v1 recommended for air-gapped environments due to `yarn-offline-mirror` feature
- Offline packages can be committed to Git or transferred via USB
- No need to install Yarn on developer machines (runs in Docker containers)

**Redis Usage:**
- Webhook queues (BullMQ)
- Caching (user permissions, heavy queries)
- Rate limiting
- Sessions (if needed)

### 7. Air-Gapped Nexus Setup
**Important:** In pure air-gapped networks, proxy repositories won't work (no internet access).

**Simpler Approach for Small Teams:**
1. Use vendoring for NPM/Pip packages (commit `.yarn-offline-mirror` to Git)
2. Manually load Docker images into GitLab Registry
3. Use Nexus primarily as a UI to view available packages

**Alternative (Complex):**
1. Set up temporary Nexus with internet access
2. Export Nexus database and blob storage
3. Import into air-gapped Nexus

### 8. Shared Code Architecture
Use dependency injection for storage providers to share code between central and client services:

```typescript
// packages/shared-core/storage.ts
export interface StorageProvider {
  saveFile(buffer: Buffer, path: string): Promise<string>;
}
```

- Central: `new SeaweedFSProvider({ url: 'http://seaweedfs:9333' })`
- Client: `new LocalFileSystemProvider({ path: '/var/data/' })`

**CI/CD Impact:** Changes to `packages/` trigger builds for both central and client services.

## Key Takeaways

1. **Monorepo eliminates version synchronization issues** between frontend, backend, and webhooks
2. **Nexus + Local Registry solve air-gapped dependency management** (no USB drives with node_modules)
3. **Docker Compose for development and initial production** saves months compared to Kubernetes
4. **Git SHA as version** reduces cognitive load during development
5. **Shared code with dependency injection** allows writing business logic once, with configuration differences handled via environment variables

**Important Warning:** Avoid Kubernetes, ArgoCD, and complex mesh networks for small teams — they create overwhelming overhead.

## Commands Reference

**Local Development:**
```bash
make dev  # or docker compose up
```

**Build and Push Images:**
```bash
docker build -t registry.local/platform/main-back:$CI_COMMIT_SHORT_SHA ./apps/main-back
docker push registry.local/platform/main-back:$CI_COMMIT_SHORT_SHA
```

**Deploy to Server:**
```bash
ssh user@dev-server "cd /opt/platform && docker compose pull && docker compose up -d"
```

**Create Release Tag:**
```bash
git tag v2.4.0
git push --tags
```
