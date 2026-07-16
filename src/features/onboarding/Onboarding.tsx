import { useState } from "react";
import { Icon } from "../../shared/components/Icon";
import { Modal } from "../../shared/components/Modal";
import { useI18n } from "../../shared/i18n/I18n";

type OnboardingProps = {
  open: boolean;
  hasEditors: boolean;
  hasProjects: boolean;
  onAddProject: () => void;
  onOpenSettings: () => void;
  onComplete: () => void;
};

export function Onboarding({
  open,
  hasEditors,
  hasProjects,
  onAddProject,
  onOpenSettings,
  onComplete,
}: OnboardingProps) {
  const [step, setStep] = useState(0);
  const { t } = useI18n();
  const steps = [
    {
      title: t("Willkommen bei CodeDeck", "Welcome to CodeDeck"),
      text: t(
        "Verwalte lokale Projekte, öffne sie in der passenden IDE und starte wiederkehrende Commands an einem Ort.",
        "Manage local projects, open them in the right IDE and run recurring commands from one place.",
      ),
      action: t("Einrichtung starten", "Start setup"),
      run: () => setStep(1),
    },
    {
      title: t("IDE prüfen", "Check your IDE"),
      text: hasEditors
        ? t(
            "Mindestens eine IDE ist bereits eingerichtet. Du kannst die Einträge später jederzeit in den Einstellungen ändern.",
            "At least one IDE is already configured. You can change the entries later in Settings.",
          )
        : t(
            'Lege eine IDE mit einem Command-Template an, zum Beispiel code "{projectPath}".',
            'Add an IDE with a command template, for example code "{projectPath}".',
          ),
      action: hasEditors ? t("Weiter", "Continue") : t("Einstellungen öffnen", "Open settings"),
      run: () => hasEditors ? setStep(2) : onOpenSettings(),
    },
    {
      title: t("Projekt hinzufügen", "Add a project"),
      text: hasProjects
        ? t("Ein Projekt ist bereits vorhanden. Die Einrichtung ist abgeschlossen.", "A project already exists. Setup is complete.")
        : t(
            "Füge einen vorhandenen Ordner hinzu oder erstelle ein Grundgerüst für Node.js, React, Spring Boot, Python oder Rust.",
            "Add an existing folder or create a starter for Node.js, React, Spring Boot, Python or Rust.",
          ),
      action: hasProjects ? t("CodeDeck öffnen", "Open CodeDeck") : t("Projekt hinzufügen", "Add project"),
      run: () => hasProjects ? onComplete() : onAddProject(),
    },
  ];
  const current = steps[step];

  return (
    <Modal open={open} onClose={onComplete} size="small">
      <div className="onboarding">
        <div className="onboarding__brand">
          <img src="/icon.png" alt="" />
          <div><strong>CodeDeck</strong><span>{t("Ersteinrichtung", "First-time setup")}</span></div>
        </div>
        <div className="onboarding__progress" aria-label={t(`Schritt ${step + 1} von ${steps.length}`, `Step ${step + 1} of ${steps.length}`)}>
          {steps.map((_, index) => <span key={index} className={index <= step ? "active" : ""} />)}
        </div>
        <p className="onboarding__step">{t(`Schritt ${step + 1} von ${steps.length}`, `Step ${step + 1} of ${steps.length}`)}</p>
        <h2>{current.title}</h2>
        <p className="onboarding__text">{current.text}</p>
        <div className="onboarding__actions">
          <button className="button button--primary button--full" type="button" onClick={current.run}>
            <span>{current.action}</span>
            <Icon name="external" />
          </button>
          <button className="text-button" type="button" onClick={onComplete}>{t("Überspringen", "Skip")}</button>
        </div>
      </div>
    </Modal>
  );
}
