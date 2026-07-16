import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../shared/components/Icon";
import { useI18n } from "../../shared/i18n/I18n";
import {
  abortGitOperation,
  continueGitOperation,
  getGitBranches,
  getGitConflict,
  getGitDiff,
  getGitStatus,
  initializeGitRepository,
  gitCheckoutBranch,
  gitCommit,
  gitCreateBranch,
  gitRemoteAction,
  gitStageFiles,
  gitUnstageFiles,
  resolveGitConflict,
} from "../../shared/lib/tauri";
import type { GitConflictContent, GitFileStatus, GitRepositoryStatus, Project } from "../../shared/types/models";

type GitProjectPanelProps = {
  project: Project;
  onRefreshInspection: () => Promise<unknown>;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
};

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function statusLabel(file: GitFileStatus) {
  if (file.conflicted) return "Conflict";
  if (file.untracked) return "Untracked";
  if (file.staged && file.unstaged) return "Staged + modified";
  if (file.staged) return "Staged";
  if (file.unstaged) return "Modified";
  return `${file.indexStatus}${file.workTreeStatus}`;
}

export function GitProjectPanel({ project, onRefreshInspection, onSuccess, onError }: GitProjectPanelProps) {
  const { t } = useI18n();
  const [status, setStatus] = useState<GitRepositoryStatus>();
  const [branches, setBranches] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState("");
  const [selectedPath, setSelectedPath] = useState("");
  const [diff, setDiff] = useState("");
  const [diffLoading, setDiffLoading] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [newBranch, setNewBranch] = useState("");
  const [conflict, setConflict] = useState<GitConflictContent>();
  const [resolution, setResolution] = useState("");

  const selectedFile = useMemo(
    () => status?.files.find((file) => file.path === selectedPath),
    [selectedPath, status?.files],
  );
  const conflicts = status?.files.filter((file) => file.conflicted) ?? [];
  const stagedCount = status?.files.filter((file) => file.staged && !file.conflicted).length ?? 0;

  useEffect(() => {
    void reload();
  }, [project.id, project.path]);

  async function reload(keepSelection = true) {
    setLoading(true);
    try {
      const [nextStatus, nextBranches] = await Promise.all([
        getGitStatus(project.path),
        getGitBranches(project.path),
      ]);
      setStatus(nextStatus);
      setBranches(nextBranches);
      if (!keepSelection || !nextStatus.files.some((file) => file.path === selectedPath)) {
        setSelectedPath(nextStatus.files[0]?.path ?? "");
        setDiff("");
        setConflict(undefined);
      }
      await onRefreshInspection();
    } catch (error) {
      onError(messageOf(error));
    } finally {
      setLoading(false);
    }
  }

  async function selectFile(file: GitFileStatus) {
    setSelectedPath(file.path);
    setDiffLoading(true);
    setConflict(undefined);
    setDiff("");
    try {
      if (file.conflicted) {
        const content = await getGitConflict(project.path, file.path);
        setConflict(content);
        setResolution(content.workingTree);
      } else {
        const content = await getGitDiff(project.path, file.path, file.staged && !file.unstaged);
        setDiff(content || t("Für diese Datei ist kein Text-Diff verfügbar.", "No text diff is available for this file."));
      }
    } catch (error) {
      onError(messageOf(error));
    } finally {
      setDiffLoading(false);
    }
  }

  async function runAction(key: string, action: () => Promise<unknown>, success: string) {
    setBusyAction(key);
    try {
      await action();
      onSuccess(success);
      await reload();
    } catch (error) {
      onError(messageOf(error));
      try {
        await reload();
      } catch {
        // The original Git error is the actionable message.
      }
    } finally {
      setBusyAction("");
    }
  }

  async function createBranch() {
    const branch = newBranch.trim();
    if (!branch) {
      onError(t("Gib einen Branch-Namen ein.", "Enter a branch name."));
      return;
    }
    await runAction("create-branch", () => gitCreateBranch(project.path, branch), t(`Branch ${branch} wurde erstellt.`, `Branch ${branch} was created.`));
    setNewBranch("");
  }

  async function commit() {
    const message = commitMessage.trim();
    if (!message) {
      onError(t("Gib eine Commit-Nachricht ein.", "Enter a commit message."));
      return;
    }
    await runAction("commit", () => gitCommit(project.path, message), t("Commit wurde erstellt.", "Commit created."));
    setCommitMessage("");
  }

  async function saveResolution() {
    if (!conflict || conflict.binary) return;
    if (resolution.includes("<<<<<<<") || resolution.includes("=======") || resolution.includes(">>>>>>>")) {
      const confirmed = window.confirm(t("Die Datei enthält noch Konfliktmarker. Trotzdem speichern und als gelöst markieren?", "The file still contains conflict markers. Save and mark it resolved anyway?"));
      if (!confirmed) return;
    }
    await runAction(
      `resolve:${conflict.path}`,
      () => resolveGitConflict(project.path, conflict.path, resolution),
      t(`${conflict.path} wurde gespeichert und gestaged.`, `${conflict.path} was saved and staged.`),
    );
    setConflict(undefined);
    setDiff("");
  }

  if (!project.inspection?.isGit) {
    return (
      <div className="empty-state">
        <Icon name="git" />
        <h3>{t("Kein Git-Repository erkannt", "No Git repository detected")}</h3>
        <p>{t("Initialisiere Git direkt für dieses Projekt oder klone ein Repository über „Projekt hinzufügen“.", "Initialize Git for this project or clone a repository through Add project.")}</p>
        <button
          className="button button--primary"
          type="button"
          disabled={Boolean(busyAction)}
          onClick={() => void runAction("init", () => initializeGitRepository(project.path), t("Git-Repository wurde initialisiert.", "Git repository initialized."))}
        >
          <Icon name="git" />{t("Git initialisieren", "Initialize Git")}
        </button>
      </div>
    );
  }

  return (
    <div className="git-workbench">
      <section className="panel git-toolbar-panel">
        <div className="panel__header">
          <div>
            <p className="eyebrow">Git</p>
            <h3>{status?.branch || project.inspection.branch || t("Repository", "Repository")}</h3>
          </div>
          <button className="button button--ghost button--small" type="button" onClick={() => void reload()} disabled={loading}>
            <Icon name="refresh" />{loading ? t("Lade…", "Loading…") : t("Aktualisieren", "Refresh")}
          </button>
        </div>

        <div className="git-summary-row">
          <span><strong>{status?.files.length ?? project.inspection.changedFiles}</strong>{t(" Änderungen", " changes")}</span>
          <span><strong>{stagedCount}</strong>{t(" gestaged", " staged")}</span>
          <span className={conflicts.length ? "status-warning" : "status-good"}><strong>{conflicts.length}</strong>{t(" Konflikte", " conflicts")}</span>
          {status?.upstream && <span><strong>↑{status.ahead} ↓{status.behind}</strong>{status.upstream}</span>}
        </div>

        <div className="git-action-grid">
          <div className="git-branch-controls">
            <select
              aria-label={t("Branch wechseln", "Switch branch")}
              value={status?.branch ?? ""}
              onChange={(event) => void runAction("checkout", () => gitCheckoutBranch(project.path, event.target.value), t(`Zu ${event.target.value} gewechselt.`, `Switched to ${event.target.value}.`))}
              disabled={Boolean(busyAction)}
            >
              {!branches.includes(status?.branch ?? "") && status?.branch && <option value={status.branch}>{status.branch}</option>}
              {branches.map((branch) => <option key={branch} value={branch}>{branch}</option>)}
            </select>
            <div className="input-action-row">
              <input value={newBranch} onChange={(event) => setNewBranch(event.target.value)} placeholder="feature/new-feature" />
              <button className="button button--secondary" type="button" onClick={() => void createBranch()} disabled={Boolean(busyAction)}><Icon name="plus" />{t("Branch", "Branch")}</button>
            </div>
          </div>
          <div className="button-row git-remote-actions">
            {(["fetch", "pull", "push"] as const).map((action) => (
              <button
                key={action}
                className="button button--secondary button--small"
                type="button"
                disabled={Boolean(busyAction)}
                onClick={() => void runAction(action, () => gitRemoteAction(project.path, action), t(`Git ${action} abgeschlossen.`, `Git ${action} completed.`))}
              >
                <Icon name={action === "push" ? "upload" : action === "pull" ? "download" : "refresh"} />{action[0].toUpperCase() + action.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {status?.operation && (
          <div className="git-operation-banner">
            <Icon name="info" />
            <div><strong>{t(`Aktive Git-Operation: ${status.operation}`, `Active Git operation: ${status.operation}`)}</strong><small>{conflicts.length ? t("Löse zuerst alle Konflikte.", "Resolve all conflicts first.") : t("Alle Konflikte sind gelöst. Du kannst fortfahren.", "All conflicts are resolved. You can continue.")}</small></div>
            <div className="button-row">
              <button className="button button--primary button--small" type="button" disabled={conflicts.length > 0 || Boolean(busyAction)} onClick={() => void runAction("continue", () => continueGitOperation(project.path), t("Git-Operation wurde fortgesetzt.", "Git operation continued."))}><Icon name="play" />{t("Fortsetzen", "Continue")}</button>
              <button className="button button--danger button--small" type="button" disabled={Boolean(busyAction)} onClick={() => {
                if (window.confirm(t(`Laufenden ${status.operation}-Vorgang wirklich abbrechen?`, `Abort the current ${status.operation} operation?`))) {
                  void runAction("abort", () => abortGitOperation(project.path), t("Git-Operation wurde abgebrochen.", "Git operation aborted."));
                }
              }}><Icon name="x" />{t("Abbrechen", "Abort")}</button>
            </div>
          </div>
        )}
      </section>

      <div className="git-main-grid">
        <section className="panel git-file-panel">
          <div className="panel__header"><div><p className="eyebrow">Working tree</p><h3>{t("Dateien", "Files")}</h3></div></div>
          {status?.files.length ? (
            <div className="git-file-list">
              {status.files.map((file) => (
                <button type="button" key={file.path} className={`${selectedPath === file.path ? "active" : ""} ${file.conflicted ? "conflicted" : ""}`} onClick={() => void selectFile(file)}>
                  <span><Icon name={file.conflicted ? "info" : "file"} /><strong>{file.path}</strong></span>
                  <small>{statusLabel(file)}</small>
                </button>
              ))}
            </div>
          ) : <div className="empty-state empty-state--compact"><Icon name="check" /><p>{t("Arbeitsverzeichnis ist sauber.", "Working tree is clean.")}</p></div>}
        </section>

        <section className="panel panel--wide git-diff-panel">
          <div className="panel__header">
            <div><p className="eyebrow">{selectedFile?.conflicted ? t("Konflikt lösen", "Resolve conflict") : "Diff"}</p><h3>{selectedPath || t("Datei auswählen", "Select a file")}</h3></div>
            {selectedFile && !selectedFile.conflicted && (
              <div className="button-row">
                {selectedFile.staged ? (
                  <button className="button button--ghost button--small" type="button" onClick={() => void runAction(`unstage:${selectedFile.path}`, () => gitUnstageFiles(project.path, [selectedFile.path]), t("Datei wurde aus dem Staging-Bereich entfernt.", "File was unstaged."))}><Icon name="arrow-down" />Unstage</button>
                ) : (
                  <button className="button button--primary button--small" type="button" onClick={() => void runAction(`stage:${selectedFile.path}`, () => gitStageFiles(project.path, [selectedFile.path]), t("Datei wurde gestaged.", "File was staged."))}><Icon name="arrow-up" />Stage</button>
                )}
              </div>
            )}
          </div>

          {diffLoading ? <div className="empty-state empty-state--compact"><Icon name="refresh" /><p>{t("Datei wird geladen…", "Loading file…")}</p></div> : conflict ? (
            conflict.binary ? (
              <div className="empty-state"><Icon name="info" /><h3>{t("Binärer Konflikt", "Binary conflict")}</h3><p>{t("Binäre Dateien können nicht als Text zusammengeführt werden. Öffne das Projekt in deiner IDE und stage die gewählte Version anschließend.", "Binary files cannot be merged as text. Open the project in your IDE and stage the selected version afterwards.")}</p></div>
            ) : (
              <div className="conflict-resolver">
                <div className="conflict-version-grid">
                  <label><span>{t("Aktuelle Version", "Current version")}</span><textarea value={conflict.current} readOnly spellCheck={false} /></label>
                  <label><span>{t("Eingehende Version", "Incoming version")}</span><textarea value={conflict.incoming} readOnly spellCheck={false} /></label>
                </div>
                <div className="button-row conflict-choice-row">
                  <button className="button button--secondary button--small" type="button" onClick={() => setResolution(conflict.current)}>{t("Aktuelle übernehmen", "Use current")}</button>
                  <button className="button button--secondary button--small" type="button" onClick={() => setResolution(conflict.incoming)}>{t("Eingehende übernehmen", "Use incoming")}</button>
                  <button className="button button--ghost button--small" type="button" onClick={() => setResolution(`${conflict.current}${conflict.current.endsWith("\n") || !conflict.current ? "" : "\n"}${conflict.incoming}`)}>{t("Beide übernehmen", "Use both")}</button>
                  <button className="button button--ghost button--small" type="button" onClick={() => setResolution(conflict.workingTree)}>{t("Marker wiederherstellen", "Restore markers")}</button>
                </div>
                <label className="conflict-result"><span>{t("Ergebnis", "Result")}</span><textarea value={resolution} onChange={(event) => setResolution(event.target.value)} spellCheck={false} /></label>
                <div className="form-actions"><button className="button button--primary" type="button" disabled={Boolean(busyAction)} onClick={() => void saveResolution()}><Icon name="check" />{t("Speichern und als gelöst markieren", "Save and mark resolved")}</button></div>
              </div>
            )
          ) : selectedPath ? (
            <pre className="git-diff-view">{diff || t("Datei auswählen, um den Diff zu laden.", "Select a file to load its diff.")}</pre>
          ) : <div className="empty-state"><Icon name="file" /><h3>{t("Keine Datei ausgewählt", "No file selected")}</h3><p>{t("Wähle links eine geänderte Datei aus.", "Select a changed file on the left.")}</p></div>}
        </section>
      </div>

      <section className="panel git-commit-panel">
        <div className="panel__header"><div><p className="eyebrow">Commit</p><h3>{t("Gestagte Änderungen committen", "Commit staged changes")}</h3></div><span className="badge">{stagedCount}</span></div>
        <div className="input-action-row">
          <input value={commitMessage} onChange={(event) => setCommitMessage(event.target.value)} placeholder={t("Commit-Nachricht", "Commit message")} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void commit(); } }} />
          <button className="button button--primary" type="button" onClick={() => void commit()} disabled={!stagedCount || Boolean(busyAction)}><Icon name="check" />Commit</button>
        </div>
      </section>
    </div>
  );
}
