import { useEffect, useState } from "react";
import { Icon } from "../../shared/components/Icon";
import { Modal } from "../../shared/components/Modal";
import { chooseDirectory, scanProjects } from "../../shared/lib/tauri";
import type { ProjectCandidate } from "../../shared/types/models";

type ProjectScanModalProps = {
  open: boolean;
  defaultProjectDir: string;
  existingPaths: string[];
  onClose: () => void;
  onChooseCandidate: (candidate: ProjectCandidate) => void;
  onError: (message: string) => void;
};

export function ProjectScanModal({
  open,
  defaultProjectDir,
  existingPaths,
  onClose,
  onChooseCandidate,
  onError,
}: ProjectScanModalProps) {
  const [basePath, setBasePath] = useState(defaultProjectDir);
  const [candidates, setCandidates] = useState<ProjectCandidate[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBasePath(defaultProjectDir);
    setCandidates([]);
  }, [open, defaultProjectDir]);

  async function browse() {
    try {
      const selected = await chooseDirectory(basePath);
      if (selected) setBasePath(selected);
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  }

  async function scan() {
    if (!basePath.trim()) {
      onError("Bitte wähle zuerst einen Basisordner aus.");
      return;
    }
    setLoading(true);
    try {
      setCandidates(await scanProjects(basePath.trim()));
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Projektordner scannen" eyebrow="Automatische Erkennung" size="large">
      <div className="scan-modal">
        <div className="scan-controls">
          <div className="form-field"><label htmlFor="scan-path">Basisordner</label><div className="input-action-row"><input id="scan-path" value={basePath} onChange={(event) => setBasePath(event.target.value)} placeholder="C:\\Users\\du\\Projects" /><button className="button button--secondary" type="button" onClick={browse}><Icon name="folder" />Wählen</button><button className="button button--primary" type="button" onClick={scan} disabled={loading}><Icon name="search" />{loading ? "Scanne…" : "Scannen"}</button></div></div>
        </div>
        <div className="notice"><Icon name="info" /><p>Code Deck liest nur Ordnernamen und typische Projektmarker wie .git, package.json, Cargo.toml oder pyproject.toml. Projektdateien werden nicht verändert.</p></div>
        {candidates.length ? (
          <div className="candidate-list">
            {candidates.map((candidate) => {
              const exists = existingPaths.some((path) => path.toLowerCase() === candidate.path.toLowerCase());
              return (
                <article key={candidate.path}>
                  <span className="candidate-list__icon"><Icon name="folder" /></span>
                  <div><strong>{candidate.name}</strong><code>{candidate.path}</code><div className="badge-row">{candidate.markers.map((marker) => <span className="badge badge--muted" key={marker}>{marker}</span>)}</div></div>
                  <button className="button button--secondary button--small" type="button" disabled={exists} onClick={() => onChooseCandidate(candidate)}><Icon name={exists ? "check" : "plus"} />{exists ? "Bereits vorhanden" : "Hinzufügen"}</button>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state"><Icon name="search" /><h3>{loading ? "Projekte werden gesucht…" : "Noch nicht gescannt"}</h3><p>Wähle einen Basisordner und starte den Scan.</p></div>
        )}
      </div>
    </Modal>
  );
}
