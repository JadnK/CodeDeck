import { Icon } from "../../shared/components/Icon";
import { Modal } from "../../shared/components/Modal";
import { useI18n } from "../../shared/i18n/I18n";
import type {
  AvailableAppUpdate,
  UpdateProgress,
} from "../../shared/lib/updater";

type UpdateModalProps = {
  open: boolean;
  update?: AvailableAppUpdate;
  installing: boolean;
  progress?: UpdateProgress;
  error?: string;
  onClose: () => void;
  onInstall: () => void;
};

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function UpdateModal({
  open,
  update,
  installing,
  progress,
  error,
  onClose,
  onInstall,
}: UpdateModalProps) {
  const { t } = useI18n();

  if (!update) return null;

  const progressText = progress?.phase === "installing"
    ? t("Update wird installiert…", "Installing update…")
    : progress?.total
      ? `${formatBytes(progress.downloaded)} / ${formatBytes(progress.total)}`
      : progress
        ? `${formatBytes(progress.downloaded)} ${t("geladen", "downloaded")}`
        : "";

  return (
    <Modal
      open={open}
      onClose={installing ? () => undefined : onClose}
      title={t("Neue CodeDeck-Version verfügbar", "A new CodeDeck version is available")}
      size="small"
      closeLabel={t("Später aktualisieren", "Update later")}
      footer={
        <>
          <button
            className="button button--ghost"
            type="button"
            onClick={onClose}
            disabled={installing}
          >
            {t("Später", "Later")}
          </button>
          <button
            className="button button--primary"
            type="button"
            onClick={onInstall}
            disabled={installing}
          >
            <Icon name={installing ? "refresh" : "download"} />
            {installing
              ? t("Update läuft…", "Updating…")
              : t("Jetzt aktualisieren", "Update now")}
          </button>
        </>
      }
    >
      <div className="update-dialog">
        <div className="update-dialog__version">
          <img src="/icon.png" alt="" />
          <div>
            <span>{t("Installiert", "Installed")} {update.currentVersion}</span>
            <strong>{t("Verfügbar", "Available")} {update.version}</strong>
          </div>
        </div>

        <p className="update-dialog__summary">
          {t(
            "Das Update wird direkt von den signierten GitHub-Release-Artefakten geladen und anschließend installiert.",
            "The update is downloaded directly from the signed GitHub release artifacts and then installed.",
          )}
        </p>

        {update.body && (
          <div className="update-dialog__notes">
            <strong>{t("Änderungen", "What changed")}</strong>
            <pre>{update.body}</pre>
          </div>
        )}

        {installing && (
          <div className="update-progress" aria-live="polite">
            <div className="update-progress__track">
              <span style={{ width: `${progress?.percent ?? 12}%` }} />
            </div>
            <small>{progressText}</small>
          </div>
        )}

        {error && (
          <div className="update-dialog__error">
            <Icon name="info" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </Modal>
  );
}
