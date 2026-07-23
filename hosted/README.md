# CodeDeck Hosted

CodeDeck Hosted is an additional Docker-based web edition. It does **not** replace or modify the Tauri desktop application. The desktop app continues to use `src/` and `src-tauri/`; the hosted edition lives entirely under `hosted/` and uses a browser UI plus a Node.js server backend.

## Install on a Linux server

```bash
git clone https://github.com/JadnK/CodeDeck.git
cd CodeDeck
./hosted/setup.sh /srv/projects
```

The setup script generates `hosted/.env`, binds the service to `127.0.0.1:8080`, and starts the container. Open it through an SSH tunnel:

```bash
ssh -L 8080:127.0.0.1:8080 user@server
```

Then browse to `http://127.0.0.1:8080` and enter the token from `hosted/.env`.

## Manual setup

```bash
cp hosted/.env.example hosted/.env
# Edit CODEDECK_PROJECTS_PATH and CODEDECK_WEB_TOKEN.
docker compose --env-file hosted/.env -f hosted/compose.yml up -d --build
```

Update a published installation:

```bash
docker compose --env-file hosted/.env -f hosted/compose.yml pull
docker compose --env-file hosted/.env -f hosted/compose.yml up -d --remove-orphans
```

Use `ghcr.io/jadnk/codedeck-web:edge` in `hosted/.env` to follow every push to `main`; use `latest` for stable tagged releases.

## What is shared with the desktop app?

The data format is compatible with CodeDeck's `AppData` model, so JSON exports can be moved between editions. The runtime backend is intentionally separate:

- Desktop native functions: Rust/Tauri under `src-tauri/`
- Hosted functions: Node.js under `hosted/server/`

A change to shared data structures or browser-independent UI concepts may need equivalent changes in both editions. A Rust-only change does not automatically alter the hosted server.

## Security model

- A long bearer token is required by default.
- The service binds to localhost by default.
- Project paths are restricted to the mounted `/projects` root and symlink escapes are rejected.
- The container runs as an unprivileged user, drops Linux capabilities, uses a read-only root filesystem, and does not mount the Docker socket.
- Commands execute inside the container and can modify mounted project files. Only run trusted commands.
- Do not expose port 8080 directly to the public internet. Put CodeDeck behind HTTPS and preferably a VPN or identity-aware proxy.

## Toolchains

The default image includes Node.js, Git, SSH, Python 3, and common build tools. Rust, Java, Docker CLI, or project-specific dependencies are not included. Extend `hosted/Dockerfile` for additional server-side toolchains.

## Development and tests

```bash
node --test hosted/server/*.test.mjs
CODEDECK_WEB_TOKEN=dev-token \
CODEDECK_PROJECTS_ROOT="$HOME/projects" \
CODEDECK_DATA_DIR="$(pwd)/.codedeck-hosted-data" \
node hosted/server/index.mjs
```
