# Simple app deployment

## Dockerfile (Node example, multi-stage, non-root)
```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --retries=3 CMD wget -qO- http://localhost:3000/healthz || exit 1
CMD ["node", "dist/server.js"]
```
Add a `.dockerignore` (node_modules, .git, tests, .env*). Pin base images by tag, or digest for release builds. Scan with `trivy image`.

## Compose (local and test environments only)
```yaml
services:
  app:
    build: .
    ports: ["3000:3000"]
    environment:
      DATABASE_URL: postgres://app:app@db:5432/app   # throwaway test credentials
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/healthz"]
      interval: 5s
      retries: 10
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app
      POSTGRES_DB: app
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app"]
      interval: 5s
      retries: 10
```
`docker compose up -d --wait` returns when healthchecks pass; `docker compose down -v` resets state. Real secrets come from the environment or a secret store, never the file.

## Kubernetes (minimal)
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
spec:
  replicas: 2
  selector:
    matchLabels: { app: app }
  strategy:
    type: RollingUpdate
    rollingUpdate: { maxUnavailable: 0, maxSurge: 1 }
  template:
    metadata:
      labels: { app: app }
    spec:
      containers:
        - name: app
          image: registry.example.com/app:GIT_SHA
          ports: [{ containerPort: 3000 }]
          readinessProbe: { httpGet: { path: /readyz, port: 3000 }, periodSeconds: 5 }
          livenessProbe: { httpGet: { path: /healthz, port: 3000 }, initialDelaySeconds: 10 }
          resources:
            requests: { cpu: 100m, memory: 128Mi }
            limits: { memory: 256Mi }
          envFrom:
            - secretRef: { name: app-secrets }
---
apiVersion: v1
kind: Service
metadata:
  name: app
spec:
  selector: { app: app }
  ports: [{ port: 80, targetPort: 3000 }]
```

## Roll out, verify, roll back
```
kubectl apply -f k8s/
kubectl rollout status deploy/app --timeout=120s
curl -fsS --retry 10 --retry-delay 3 --retry-connrefused "$URL/healthz"   # smoke
kubectl rollout undo deploy/app                                            # rollback
```
Managed platforms (Render, Fly.io, Azure App Service, AWS ECS or App Runner) follow the same shape: image, env, health check, previous revision to roll back to.

## Checklist before any production deploy
Artifact already tested in staging; config and secrets present; migration is backward compatible; health endpoints return real status; rollback command tried; someone watching dashboards for 15 minutes after.
