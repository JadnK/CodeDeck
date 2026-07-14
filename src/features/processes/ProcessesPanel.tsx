import { useMemo, useState } from "react";
import { Icon } from "../../shared/components/Icon";
import { Modal } from "../../shared/components/Modal";
import type { ProcessRun, Project } from "../../shared/types/models";

type ProcessesPanelProps = {
  open: boolean;
  processes: ProcessRun[];
  projects: Project[];
  onClose: () => void;
  onStop: (process: ProcessRun) => void;
  onClearFinished: () => void;
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

export function ProcessesPanel({
  open,
  processes,
  projects,
  onClose,
  onStop,
  onClearFinished,
}: ProcessesPanelProps) {
  const [expanded, setExpanded] = useState<string>();
  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const active = processes.filter((process) => ["starting", "running", "stopping"].includes(process.status));
  const finished = processes.filter((process) => !["starting", "running", "stopping"].includes(process.status));

  return (
    <Modal open={open} onClose={onClose} title={`Prozesse · ${active.length} aktiv`} size="large">
      <div className="processes-panel">
        {processes.length === 0 ? (
          <div className="empty-state"><Icon name="terminal" /><h3>Keine Prozesse</h3><p>Gestartete Commands erscheinen hier mit Live-Logs und Stop-Funktion.</p></div>
        ) : (
          <>
            {active.length > 0 && <p className="section-label">Läuft gerade</p>}
            <div className="process-list">
              {[...active, ...finished].map((process) => {
                const isActive = ["starting", "running", "stopping"].includes(process.status);
                const isExpanded = expanded === process.id;
                return (
                  <article className="process-card" key={process.id}>
                    <button className="process-card__summary" type="button" onClick={() => setExpanded(isExpanded ? undefined : process.id)}>
                      <span className={`process-dot process-dot--${process.status}`} />
                      <span className="process-card__title"><strong>{process.label}</strong><small>{process.projectId ? projectById.get(process.projectId)?.name ?? "Unbekanntes Projekt" : "System"}</small></span>
                      <code>{process.command}</code>
                      <span className="process-card__meta"><b>{process.status}</b><small>{formatTime(process.startedAt)}</small></span>
                      <Icon name="chevron-down" className={isExpanded ? "rotated" : ""} />
                    </button>
                    {isExpanded && (
                      <div className="process-card__details">
                        <div className="terminal-output">
                          {process.logs.length ? process.logs.map((line, index) => <div key={`${process.id}-${index}`}>{line}</div>) : <div className="terminal-output__muted">Noch keine Ausgabe…</div>}
                        </div>
                        <div className="process-card__footer">
                          <span>PID: {process.pid ?? "–"}</span>
                          {process.exitCode !== undefined && <span>Exit-Code: {process.exitCode}</span>}
                          {isActive && <button className="button button--danger button--small" type="button" onClick={() => onStop(process)} disabled={!process.pid || process.status === "stopping"}><Icon name="square" />{process.status === "stopping" ? "Wird beendet…" : "Stoppen"}</button>}
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
            {finished.length > 0 && <div className="form-actions"><button className="button button--ghost" type="button" onClick={onClearFinished}><Icon name="trash" />Abgeschlossene Historie leeren</button></div>}
          </>
        )}
      </div>
    </Modal>
  );
}
