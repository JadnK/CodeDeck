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
      icon: "layers" as const,
      eyebrow: "Willkommen",
      title: "Deine Projekte. Ein Deck.",
      text: "Code Deck bündelt lokale Entwicklungsprojekte, IDEs, Commands und Workspaces in einer schnellen Desktop-App.",
      action: "Loslegen",
      run: () => setStep(1),
    },
    {
      icon: "code" as const,
      eyebrow: "Schritt 1 von 2",
      title: "IDE konfigurieren",
      text: hasEditors
        ? "VS Code und Cursor sind bereits als Vorlagen angelegt. Du kannst sie prüfen oder weitere Editoren hinzufügen."
        : "Lege mindestens eine IDE mit einem Command-Template an, zum Beispiel code \"{projectPath}\".",
      action: hasEditors ? "Weiter" : "Einstellungen öffnen",
      run: () => hasEditors ? setStep(2) : onOpenSettings(),
    },
    {
      icon: "folder" as const,
      eyebrow: "Schritt 2 von 2",
      title: "Erstes Projekt hinzufügen",
      text: hasProjects
        ? "Dein erstes Projekt ist bereits angelegt. Du kannst Code Deck jetzt vollständig nutzen."
        : "Wähle einen lokalen Ordner. Code Deck erkennt Git, Frameworks und package.json-Scripts automatisch.",
      action: hasProjects ? "Code Deck öffnen" : "Projekt auswählen",
      run: () => hasProjects ? onComplete() : onAddProject(),
    },
  ];
  const current = steps[step];

  return (
    <Modal open={open} onClose={onComplete} size="small">
      <div className="onboarding">
        <div className="onboarding__brand"><span><Icon name="code" /></span>CODE DECK</div>
        <div className="onboarding__visual"><Icon name={current.icon} /></div>
        <p className="eyebrow">{current.eyebrow}</p>
        <h2>{current.title}</h2>
        <p>{current.text}</p>
        <div className="onboarding__dots">{steps.map((_, index) => <span key={index} className={index === step ? "active" : ""} />)}</div>
        <button className="button button--primary button--full" type="button" onClick={current.run}>{current.action}<Icon name="external" /></button>
        <button className="text-button" type="button" onClick={onComplete}>Onboarding überspringen</button>
      </div>
    </Modal>
  );
}
