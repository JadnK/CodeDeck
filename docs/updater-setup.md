# In-app updater setup

CodeDeck uses Tauri's signed updater and GitHub Releases. The public verification key is committed in `src-tauri/tauri.conf.json`. The private signing key must never be committed.

## One-time GitHub setup

Open the repository and go to:

```text
Settings → Secrets and variables → Actions → New repository secret
```

Create these secrets:

| Secret | Value |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | Complete contents of the generated private key file |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password belonging to that private key |

Keep an offline backup of both values. Losing the key or password prevents future releases from updating existing installations.

## Publishing an update

1. Increase the same version in `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`.
2. Update `CHANGELOG.md`.
3. Commit and push the changes.
4. Create and push a matching tag, for example `v0.2.3`.
5. Let the Release workflow finish.
6. Publish the generated draft release.

The workflow uploads normal installers, signed updater bundles, signature files and `latest.json`. The app only sees a new update after the GitHub Release has been published.

## Testing

Version `0.2.2` is the first CodeDeck build containing the updater. Install it manually once. To test the update flow, publish a higher version such as `0.2.3`, then start `0.2.2` again.
