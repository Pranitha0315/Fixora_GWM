namespace Fixora.Host;

/// <summary>
/// Swagger UI at /swagger for trying the API in a browser.
/// It reads the built-in OpenAPI document (/openapi/v1.json), so no extra NuGet package is needed;
/// the Swagger UI scripts load from the unpkg CDN. The bar on top logs in as a demo user and adds
/// the Bearer token to every request.
/// </summary>
public static class SwaggerPage
{
    public static IEndpointRouteBuilder MapFixoraSwagger(this IEndpointRouteBuilder app)
    {
        app.MapGet("/swagger", () => Results.Content(Html, "text/html; charset=utf-8"))
           .ExcludeFromDescription();
        return app;
    }

    private const string Html = """
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Fixora API · Swagger</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  <style>
    body { margin: 0; background: #faf8f3; font-family: system-ui, sans-serif; }
    .bar { position: sticky; top: 0; z-index: 10; display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
           padding: 10px 16px; background: #29251e; color: #f4efe5; }
    .bar b { margin-right: 8px; letter-spacing: .02em; }
    .bar button { border: 0; border-radius: 6px; padding: 7px 12px; cursor: pointer; font-weight: 600;
                  background: #8c6418; color: #fff; }
    .bar button.ghost { background: transparent; color: #f4efe5; border: 1px solid #6b6253; }
    .bar input { flex: 1; min-width: 220px; padding: 7px 10px; border-radius: 6px; border: 1px solid #6b6253;
                 background: #3a342a; color: #f4efe5; font-family: ui-monospace, monospace; font-size: 12px; }
    #who { font-size: 13px; opacity: .85; min-width: 140px; }
    .swagger-ui .topbar { display: none; }
  </style>
</head>
<body>
  <div class="bar">
    <b>FIXORA API</b>
    <button data-role="manager">Login as Manager</button>
    <button data-role="mechanic">Login as Mechanic</button>
    <button data-role="customer">Login as Customer</button>
    <span id="who">Not logged in</span>
    <input id="token" placeholder="Bearer token (filled after login, or paste your own)" />
    <button class="ghost" id="logout">Clear</button>
  </div>
  <div id="swagger-ui"></div>

  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    const demo = {
      manager:  { url: '/api/v1/manager/auth/login',      body: { email: 'manager@fixora.lk', password: 'Fixora@123' } },
      mechanic: { url: '/api/v1/mechanic/auth/pin-login', body: { login: 'EMP-001', pin: '1234' } },
      customer: { url: '/api/v1/customer/auth/login',     body: { email: 'kavitha@fixora.lk', password: 'Fixora@123' } }
    };
    const tokenBox = document.getElementById('token');
    const who = document.getElementById('who');

    function store(key, value) { try { value ? localStorage.setItem(key, value) : localStorage.removeItem(key); } catch {} }
    function read(key) { try { return localStorage.getItem(key) || ''; } catch { return ''; } }

    tokenBox.value = read('fixora.token');
    who.textContent = read('fixora.who') || 'Not logged in';
    tokenBox.addEventListener('input', () => store('fixora.token', tokenBox.value.trim()));

    document.querySelectorAll('[data-role]').forEach(btn => btn.addEventListener('click', async () => {
      const d = demo[btn.dataset.role];
      who.textContent = 'Logging in…';
      try {
        const res = await fetch(d.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d.body) });
        const json = await res.json();
        if (!res.ok) throw new Error(json.title || json.detail || res.status);
        tokenBox.value = json.accessToken;
        const label = `${json.role}: ${json.name}`;
        who.textContent = label;
        store('fixora.token', json.accessToken);
        store('fixora.who', label);
      } catch (e) {
        who.textContent = 'Login failed: ' + e.message;
      }
    }));

    document.getElementById('logout').addEventListener('click', () => {
      tokenBox.value = ''; who.textContent = 'Not logged in';
      store('fixora.token', ''); store('fixora.who', '');
    });

    window.ui = SwaggerUIBundle({
      url: '/openapi/v1.json',
      dom_id: '#swagger-ui',
      deepLinking: true,
      docExpansion: 'none',
      filter: true,
      tryItOutEnabled: true,
      displayRequestDuration: true,
      persistAuthorization: true,
      requestInterceptor: req => {
        const t = tokenBox.value.trim();
        if (t) req.headers['Authorization'] = 'Bearer ' + t;
        req.headers['Idempotency-Key'] = req.headers['Idempotency-Key'] || crypto.randomUUID();
        return req;
      }
    });
  </script>
</body>
</html>
""";
}
