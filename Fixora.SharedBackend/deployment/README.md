# Deployment

* `docker compose up --build` (from `shared-backend/`) → SQL Server 2022 + the Fixora API on http://localhost:5080.
* Secrets come from environment variables, never from `appsettings.json`:
  `ConnectionStrings__Fixora`, `Jwt__SigningKey` (32+ random characters), `Ai__AnthropicApiKey` (optional; template fallback otherwise),
  `Cors__Origins__0=https://manager.your-domain` (empty = any origin, development only).
* Health check: `GET /health`. OpenAPI: `GET /openapi/v1.json`. Realtime: `/hubs/fixora` (WebSockets must pass through the proxy).
* Set `Customer__ExposeDevOtp=false` outside the demo so OTP codes are only emailed.
