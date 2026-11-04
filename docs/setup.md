# Setup

Everything runs as one Docker Compose project (`doc-assistant`): `proxy` (Caddy, serves the web app and forwards `/api`), `api`, `worker`, `db` (Postgres 16 + pgvector). Ollama is optional and comes in a later wave.

## Requirements

- Docker with Compose v2, `git`, `make` (optional; every `make` target is a one-line command in the `Makefile`).
- Home Wi-Fi only, plain HTTP. Do not expose the port to the internet.

## First start

```sh
git clone <repo> doc-assistant && cd doc-assistant
cp infra/.env.example infra/.env
```

Edit `infra/.env`:

- `POSTGRES_PASSWORD`: choose a long random password.
- `FERNET_KEY`: encrypts provider API keys later. Generate it once and keep it (a lost key makes stored API keys unreadable):
  `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`
- `PROXY_PORT` (default 8080), `DB_PORT` (default 5433, localhost only), `OLLAMA_URL`.

Then:

```sh
make up              # builds and starts everything
make create-admin    # asks for username, display name and password of the first admin
```

Open `http://<server-ip>:8080`, log in, and create the household accounts under "Benutzer".

### Server steps (W0.1, done by hand on the mini PC)

- Allow the port from the LAN only: `sudo ufw allow from 192.168.1.0/24 to any port 8080 proto tcp`.
- Decide about Ollama: share the recipe app's (set `OLLAMA_URL`, e.g. `http://host.docker.internal:11434`) or start your own with `docker compose -f infra/docker-compose.yml --env-file infra/.env --profile ollama up -d`.
- Check from a phone on Wi-Fi: `http://<server-ip>:8080/api/health` shows `{"db":true,"worker":true,...}`. `ollama` is `false` until Ollama runs.

## Backup, restore, update

```sh
make backup                      # backups/<timestamp>/db.dump + files.tar
make restore DIR=backups/<name>  # replaces database and files with that backup
make update                      # backup, git pull, rebuild, restart (migrations run on start)
```

Keep copies of `backups/` and of `infra/.env` (especially `FERNET_KEY`) off the server.

## Development

```sh
make check                       # lint, types, Storybook build (api and web)
cd apps/web && npm start         # dev server on :4200, forwards /api to http://127.0.0.1:8080
cd apps/web && npm run storybook # component workshop
make gen-api                     # regenerate TypeScript API types after backend changes
```

`npm start` needs the Compose stack running (`make up`). If your `PROXY_PORT` is not 8080, change the target in `apps/web/proxy.conf.json`.
