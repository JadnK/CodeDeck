#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/hosted/.env"
COMPOSE_FILE="$ROOT_DIR/hosted/compose.yml"
PROJECTS_PATH="${1:-}"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required: https://docs.docker.com/engine/install/" >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2 is required." >&2
  exit 1
fi
if [[ -z "$PROJECTS_PATH" ]]; then
  read -r -p "Absolute projects path on this server: " PROJECTS_PATH
fi
if [[ ! -d "$PROJECTS_PATH" ]]; then
  echo "Directory does not exist: $PROJECTS_PATH" >&2
  exit 1
fi
PROJECTS_PATH="$(cd "$PROJECTS_PATH" && pwd)"

if [[ -f "$ENV_FILE" ]]; then
  echo "$ENV_FILE already exists; keeping it unchanged."
else
  if command -v openssl >/dev/null 2>&1; then
    TOKEN="$(openssl rand -hex 32)"
  else
    TOKEN="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  fi
  cat > "$ENV_FILE" <<ENV
CODEDECK_PROJECTS_PATH=$PROJECTS_PATH
CODEDECK_WEB_TOKEN=$TOKEN
CODEDECK_BIND_ADDRESS=127.0.0.1
CODEDECK_PORT=8080
CODEDECK_IMAGE=ghcr.io/jadnk/codedeck-web:latest
ENV
  chmod 600 "$ENV_FILE"
  echo "Created $ENV_FILE"
fi

cd "$ROOT_DIR"
if ! docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" pull; then
  echo "Published image unavailable; building the hosted edition locally."
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build
fi
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --remove-orphans

echo
echo "CodeDeck Hosted is running at http://127.0.0.1:8080"
echo "Access it remotely through HTTPS, a VPN, or an SSH tunnel:"
echo "  ssh -L 8080:127.0.0.1:8080 user@server"
echo
echo "The access token is stored in: $ENV_FILE"
