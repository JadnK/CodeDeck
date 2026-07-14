import { useState } from "react";
import { Icon } from "../../shared/components/Icon";
import { Modal } from "../../shared/components/Modal";

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
  const steps = [
    {
      title: "Willkommen bei CodeDeck",
      text: "Verwalte lokale Projekte, öffne sie in der passenden IDE und starte wiederkehrende Commands an einem Ort.",
      action: "Einrichtung starten",
      run: () => setStep(1),
    },
    {
      title: "IDE prüfen",
      text: hasEditors
        ? "Mindestens eine IDE ist bereits eingerichtet. Du kannst die Einträge später jederzeit in den Einstellungen ändern."
        : "Lege eine IDE mit einem Command-Template an, zum Beispiel code \"{projectPath}\".",
      action: hasEditors ? "Weiter" : "Einstellungen öffnen",
      run: () => hasEditors ? setStep(2) : onOpenSettings(),
    },
    {
      title: "Projekt hinzufügen",
      text: hasProjects
        ? "Ein Projekt ist bereits vorhanden. Die Einrichtung ist abgeschlossen."
        : "Füge einen vorhandenen Ordner hinzu oder erstelle ein Grundgerüst für Node.js, React, Spring Boot, Python oder Rust.",
      action: hasProjects ? "CodeDeck öffnen" : "Projekt hinzufügen",
      run: () => hasProjects ? onComplete() : onAddProject(),
    },
  ];
  const current = steps[step];

  return (
    <Modal open={open} onClose={onComplete} size="small">
      <div className="onboarding">
        <div className="onboarding__brand">
          <img src="/icon.png" alt="" />
          <div><strong>CodeDeck</strong><span>Ersteinrichtung</span></div>
        </div>
        <div className="onboarding__progress" aria-label={`Schritt ${step + 1} von ${steps.length}`}>
          {steps.map((_, index) => <span key={index} className={index <= step ? "active" : ""} />)}
        </div>
        <p className="onboarding__step">Schritt {step + 1} von {steps.length}</p>
        <h2>{current.title}</h2>
        <p className="onboarding__text">{current.text}</p>
        <div className="onboarding__actions">
          <button className="button button--primary button--full" type="button" onClick={current.run}>
            <span>{current.action}</span>
            <Icon name="external" />
          </button>
          <button className="text-button" type="button" onClick={onComplete}>Überspringen</button>
        </div>
      </div>
    </Modal>
  );
}
