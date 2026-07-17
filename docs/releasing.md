# Releasing CodeDeck

CodeDeck uses `package.json` as the canonical application version. The release script copies that version to Tauri and Cargo, refreshes `Cargo.lock`, creates release documentation, runs the project checks, commits the result and creates an annotated Git tag.

## Commit messages

Release notes are generated from commits since the latest reachable `vX.Y.Z` tag. Use Conventional Commit prefixes so entries are grouped correctly:

```text
feat(github): add assigned issue filters
fix(git): include deleted files in bulk staging
refactor(projects): simplify repository loading
security: validate imported command paths
```

`feat` entries are placed under **Added**, `fix` entries under **Fixed**, `security` entries under **Security**, and the remaining commit types under **Changed**.

## Prepare a release

Start from a clean and fully synchronized `main` branch:

```powershell
git switch main
git pull --ff-only origin main
pnpm release 1.2.3
```

The command performs these actions:

1. checks that `main` is clean and matches `origin/main`;
2. validates the requested semantic version and existing Git tags;
3. updates `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`;
4. refreshes `src-tauri/Cargo.lock` through Cargo;
5. updates `CHANGELOG.md` from commits since the previous version;
6. creates `RELEASE_NOTES_v1.2.3.md`;
7. runs the frontend build, Rust formatting check, Clippy and Rust tests;
8. creates the release commit and annotated `v1.2.3` tag.

The command does not push by default. Review the generated commit and then push both references atomically:

```powershell
git show --stat --oneline HEAD
git push --atomic origin main v1.2.3
```

To push immediately after all checks pass:

```powershell
pnpm release 1.2.3 --push
```

Pushing the tag starts the existing GitHub release workflow and creates the release draft.

## Version consistency check

Run this locally at any time:

```powershell
pnpm version:check
```

CI runs the same check and fails when `package.json`, Tauri, Cargo or `Cargo.lock` disagree.

`--skip-checks` exists for diagnosing the script, but it should not be used for a real release.
