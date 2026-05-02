# Local API

Flamingo exposes a localhost-only control surface on the same port as the browser bridge.

- Base URL: `http://127.0.0.1:16789/api`
- Auth header: `X-Token: <browser bridge token>`
- Scope setting: `read`, `add`, `control`

Endpoints:

- `GET /health`
- `GET /stats`
- `GET /tasks?status=active&limit=50&offset=0`
- `GET /tasks/:id`
- `POST /tasks`
- `POST /tasks/:id/actions`

Example `POST /tasks`:

```json
{
  "url": "https://example.com/file.iso",
  "save_dir": "D:/Downloads",
  "category": "images"
}
```

Example `POST /tasks/:id/actions`:

```json
{
  "action": "pause"
}
```

Supported actions:

- `pause`
- `resume`
- `retry`
- `remove`
- `open_dir`
- `open_file`
- `set_category`
