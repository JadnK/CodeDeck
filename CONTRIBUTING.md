# Contributing

1. Create a branch named `feature/<short-name>` or `fix/<short-name>`.
2. Run `pnpm build` before opening a pull request.
3. Run `cargo check` in `src-tauri` when changing Rust code.
4. Keep desktop actions explicit and never auto-run imported commands.
5. Update the README or changelog when user-visible behavior changes.

A feature is complete when errors are handled, empty/loading states exist, local data survives a restart and the affected workflow has been smoke-tested.
