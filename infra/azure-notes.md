# Azure deployment outline

Recommended small deployment:

- Azure App Service (Linux) or Azure Container Apps for `web`
- Azure App Service (Linux) or Azure Container Apps for `api`
- Azure Database for PostgreSQL Flexible Server
- Azure Blob Storage for private voice-message files
- Azure Key Vault for secrets
- Azure DNS for `abhi4848.com`
- Managed TLS certificate / HTTPS
- Application Insights for logs and availability

## Domain

Point:

```text
abhi4848.com       -> web application
api.abhi4848.com   -> API
```

Use HTTPS everywhere.

## Important

Do not store voice recordings as browser `blob:` URLs in production. The demo stores a browser-local object URL only to show the UI flow. Production should upload the recording to private Azure Blob Storage using a short-lived signed upload URL, then store only the object identifier/private URL in PostgreSQL.

For 4–6 users, keep the architecture small. Avoid Kubernetes unless there is a future requirement for it.

## Secrets

Store these in Azure Key Vault / App Service secret configuration:

- DATABASE_URL
- JWT_SECRET
- AI_API_KEY
- VAPID_PRIVATE_KEY

Never commit `.env`.
