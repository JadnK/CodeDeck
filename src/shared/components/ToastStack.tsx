import { useI18n } from "../i18n/I18n";
import { Icon } from "./Icon";

export type Toast = {
  id: string;
  type: "success" | "error" | "info";
  title: string;
  message?: string;
};

type ToastStackProps = {
  toasts: Toast[];
  onDismiss: (id: string) => void;
};

export function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  const { t } = useI18n();
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((toast) => (
        <article key={toast.id} className={`toast toast--${toast.type}`}>
          <div className="toast__icon">
            <Icon name={toast.type === "success" ? "check" : toast.type === "error" ? "x" : "info"} />
          </div>
          <div className="toast__content">
            <strong>{toast.title}</strong>
            {toast.message && <p>{toast.message}</p>}
          </div>
          <button type="button" className="icon-button icon-button--small" onClick={() => onDismiss(toast.id)} aria-label={t("Benachrichtigung schließen", "Dismiss notification")}>
            <Icon name="x" />
          </button>
        </article>
      ))}
    </div>
  );
}
