# Architecture

Code Deck uses a React/TypeScript frontend inside Tauri 2. The frontend owns the local application model and persists it as a versioned JSON object. Rust provides the privileged, operating-system-specific layer.

## Frontend responsibilities

- Project, editor, workspace, settings and process-history state
- Search, filters, forms, dialogs and optimistic UI updates
- Import validation and migration
- Explicit confirmation of imported commands
- Subscription to process output and exit events

## Rust responsibilities

- Read-only project and package inspection
- Git command execution for status metadata
- Folder scanning
- IDE, terminal, URL and file-manager launching
- Child-process creation, stdout/stderr streaming and termination
- Reading and writing user-selected backup files

The bridge lives in `src/shared/lib/tauri.ts`; privileged functions are not called directly from feature components.
