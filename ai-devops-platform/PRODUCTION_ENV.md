# Production Environment Configuration

This guide covers setting up ChangeLens for production deployment.

## Required Variables

### Core Configuration

- `NODE_ENV=production` - REQUIRED. Enables security validation.
- `PORT=4000` - Port the Express server listens on (default: 4000).
- `MONGODB_URI` - REQUIRED. MongoDB connection string (e.g., `mongodb+srv://user:pass@cluster.mongodb.net/changelens`).
- `CLIENT_URL` - REQUIRED. Public URL of the frontend (e.g., `https://changelens.example.com`). CORS is restricted to this origin only.
- `AUTH_DISABLED=false` - REQUIRED for production. Must be explicitly set to `false`.

### Security

- `JWT_SECRET` - REQUIRED for production. Must be ≥32 characters, random, and unique per deployment. Generate with:
  ```bash
  openssl rand -base64 32
  ```
  **Never commit this to version control.**

- `INITIAL_ADMIN_EMAIL` - Email address for the first admin user. Set during initial deployment.
- `INITIAL_ADMIN_PASSWORD` - Password for the first admin user. Must be ≥12 characters. Set during initial deployment, then remove from env after first login.

- `ALLOW_PUBLIC_REGISTRATION` - Set to `false` in production (default behavior). Public registration is only enabled in development.

## Optional: AI Integration

Ollama provides local evidence-backed RCA. It is entirely optional.

- `AI_PROVIDER=ollama` - Set to `ollama` to enable Ollama, or `mock` to disable.
- `OLLAMA_BASE_URL=http://ollama:11434` - Ollama API endpoint (e.g., `http://127.0.0.1:11434` for local, or remote HTTP URL).
- `OLLAMA_MODEL=llama3.2` - LLM model name. Must be available in the Ollama instance.
- `OLLAMA_TIMEOUT_MS=120000` - Timeout for AI analysis (milliseconds). Default: 120s.

**Note**: If Ollama is unavailable, the application continues to function deterministically. AI is not required for core features.

## Optional: GitHub Integration

Read-only access to GitHub for importing commits and repository metadata.

- `GITHUB_API_BASE_URL=https://api.github.com` - GitHub API endpoint (default: public GitHub).
- `GITHUB_TOKEN` - GitHub personal access token (optional for public repos, required for private). Never commit to version control.
- `GITHUB_TIMEOUT_MS=15000` - Timeout for GitHub API calls (milliseconds).

## Optional: Kubernetes Integration

Read-only access to a Kubernetes cluster for observing workloads.

- `KUBERNETES_API_URL` - Kubernetes API endpoint (e.g., `https://kubernetes.default.svc` for in-cluster).
- `KUBERNETES_TOKEN` - Kubernetes service account token. Never commit to version control.
- `KUBERNETES_CA_CERT` - CA certificate for the API server, as PEM text (literal `\n` for newlines) or a path to a PEM file (in-cluster: `/var/run/secrets/kubernetes.io/serviceaccount/ca.crt`). Needed whenever the cluster uses a private CA; certificate verification stays on. The server refuses to start if the value is not a readable PEM certificate.
- `KUBERNETES_TIMEOUT_MS=10000` - Timeout for Kubernetes API calls (milliseconds).

**Important**: The Kubernetes integration is read-only. It never calls `kubectl`, applies manifests, deletes resources, or executes commands. It only observes Deployment, StatefulSet, and DaemonSet state.

## Optional: Prometheus Integration

Read-only access to Prometheus for observing metrics.

- `PROMETHEUS_API_URL` - Prometheus API endpoint (e.g., `http://prometheus:9090`).
- `PROMETHEUS_TOKEN` - Prometheus authentication token (if required). Never commit to version control.
- `PROMETHEUS_TIMEOUT_MS=10000` - Timeout for Prometheus queries (milliseconds).

## Optional: Loki Integration

Read-only access to Loki for observing logs.

- `LOKI_API_URL` - Loki API endpoint (e.g., `http://loki:3100`).
- `LOKI_TOKEN` - Loki authentication token (if required). Never commit to version control.
- `LOKI_TIMEOUT_MS=10000` - Timeout for Loki queries (milliseconds).

## Optional: Application Metadata

- `APP_VERSION` - Application version string (default: `0.1.0`).
- `JSON_BODY_LIMIT` - Maximum request body size (default: `1mb`).

## Environment Validation

The application validates the following in production:

✅ `NODE_ENV=production` is set  
✅ `AUTH_DISABLED=false`  
✅ `CLIENT_URL` is configured  
✅ `JWT_SECRET` is ≥32 characters  
✅ `MONGODB_URI` is valid and accessible  
✅ All integration timeouts are 1-60000 milliseconds  

If any validation fails, the application will not start.

## Example: Docker Compose

```bash
# Create .env file
cat > .env << EOF
NODE_ENV=production
PORT=4000
MONGODB_URI=mongodb://mongo:27017/changelens
CLIENT_URL=https://changelens.example.com
AUTH_DISABLED=false
JWT_SECRET=$(openssl rand -base64 32)
INITIAL_ADMIN_EMAIL=admin@example.com
INITIAL_ADMIN_PASSWORD=ChangeLens@123

AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_MODEL=llama3.2

GITHUB_TOKEN=
KUBERNETES_API_URL=
KUBERNETES_TOKEN=
KUBERNETES_CA_CERT=
PROMETHEUS_API_URL=
LOKI_API_URL=
EOF

# Start services
docker-compose up -d
```

## Example: Kubernetes

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: changelens-secrets
type: Opaque
stringData:
  jwt-secret: $(openssl rand -base64 32)
  initial-admin-password: "ChangeLens@123"
  github-token: ""
  kubernetes-token: ""
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: changelens-backend
spec:
  replicas: 1
  selector:
    matchLabels:
      app: changelens-backend
  template:
    metadata:
      labels:
        app: changelens-backend
    spec:
      containers:
      - name: backend
        image: changelens-backend:latest
        imagePullPolicy: Always
        ports:
        - containerPort: 4000
        env:
        - name: NODE_ENV
          value: "production"
        - name: PORT
          value: "4000"
        - name: MONGODB_URI
          value: "mongodb://mongo:27017/changelens"
        - name: CLIENT_URL
          value: "https://changelens.example.com"
        - name: AUTH_DISABLED
          value: "false"
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: changelens-secrets
              key: jwt-secret
        - name: INITIAL_ADMIN_EMAIL
          value: "admin@example.com"
        - name: INITIAL_ADMIN_PASSWORD
          valueFrom:
            secretKeyRef:
              name: changelens-secrets
              key: initial-admin-password
        livenessProbe:
          httpGet:
            path: /api/health/live
            port: 4000
          initialDelaySeconds: 10
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /api/health/ready
            port: 4000
          initialDelaySeconds: 5
          periodSeconds: 5
```

## Security Checklist

Before deploying to production:

- [ ] `NODE_ENV=production` is set
- [ ] `AUTH_DISABLED=false` is explicitly set
- [ ] `JWT_SECRET` is ≥32 characters and unique
- [ ] `CLIENT_URL` matches the actual frontend domain
- [ ] `MONGODB_URI` uses a secure connection (mongodb+srv:// or SSL)
- [ ] All secrets are stored in environment variables, not in `.env` files checked into git
- [ ] `INITIAL_ADMIN_PASSWORD` is strong (≥12 characters, mixed case, numbers, symbols)
- [ ] Integration tokens (GitHub, Kubernetes, Prometheus, Loki) are obtained from secure vaults (e.g., HashiCorp Vault, AWS Secrets Manager)
- [ ] CORS origin is restricted to the actual CLIENT_URL
- [ ] Rate limiting is enabled (default: 300 requests per 15 minutes)
- [ ] MongoDB backup is configured and tested
- [ ] Application logs are captured and monitored
- [ ] Health check endpoints (`/api/health/live`, `/api/health/ready`) are available
- [ ] HTTPS reverse proxy (e.g., nginx, AWS ALB) is in front of the backend
- [ ] Frontend is served over HTTPS

## Monitoring

Monitor these health endpoints:

- `GET /api/health/live` - Liveness probe (always responds 200 if process is running)
- `GET /api/health/ready` - Readiness probe (responds 200 if MongoDB is connected)
- `GET /api/ai/health` - AI provider status (responds 200 if Ollama is available and healthy)

## Secrets Management Best Practices

1. **Never commit secrets to git**:
   - `.env` files should be gitignored
   - Secrets should come from environment variables or secret management systems

2. **Use secure vaults**:
   - HashiCorp Vault
   - AWS Secrets Manager
   - Google Cloud Secret Manager
   - Azure Key Vault

3. **Rotate secrets regularly**:
   - JWT_SECRET
   - Integration tokens
   - MongoDB passwords

4. **Audit secret access**:
   - Log which services access which secrets
   - Monitor for unauthorized attempts

## Troubleshooting

**"JWT_SECRET must be at least 32 characters"**
- Generate a new secret: `openssl rand -base64 32`
- Update `JWT_SECRET` in environment

**"CLIENT_URL is required and AUTH_DISABLED must be false in production"**
- Set `CLIENT_URL` to the actual frontend domain
- Set `AUTH_DISABLED=false`

**"MONGODB_URI is required"**
- Ensure `MONGODB_URI` is set in environment
- Verify MongoDB is accessible from the application

**"AI response validation failed"**
- Check if Ollama is running and healthy: `curl http://ollama:11434/api/health`
- Check logs for detailed error
- AI failures do not prevent core functionality

**"Integration unavailable"**
- Check integration endpoint health: `GET /api/integrations/kubernetes/health`, `/api/integrations/prometheus/health`, etc.
- Verify integration tokens and URLs are correct
- Missing integrations do not prevent core functionality

---

**Version**: 1.0
**Last Updated**: 2026-09-14
