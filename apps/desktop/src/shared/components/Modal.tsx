import { useEffect, type ReactNode } from "react";
import { Icon } from "./Icon";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  eyebrow?: string;
  size?: "small" | "medium" | "large" | "fullscreen";
  children: ReactNode;
  footer?: ReactNode;
  closeLabel?: string;
};

export function Modal({
  open,
  onClose,
  title,
  eyebrow,
  size = "medium",
  children,
  footer,
  closeLabel = "Schließen",
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className={`modal modal--${size}`}
        role="dialog"
        aria-modal="true"
        aria-label={title ?? closeLabel}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {(title || eyebrow) && (
          <header className="modal__header">
            <div>
              {eyebrow && <p className="eyebrow">{eyebrow}</p>}
              {title && <h2>{title}</h2>}
            </div>
            <button className="icon-button" type="button" onClick={onClose} aria-label={closeLabel}>
              <Icon name="x" />
            </button>
          </header>
        )}
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__footer">{footer}</footer>}
      </section>
    </div>
  );
}
