# Plan: Pipeline de Build de Imágenes Docker para Votium API

## Resumen

Integrar el pipeline completo de build y push de imágenes Docker hacia Amazon ECR **dentro del mismo `ci.yaml`** existente. El pipeline unificado ejecuta format check, lint, tests unitarios e integración, build de TypeScript, y finalmente build + push a ECR (solo en push a `develop`). Usa OIDC para autenticación contra AWS y cache de capas Docker para builds eficientes.

---

## 1. Archivos a crear/modificar

| Archivo | Acción | Propósito |
|---------|--------|-----------|
| `.github/workflows/ci.yaml` | **Modificar** | Agregar jobs `build` y `docker-build` al workflow existente |
| `docs/DOCKER_BUILD.md` | **Crear** (opcional) | Documentación del pipeline y setup manual de AWS |

No se crea un workflow separado. Todo el pipeline vive en `ci.yaml`.

---

## 2. Estrategia de versionado y tagging

### 2.1 Tags inmutables con prefijo de ambiente

Cada imagen recibe **dos tags** al hacer push:

| Tag | Ejemplo | Inmutable | Propósito |
|-----|---------|-----------|-----------|
| `develop-{version}-{sha7}` | `develop-0.1.0-a1b2c3d` | ✅ Sí | Tag único por build, trazable al commit |
| `develop-latest` | `develop-latest` | ❌ Se sobreescribe | Referencia móvil para el último build exitoso |

### 2.2 Lógica de generación de `{version}`

1. Se ejecuta `git describe --tags --match 'v*' --abbrev=0` para obtener el tag semver más cercano (ej. `v0.1.0`).
2. Si existe tag: se extrae la versión sin la `v` → `0.1.0`.
3. Si no existe tag: se usa `0.0.0` como fallback.
4. El SHA se obtiene con `git rev-parse --short=7 HEAD`.

**Flujo de trabajo recomendado para el equipo:**

- Para releases formales: crear un GitHub Release con tag `vX.Y.Z` en un commit de `develop`. El próximo build Docker usará ese tag semver.
- Para builds diarios: se usa `develop-0.0.0-{sha7}`, lo que sigue siendo único y rastreable.

### 2.3 Ejemplos de tags generados

| Evento | Tag único | Tag latest |
|--------|-----------|------------|
| Push a develop sin tag Git | `develop-0.0.0-a1b2c3d` | `develop-latest` |
| Push a develop con tag `v0.1.0` | `develop-0.1.0-a1b2c3d` | `develop-latest` |
| Push a develop con tag `v1.0.0` | `develop-1.0.0-b2c3d4e` | `develop-latest` |

---

## 3. Configuración de OIDC (IAM Role + Trust Policy)

> **Nota:** Este setup es idéntico al plan anterior. Se incluye aquí para tenerlo en el mismo documento.

### 3.1 Prerrequisito: Crear OIDC Identity Provider en AWS

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list <THUMBPRINT>
```

> **Nota:** El thumbprint se obtiene de `https://token.actions.githubusercontent.com/.well-known/openid-configuration`. Usa `openssl s_client -connect token.actions.githubusercontent.com:443 -servername token.actions.githubusercontent.com < /dev/null 2>/dev/null | openssl x509 -fingerprint -noout -in /dev/stdin | cut -d'=' -f2 | tr -d ':'` para obtenerlo.

### 3.2 Crear IAM Role

**Nombre sugerido:** `github-actions-votium-develop`

**Trust Policy:**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:<GITHUB_ORG>/votium-api:ref:refs/heads/develop"
        }
      }
    }
  ]
}
```

**Política de permisos (IAM Policy):**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:PutImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload",
        "ecr:BatchGetImage",
        "ecr:DescribeImages",
        "ecr:StartImageScan"
      ],
      "Resource": "*"
    }
  ]
}
```

> `ecr:GetAuthorizationToken` opera a nivel de cuenta y requiere `Resource: "*"`. Los permisos restantes podrían acotarse al ARN del repositorio específico, pero se deja `"*"` por simplicidad para el ambiente develop.

### 3.3 Output del setup

El ARN del rol creado (ej. `arn:aws:iam::123456789012:role/github-actions-votium-develop`) se usará como secret en GitHub.

---

## 4. Workflow de GitHub Actions (CI unificado)

### 4.1 Estructura general

**Archivo:** `.github/workflows/ci.yaml` (modificado)

**Evento:** El workflow se dispara en push a `develop`/`main` y PRs contra esas ramas — igual que hoy. El nuevo job `docker-build` se ejecuta **solo en push a develop** (no en PRs) y **solo si tests y build pasan**.

### 4.2 Diagrama de flujo

```
Push a develop
      │
      ▼
┌────────────────┐
│  format         │  (siempre)
│  lint           │  (siempre)
│  tests          │  (siempre, con Postgres)
│  build          │  (siempre — compila TypeScript)
└───────┬────────┘
        │ Todos exitosos
        ▼
┌────────────────┐
│  docker-build   │  (solo push a develop, no PRs)
│  • OIDC → AWS   │
│  • Login ECR     │
│  • Generar tags  │
│  • Buildx + push │
│  • Trigger scan  │
└────────────────┘
```

### 4.3 Contenido actualizado de `ci.yaml`

```yaml
name: CI

on:
  push:
    branches:
      - main
      - develop
  pull_request:
    branches:
      - main
      - develop

env:
  AWS_REGION: us-east-2
  ECR_REPOSITORY: votium-development-backend
  ENVIRONMENT: develop

jobs:
  format:
    name: Format
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'npm'
      - run: npm ci
      - run: npx prisma generate
      - run: npm run format:check

  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'npm'
      - run: npm ci
      - run: npx prisma generate
      - run: npm run lint

  tests:
    name: Tests
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: votium
          POSTGRES_PASSWORD: votium
          POSTGRES_DB: votium_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 5s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'npm'
      - run: npm ci
      - run: npx prisma generate
      - run: npm run test
      - run: npx prisma migrate deploy
        env:
          DATABASE_URL: postgresql://votium:votium@localhost:5432/votium_test
      - run: npm run test:integration
        env:
          DATABASE_URL: postgresql://votium:votium@localhost:5432/votium_test

  build:
    name: Build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'npm'
      - run: npm ci
      - run: npx prisma generate
      - run: npm run build

  docker-build:
    name: Docker Build & Push
    if: >
      github.event_name == 'push' &&
      github.ref == 'refs/heads/develop'
    needs: [tests, build]
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
    steps:
      # ── 1. Checkout completo (fetch-depth: 0 para git describe) ──
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      # ── 2. Autenticación AWS vía OIDC ──
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: ${{ env.AWS_REGION }}

      # ── 3. Login a ECR ──
      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      # ── 4. Generar tags Docker ──
      - name: Generate Docker tags
        id: tags
        run: |
          SHA_SHORT=$(git rev-parse --short=7 HEAD)

          # Obtener el tag semver más cercano (ej. v0.1.0)
          GIT_TAG=$(git describe --tags --match 'v*' --abbrev=0 2>/dev/null || echo "")

          if [ -n "$GIT_TAG" ]; then
            VERSION="${GIT_TAG#v}"  # Elimina el prefijo 'v'
          else
            VERSION="0.0.0"
          fi

          DOCKER_TAG="${ENVIRONMENT}-${VERSION}-${SHA_SHORT}"
          echo "tag=${DOCKER_TAG}" >> "${GITHUB_OUTPUT}"
          echo "version=${VERSION}" >> "${GITHUB_OUTPUT}"

      # ── 5. Buildx setup ──
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      # ── 6. Build y push a ECR ──
      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: |
            ${{ steps.login-ecr.outputs.registry }}/${{ env.ECR_REPOSITORY }}:${{ steps.tags.outputs.tag }}
            ${{ steps.login-ecr.outputs.registry }}/${{ env.ECR_REPOSITORY }}:${{ env.ENVIRONMENT }}-latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

      # ── 7. Forzar escaneo de imagen ──
      - name: Trigger ECR image scan
        run: |
          aws ecr start-image-scan \
            --repository-name ${{ env.ECR_REPOSITORY }} \
            --image-id imageTag=${{ steps.tags.outputs.tag }}
```

### 4.4 Explicación de cada cambio respecto al `ci.yaml` actual

1. **Nuevas `env` globales** — `AWS_REGION`, `ECR_REPOSITORY`, `ENVIRONMENT` se definen a nivel de workflow para compartirse entre jobs.

2. **Nuevo job `build`** — Ejecuta `npm run build` (compilación TypeScript con NestJS). Es un job independiente que valida que el proyecto compile correctamente. Corre en PRs y pushes por igual.

3. **Nuevo job `docker-build`** — Solo se ejecuta cuando:
   - El evento es `push` (no en PRs).
   - La rama es `develop` (`github.ref == 'refs/heads/develop'`).
   - Los jobs `tests` y `build` finalizaron con éxito (`needs: [tests, build]`).

4. **Checkout con `fetch-depth: 0`** — Solo en el job `docker-build`. Necesario para que `git describe` pueda buscar tags. Los demás jobs usan el checkout por defecto (más rápido).

5. **`permissions` a nivel de job** — El job `docker-build` solicita `id-token: write` para OIDC y `contents: read` (valor por defecto explícito). Los demás jobs no necesitan `id-token`.

6. **Pasos 2-7 del job `docker-build`** — Son idénticos a los del plan anterior (OIDC → login ECR → tags → buildx → build+push → scan).

7. **El resto del CI se mantiene intacto** — `format`, `lint`, `tests` siguen funcionando exactamente como antes.

---

## 5. Comandos y configuraciones de AWS necesarias

### 5.1 Resumen del setup inicial

```bash
# 1. Configurar AWS CLI con perfil de administrador
aws configure

# 2. Obtener thumbprint para OIDC
echo | openssl s_client -servername token.actions.githubusercontent.com \
  -connect token.actions.githubusercontent.com:443 2>/dev/null | \
  openssl x509 -fingerprint -noout | cut -d'=' -f2 | tr -d ':'

# 3. Crear OIDC Identity Provider
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list <THUMBPRINT>

# 4. Guardar el ARN del proveedor (ej. arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com)

# 5. Crear política de permisos para el role
aws iam create-policy \
  --policy-name github-actions-ecr-votium-develop \
  --policy-document file://ecr-policy.json

# 6. Crear el role IAM con trust policy
aws iam create-role \
  --role-name github-actions-votium-develop \
  --assume-role-policy-document file://trust-policy.json

# 7. Adjuntar la política al role
aws iam attach-role-policy \
  --role-name github-actions-votium-develop \
  --policy-arn arn:aws:iam::<ACCOUNT_ID>:policy/github-actions-ecr-votium-develop

# 8. Verificar que el repositorio ECR existe
aws ecr describe-repositories --repository-names votium-development-backend
# Si no existe:
aws ecr create-repository \
  --repository-name votium-development-backend \
  --image-scanning-configuration scanOnPush=true \
  --region us-east-2

# 9. Obtener el ARN del role para usarlo en GitHub
aws iam get-role --role-name github-actions-votium-develop --query 'Role.Arn' --output text
```

### 5.2 Verificación del Enhanced Scanning

El Enhanced Scanning de ECR se configura a nivel de cuenta o repositorio:

```bash
# Verificar configuración actual
aws ecr describe-registry-scanning-configuration --region us-east-2

# Si se desea habilitar Enhanced Scanning a nivel de cuenta (recomendado):
# Esto se hace desde la consola AWS → ECR → Scanning → Edit scanning configuration
# Seleccionar "Enhanced scanning" con "Continuous scanning" para todos los repositorios
```

> **Nota:** El Enhanced Scanning tiene costos asociados. Verificar si la cuenta AWS ya lo tiene habilitado.

---

## 6. Variables/secrets de GitHub necesarias

### 6.1 Secrets

| Secret | Valor | Descripción |
|--------|-------|-------------|
| `AWS_ROLE_ARN` | `arn:aws:iam::123456789012:role/github-actions-votium-develop` | ARN del role IAM que GitHub Actions asumirá |

### 6.2 Variables de entorno (Environment Variables)

| Variable | Valor | Propósito |
|----------|-------|-----------|
| `AWS_REGION` | `us-east-2` | Región de AWS (también definida en `env` del workflow) |
| `ECR_REPOSITORY` | `votium-development-backend` | Nombre del repositorio ECR (también definida en `env`) |
| `ENVIRONMENT` | `develop` | Nombre del ambiente (también definida en `env`) |

### 6.3 Configuración en GitHub

```bash
# Usando gh CLI
gh secret set AWS_ROLE_ARN --repo <GITHUB_ORG>/votium-api --body "arn:aws:iam::123456789012:role/github-actions-votium-develop"
```

También se puede configurar desde la UI: **Settings → Secrets and variables → Actions**.

---

## 7. Consideraciones de seguridad

### 7.1 Principio de mínimo privilegio

- El role IAM solo tiene permisos para ECR (push/scan). No tiene acceso a EKS, S3, ni ningún otro servicio.
- La Trust Policy restringe a la rama `develop` específicamente (`ref:refs/heads/develop`). Ni `main` ni otras ramas pueden asumir este role.
- El job `docker-build` tiene `permissions: { id-token: write, contents: read }`. Los demás jobs no tienen `id-token: write`.
- El `GITHUB_TOKEN` por defecto no tiene `contents: write`, por lo que el workflow no puede modificar el repo.

### 7.2 Seguridad de imágenes

- **Usuario no-root**: El Dockerfile ya ejecuta la app con `appuser`.
- **Multi-stage build**: Las dependencias de desarrollo no están en la imagen final. Solo `node_modules` de producción, el build compilado, y Prisma.
- **Escaneo de vulnerabilidades**: ECR Enhanced Scanning escanea cada imagen al hacer push. El workflow además fuerza un escaneo inmediato.
- **Imágenes inmutables**: Cada tag (excepto `develop-latest`) identifica una combinación única de versión + commit, lo que permite rastrear exactamente qué código está corriendo.

### 7.3 Secretos en el workflow

- No se exponen AWS keys. Todo usa OIDC.
- `AWS_ROLE_ARN` es un secret, pero su valor (un ARN) no es sensible per se. Aún así se guarda como secret.
- No hay secrets de base de datos ni JWT en el pipeline de build. La app los recibe en runtime.

---

## 8. Consideraciones sobre el orden de jobs

- `format`, `lint`, `tests`, y `build` **corren en paralelo** entre sí (no tienen `needs`).
- `docker-build` tiene `needs: [tests, build]`, por lo que espera a que **ambos** terminen exitosamente.
- No se declara `needs` en `format` o `lint` para `docker-build` porque no son requisitos para construir la imagen. Sin embargo, si `format` o `lint` fallan, el workflow se marca como fallido igualmente.
- Si se desea que `docker-build` también espere por `format` y `lint`, se puede agregar `needs: [format, lint, tests, build]`. Por ahora, `tests` + `build` son suficientes (validan que el código funciona y compila).

---

## 9. Testing Plan

### 9.1 Validación del workflow (previo a merge)

1. **Push a develop** — Verificar que todos los jobs (`format`, `lint`, `tests`, `build`, `docker-build`) se ejecuten en orden y el Docker push sea exitoso.
2. **PR contra develop** — Verificar que `format`, `lint`, `tests`, `build` se ejecuten, pero **`docker-build` NO se ejecute**.
3. **Push a main** — Verificar que `format`, `lint`, `tests`, `build` se ejecuten, pero **`docker-build` NO se ejecute** (por ahora solo develop tiene deploy).
4. **Verificar etiquetado correcto**: que el tag semver se genere bien con y sin tags de Git.
5. **Verificar push a ECR**: que la imagen aparezca en el repositorio ECR con ambos tags.
6. **Verificar escaneo**: que el Enhanced Scanning se active.
7. **CI fallido**: forzar un test fallido en develop y verificar que `docker-build` se salte (por la dependencia `needs`).

### 9.2 Pruebas de regresión

- Los jobs `format`, `lint`, `tests` no cambian su lógica, solo se agrega el job `build` (compilación) que ya se ejecuta localmente.
- El Dockerfile no se modifica, por lo que la imagen resultante es la misma que se construye localmente.

### 9.3 Monitoreo post-implementación

- Revisar los logs del workflow en GitHub Actions en los primeros builds.
- Verificar que el cache de Docker (`type=gha`) esté funcionando: el segundo build debería ser más rápido.
- Revisar los resultados del escaneo en ECR Console.

---

## 10. Riesgos y consideraciones

| Riesgo | Mitigación |
|--------|------------|
| `docker-build` se ejecuta aunque `format` o `lint` fallen | `docker-build` solo depende de `tests` y `build`. Si se desea mayor rigurosidad, agregar `needs: [format, lint, tests, build]`. Por ahora se considera aceptable. |
| Cache de Docker `type=gha` puede llenar el límite de GitHub (10 GB) | Si ocurre, migrar a `type=registry` (cache en ECR) o limpiar cachés viejas periódicamente |
| Tags semver duplicados si se hace rebuild del mismo commit | El SHA hace el tag único; el tag latest se sobreescribe |
| El setup de OIDC requiere permisos de admin en AWS | Documentar los pasos para que el equipo de infraestructura lo ejecute |
| El workflow no despliega a EKS | Es intencional: el deploy será un workflow separado en el futuro |
| Las `env` globales (`AWS_REGION`, `ECR_REPOSITORY`, `ENVIRONMENT`) se definen para todos los jobs aunque no las usen | Son solo variables de entorno, no tienen impacto en jobs que no las referencian. Se definen a nivel global para mantenerlas centralizadas. |

---

## 11. Próximos pasos: Extensión a producción

Cuando se agregue el ambiente de producción, los cambios necesarios son:

### 11.1 Nuevos recursos AWS

- Nuevo ECR: `votium-production-backend`
- Nuevo role IAM: `github-actions-votium-production`
  - Trust Policy restringida a `ref:refs/heads/main`
  - Misma política de permisos (ECR)
- Opcional: Nuevo OIDC Provider (se puede reutilizar el mismo)

### 11.2 Nuevos secrets/variables GitHub

| Secret | Ejemplo |
|--------|---------|
| `AWS_ROLE_ARN_PROD` | `arn:aws:iam::123456789012:role/github-actions-votium-production` |

| Variable | Ejemplo |
|----------|---------|
| `ECR_REPOSITORY_PROD` | `votium-production-backend` |

### 11.3 Estrategia de matriz (matrix) para el job `docker-build`

Cuando se agregue producción, el job `docker-build` puede usar una `matrix`:

```yaml
jobs:
  docker-build:
    if: github.event_name == 'push'
    needs: [tests, build]
    strategy:
      matrix:
        environment: [develop, production]
        include:
          - environment: develop
            aws-role-arn: ${{ secrets.AWS_ROLE_ARN }}
            ecr-repository: votium-development-backend
            branch-ref: refs/heads/develop
          - environment: production
            aws-role-arn: ${{ secrets.AWS_ROLE_ARN_PROD }}
            ecr-repository: votium-production-backend
            branch-ref: refs/heads/main
    if: github.ref == matrix.branch-ref
    ...
```

### 11.4 Deploy a EKS (futuro)

El pipeline actual solo construye y pushea la imagen. El deploy a EKS será un workflow separado que:
1. Escuche el evento `push` al registry de ECR (o se active manualmente).
2. Actualice el Deployment de Kubernetes con la nueva imagen.

---

## Resumen de implementación

| Paso | Responsable | Descripción |
|------|-------------|-------------|
| 1 | Infraestructura | Crear OIDC Provider, IAM Role y policies en AWS |
| 2 | Infraestructura | Verificar/crear ECR `votium-development-backend` |
| 3 | Developer | Configurar `AWS_ROLE_ARN` como secret en GitHub |
| 4 | Developer | Modificar `.github/workflows/ci.yaml` con el contenido del plan (agregar jobs `build` y `docker-build`) |
| 5 | Developer | Hacer commit y push a develop |
| 6 | Developer | Verificar que el workflow completo se ejecute correctamente |
| 7 | Infraestructura | Habilitar Enhanced Scanning en ECR (si no lo está) |
