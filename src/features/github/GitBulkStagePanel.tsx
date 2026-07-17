import { useEffect, useMemo, useState } from "react";

import { Icon } from "../../shared/components/Icon";
import { useI18n } from "../../shared/i18n/I18n";
import { getGitStatus, gitStageFiles } from "../../shared/lib/tauri";
import type { GitFileStatus, GitRepositoryStatus, Project, ProjectInspection } from "../../shared/types/models";

type GitBulkStagePanelProps = {
  project: Project;
  onRefreshInspection: () => Promise<ProjectInspection | undefined>;
  onStaged: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
};

type StagePreset = "new" | "changed" | "deleted" | "new-and-changed" | "all";

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isDeleted(file: GitFileStatus) {
  return file.indexStatus === "D" || file.workTreeStatus === "D";
}

function isStageCandidate(file: GitFileStatus) {
  return !file.conflicted && (file.untracked || file.unstaged);
}

function matchesPreset(file: GitFileStatus, preset: StagePreset) {
  if (!isStageCandidate(file)) return false;

  const deleted = isDeleted(file);
  const newlyCreated = file.untracked;
  const changed = !newlyCreated && !deleted;

  switch (preset) {
    case "new":
      return newlyCreated;
    case "changed":
      return changed;
    case "deleted":
      return deleted;
    case "new-and-changed":
      return newlyCreated || changed;
    case "all":
      return true;
  }
}

export function GitBulkStagePanel({
  project,
  onRefreshInspection,
  onStaged,
  onSuccess,
  onError,
}: GitBulkStagePanelProps) {
  const { t } = useI18n();
  const [status, setStatus] = useState<GitRepositoryStatus>();
  const [loading, setLoading] = useState(false);
  const [busyPreset, setBusyPreset] = useState<StagePreset>();

  const pathsByPreset = useMemo(() => {
    const files = status?.files ?? [];
    return {
      new: files.filter((file) => matchesPreset(file, "new")).map((file) => file.path),
      changed: files.filter((file) => matchesPreset(file, "changed")).map((file) => file.path),
      deleted: files.filter((file) => matchesPreset(file, "deleted")).map((file) => file.path),
      "new-and-changed": files
        .filter((file) => matchesPreset(file, "new-and-changed"))
        .map((file) => file.path),
      all: files.filter((file) => matchesPreset(file, "all")).map((file) => file.path),
    } satisfies Record<StagePreset, string[]>;
  }, [status?.files]);

  useEffect(() => {
    if (!project.inspection?.isGit) return;
    void reload();
  }, [project.id, project.path, project.inspection?.isGit]);

  async function reload(reportError = true) {
    setLoading(true);
    try {
      setStatus(await getGitStatus(project.path));
    } catch (error) {
      if (reportError) onError(messageOf(error));
    } finally {
      setLoading(false);
    }
  }

  async function stagePreset(preset: StagePreset) {
    const paths = pathsByPreset[preset];
    if (!paths.length) return;

    setBusyPreset(preset);
    try {
      await gitStageFiles(project.path, paths);
      await onRefreshInspection();
      await reload(false);
      onStaged();
      onSuccess(
        t(
          `${paths.length} Datei${paths.length === 1 ? "" : "en"} wurde${paths.length === 1 ? "" : "n"} gestaged.`,
          `${paths.length} file${paths.length === 1 ? "" : "s"} staged.`,
        ),
      );
    } catch (error) {
      onError(messageOf(error));
      await reload(false);
    } finally {
      setBusyPreset(undefined);
    }
  }

  if (!project.inspection?.isGit) return null;

  const presets: Array<{ preset: StagePreset; label: string; hint: string }> = [
    {
      preset: "new",
      label: t("Nur neue", "New only"),
      hint: t("Ungetrackte Dateien", "Untracked files"),
    },
    {
      preset: "changed",
      label: t("Nur geänderte", "Changed only"),
      hint: t("Geänderte, bereits getrackte Dateien", "Modified tracked files"),
    },
    {
      preset: "deleted",
      label: t("Nur gelöschte", "Deleted only"),
      hint: t("Gelöschte Dateien", "Deleted files"),
    },
    {
      preset: "new-and-changed",
      label: t("Neue + geänderte", "New + changed"),
      hint: t("Ohne gelöschte Dateien", "Excludes deleted files"),
    },
    {
      preset: "all",
      label: t("Alles", "Everything"),
      hint: t("Neue, geänderte und gelöschte Dateien", "New, changed, and deleted files"),
    },
  ];

  return (
    <section className="panel git-bulk-stage-card">
      <div className="panel__header">
        <div>
          <p className="eyebrow">Staging</p>
          <h3>{t("Dateien gesammelt auswählen", "Select files in bulk")}</h3>
        </div>
        <button
          className="button button--ghost button--small"
          type="button"
          disabled={loading || Boolean(busyPreset)}
          onClick={() => void reload()}
        >
          <Icon name="refresh" />
          {loading ? t("Lade…", "Loading…") : t("Aktualisieren", "Refresh")}
        </button>
      </div>

      <div className="git-bulk-stage-grid">
        {presets.map(({ preset, label, hint }) => {
          const count = pathsByPreset[preset].length;
          return (
            <button
              className={`git-bulk-stage-option ${preset === "all" ? "git-bulk-stage-option--primary" : ""}`}
              type="button"
              key={preset}
              disabled={!count || Boolean(busyPreset)}
              onClick={() => void stagePreset(preset)}
            >
              <span>
                <strong>{label}</strong>
                <small>{hint}</small>
              </span>
              <span className="badge">{count}</span>
            </button>
          );
        })}
      </div>

      <p className="git-bulk-stage-note">
        {t(
          "Konfliktdateien werden aus Sicherheitsgründen nicht automatisch gestaged. „Alles“ berücksichtigt auch gelöschte Dateien.",
          "Conflict files are never staged automatically. Everything also includes deleted files.",
        )}
      </p>
    </section>
  );
}
