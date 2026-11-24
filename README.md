# Action Review

A team action register with the Modernist design system and database-backed web and desktop modes. It tracks issues, owners, due dates, RACI, comments, and closure. Excel and PDF exports support A4 portrait and landscape. The report can include the filtered view or the whole connected register.

| Where you work | What stores the register |
| --- | --- |
| Web on one computer | SQLite on the web server |
| Web or desktop across a team | One Action Review server backed by SQLite, PostgreSQL in Docker, or managed PostgreSQL |
| Desktop offline | SQLite in Tauri's OS-specific application data directory |

Remote mode connects to the Action Review API. Configure database credentials on the server. Web and desktop use the same register when connected to the same API. Local desktop storage is a separate register. Use **Backup → Download backup** and **Restore backup** to copy data between registers or import a JSON backup from the previous HTML version. Restore replaces the connected register.

## Web

Requires Node.js 24 or later. From the repository root:

```sh
npm ci
npm test
npm run build
npm start
```

Open http://127.0.0.1:8787. By default this creates `data/action-review.sqlite`. For development, run `npm run api` and `npm run dev` in separate terminals and use port 5173.

### Docker on a team machine

1. Copy `.env.example` to `.env`. Generate two distinct values with `openssl rand -hex 32` and assign them to `ACTION_REVIEW_KEY` and `POSTGRES_PASSWORD`.
2. Run `docker compose up -d --build`. PostgreSQL data lives in the named `pgdata` volume. The database port is internal to the Compose network.
3. Terminate HTTPS with a reverse proxy forwarding to the web service on port 8787. The Compose port is bound to loopback on the host. For a proxy in its own container, attach it to the same Docker network and forward to `web:8787`.
4. In the web app, choose **Connect storage** and enter the access key. In Tauri, choose **Storage → Remote server** and enter the HTTPS origin and the same access key.

For example, Caddy running on the server host can terminate TLS with:

```caddyfile
review.example.com {
    reverse_proxy 127.0.0.1:8787
}
```

For a LAN-only name, use local DNS and a certificate trusted by each client machine.

The shared key grants access to the entire register, including edits and restore. This deployment model is for one trusted team. Choose a fresh key before enabling remote access, keep the server behind HTTPS, and share the key through your team's password manager. Concurrent edits use revision checks. If another person saves first, reload the register before retrying your change.

### Managed PostgreSQL, including Supabase

Run the Action Review server with `DATABASE_URL` set to the provider's PostgreSQL connection string. Supabase users can copy the direct connection or the session pooler string from the Connect panel. Percent-encode special characters in the password portion of the URL. Use `sslmode=verify-full` and set `PG_CA_FILE` to the provider CA certificate if required. The server creates the `action_review_register` table on first startup. Assign the database role enough permission to create and update that table. Set `ACTION_REVIEW_KEY` and expose the server through HTTPS as above.

`sslmode=disable` is intended for a local, isolated database network such as the included Compose example.

## Tauri desktop

Install the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) for the build machine, including Rust and the target OS's webview and packaging tools.

```sh
npm ci
npm run tauri -- dev
npm run tauri -- build
```

Installers are generated under `src-tauri/target/release/bundle`. The **Desktop installers** GitHub Actions workflow builds unsigned Windows, macOS, and Linux artifacts on demand once the repository has been pushed. Public distribution may require platform signing and notarisation.

On first launch the desktop app uses its local SQLite register. Use **Storage** to switch to a remote server. Desktop remembers the server origin and mode. The key stays in memory and is requested again after an app restart or a full browser reload. Remote connections accept HTTPS origins or HTTP on localhost. PDF and Excel downloads use the native save dialog. Print downloaded PDFs with your system PDF viewer.
