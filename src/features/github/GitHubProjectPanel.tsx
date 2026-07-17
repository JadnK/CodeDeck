import { useEffect, useMemo, useState } from "react";

import { Icon } from "../../shared/components/Icon";
import { useI18n } from "../../shared/i18n/I18n";
import { getGitRemoteUrl, openTarget } from "../../shared/lib/tauri";
import type { Project, ProjectInspection } from "../../shared/types/models";
import { GitProjectPanel } from "../git/GitProjectPanel";
import { GitBulkStagePanel } from "./GitBulkStagePanel";

import "./github.css";

type GitHubProjectPanelProps = {
  project: Project;
  onRefreshInspection: () => Promise<ProjectInspection | undefined>;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
};

type GitHubSection = "issues" | "pulls" | "git";

type GitHubRepository = {
  owner: string;
  name: string;
  slug: string;
  htmlUrl: string;
};

type GitHubUser = {
  login: string;
  avatar_url: string;
  html_url: string;
};

type GitHubLabel = {
  name: string;
  color: string;
};

type GitHubMilestone = {
  title: string;
  html_url: string;
};

type GitHubIssue = {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  html_url: string;
  user: GitHubUser;
  assignees: GitHubUser[];
  labels: GitHubLabel[];
  milestone: GitHubMilestone | null;
  comments: number;
  updated_at: string;
  pull_request?: unknown;
};

type GitHubPullRequest = {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  html_url: string;
  draft: boolean;
  user: GitHubUser;
  labels: GitHubLabel[];
  milestone: GitHubMilestone | null;
  updated_at: string;
  head: { ref: string };
  base: { ref: string };
};

type GitHubComment = {
  id: number;
  body: string;
  created_at: string;
  user: GitHubUser;
};

const TOKEN_STORAGE_KEY = "code-deck.github-token.session";

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function parseGitHubRepository(remoteUrl: string): GitHubRepository | undefined {
  const trimmed = remoteUrl.trim();
  let repositoryPath = "";

  const scpStyle = trimmed.match(/^git@github\.com:([^/]+)\/(.+)$/i);
  if (scpStyle) {
    repositoryPath = `${scpStyle[1]}/${scpStyle[2]}`;
  } else {
    try {
      const url = new URL(trimmed);
      if (url.hostname.toLowerCase() !== "github.com") return undefined;
      repositoryPath = url.pathname;
    } catch {
      return undefined;
    }
  }

  const parts = repositoryPath
    .replace(/^\/+|\/+$/g, "")
    .replace(/\.git$/i, "")
    .split("/")
    .filter(Boolean);

  if (parts.length < 2) return undefined;

  const owner = parts[0];
  const name = parts[1];
  return {
    owner,
    name,
    slug: `${owner}/${name}`,
    htmlUrl: `https://github.com/${owner}/${name}`,
  };
}

async function githubRequest<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/vnd.github+json");
  headers.set("X-GitHub-Api-Version", "2022-11-28");
  if (init.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`https://api.github.com${path}`, { ...init, headers });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : undefined;

  if (!response.ok) {
    const remaining = response.headers.get("x-ratelimit-remaining");
    if (response.status === 403 && remaining === "0") {
      throw new Error("GitHub API rate limit reached. Connect a token or try again later.");
    }
    throw new Error(payload?.message || `GitHub API request failed (${response.status}).`);
  }

  return payload as T;
}

export function GitHubProjectPanel({
  project,
  onRefreshInspection,
  onSuccess,
  onError,
}: GitHubProjectPanelProps) {
  const { t, language, locale } = useI18n();
  const [section, setSection] = useState<GitHubSection>("issues");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [repository, setRepository] = useState<GitHubRepository>();
  const [repositoryError, setRepositoryError] = useState("");
  const [resolvingRepository, setResolvingRepository] = useState(false);
  const [token, setToken] = useState(() =>
    typeof window === "undefined" ? "" : sessionStorage.getItem(TOKEN_STORAGE_KEY) ?? "",
  );
  const [tokenDraft, setTokenDraft] = useState(token);
  const [viewer, setViewer] = useState<GitHubUser>();
  const [issues, setIssues] = useState<GitHubIssue[]>([]);
  const [pullRequests, setPullRequests] = useState<GitHubPullRequest[]>([]);
  const [selectedIssueNumber, setSelectedIssueNumber] = useState<number>();
  const [comments, setComments] = useState<GitHubComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [gitRefreshKey, setGitRefreshKey] = useState(0);

  const selectedIssue = useMemo(
    () => issues.find((issue) => issue.number === selectedIssueNumber),
    [issues, selectedIssueNumber],
  );

  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));

  useEffect(() => {
    let cancelled = false;

    async function resolveRepository() {
      setResolvingRepository(true);
      setRepository(undefined);
      setRepositoryError("");
      setRemoteUrl("");
      setIssues([]);
      setPullRequests([]);
      setSelectedIssueNumber(undefined);
      setComments([]);

      try {
        const remote = await getGitRemoteUrl(project.path);
        if (cancelled) return;

        if (!remote) {
          setRepositoryError(
            t(
              "Für dieses Repository wurde kein Git-Remote gefunden.",
              "No Git remote was found for this repository.",
            ),
          );
          return;
        }

        setRemoteUrl(remote);
        const parsed = parseGitHubRepository(remote);
        if (!parsed) {
          setRepositoryError(
            t(
              "Der Git-Remote gehört nicht zu github.com. GitLab und andere Anbieter werden aktuell nicht unterstützt.",
              "The Git remote does not point to github.com. GitLab and other providers are not supported yet.",
            ),
          );
          return;
        }

        setRepository(parsed);
      } catch (error) {
        if (!cancelled) setRepositoryError(messageOf(error));
      } finally {
        if (!cancelled) setResolvingRepository(false);
      }
    }

    void resolveRepository();
    return () => {
      cancelled = true;
    };
  }, [project.id, project.path, language]);

  useEffect(() => {
    if (!repository) return;
    void reloadGitHub(repository);
  }, [repository?.slug, token]);

  useEffect(() => {
    if (!repository || !selectedIssueNumber) {
      setComments([]);
      return;
    }
    void loadComments(repository, selectedIssueNumber);
  }, [repository?.slug, selectedIssueNumber, token]);

  async function reloadGitHub(targetRepository = repository) {
    if (!targetRepository) return;

    setLoading(true);
    setApiError("");
    try {
      const authenticatedUser = token
        ? await githubRequest<GitHubUser>("/user", token)
        : undefined;
      setViewer(authenticatedUser);

      const assignee = authenticatedUser
        ? `&assignee=${encodeURIComponent(authenticatedUser.login)}`
        : "";
      const [nextIssues, nextPullRequests] = await Promise.all([
        githubRequest<GitHubIssue[]>(
          `/repos/${targetRepository.slug}/issues?state=all&sort=updated&direction=desc&per_page=100${assignee}`,
          token,
        ),
        githubRequest<GitHubPullRequest[]>(
          `/repos/${targetRepository.slug}/pulls?state=open&sort=updated&direction=desc&per_page=100`,
          token,
        ),
      ]);

      const actualIssues = nextIssues.filter((issue) => !issue.pull_request);
      setIssues(actualIssues);
      setPullRequests(nextPullRequests);
      setSelectedIssueNumber((current) =>
        actualIssues.some((issue) => issue.number === current)
          ? current
          : actualIssues[0]?.number,
      );
    } catch (error) {
      const message = messageOf(error);
      setApiError(message);
      setViewer(undefined);
      onError(message);
    } finally {
      setLoading(false);
    }
  }

  async function loadComments(targetRepository: GitHubRepository, issueNumber: number) {
    setCommentsLoading(true);
    try {
      const nextComments = await githubRequest<GitHubComment[]>(
        `/repos/${targetRepository.slug}/issues/${issueNumber}/comments?per_page=100`,
        token,
      );
      setComments(nextComments);
    } catch (error) {
      onError(messageOf(error));
    } finally {
      setCommentsLoading(false);
    }
  }

  async function openInBrowser(url: string) {
    try {
      await openTarget(url);
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  function saveToken(event: React.FormEvent) {
    event.preventDefault();
    const nextToken = tokenDraft.trim();
    if (nextToken) sessionStorage.setItem(TOKEN_STORAGE_KEY, nextToken);
    else sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(nextToken);
  }

  function disconnectToken() {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken("");
    setTokenDraft("");
    setViewer(undefined);
  }

  async function toggleIssueState(issue: GitHubIssue) {
    if (!repository || !token) {
      onError(t("Verbinde zuerst einen GitHub-Token.", "Connect a GitHub token first."));
      return;
    }

    const nextState = issue.state === "open" ? "closed" : "open";
    setBusyAction(`state:${issue.number}`);
    try {
      await githubRequest<GitHubIssue>(
        `/repos/${repository.slug}/issues/${issue.number}`,
        token,
        { method: "PATCH", body: JSON.stringify({ state: nextState }) },
      );
      onSuccess(
        nextState === "closed"
          ? t(`Issue #${issue.number} wurde geschlossen.`, `Issue #${issue.number} was closed.`)
          : t(`Issue #${issue.number} wurde wieder geöffnet.`, `Issue #${issue.number} was reopened.`),
      );
      await reloadGitHub();
    } catch (error) {
      onError(messageOf(error));
    } finally {
      setBusyAction("");
    }
  }

  async function addComment(event: React.FormEvent) {
    event.preventDefault();
    if (!repository || !selectedIssue || !token) {
      onError(t("Verbinde zuerst einen GitHub-Token.", "Connect a GitHub token first."));
      return;
    }

    const body = commentDraft.trim();
    if (!body) {
      onError(t("Der Kommentar darf nicht leer sein.", "The comment must not be empty."));
      return;
    }

    setBusyAction(`comment:${selectedIssue.number}`);
    try {
      await githubRequest<GitHubComment>(
        `/repos/${repository.slug}/issues/${selectedIssue.number}/comments`,
        token,
        { method: "POST", body: JSON.stringify({ body }) },
      );
      setCommentDraft("");
      onSuccess(t("Kommentar wurde veröffentlicht.", "Comment posted."));
      await loadComments(repository, selectedIssue.number);
      await reloadGitHub();
    } catch (error) {
      onError(messageOf(error));
    } finally {
      setBusyAction("");
    }
  }

  if (resolvingRepository) {
    return (
      <div className="panel empty-state">
        <Icon name="refresh" />
        <h3>{t("GitHub-Repository wird erkannt…", "Detecting GitHub repository…")}</h3>
      </div>
    );
  }

  if (!repository) {
    return (
      <div className="github-project-panel">
        <section className="panel empty-state">
          <Icon name="git" />
          <h3>{t("Keine GitHub-Verknüpfung erkannt", "No GitHub link detected")}</h3>
          <p>{repositoryError}</p>
          {remoteUrl && <code>{remoteUrl}</code>}
        </section>
        <GitBulkStagePanel
          project={project}
          onRefreshInspection={onRefreshInspection}
          onStaged={() => setGitRefreshKey((value) => value + 1)}
          onSuccess={onSuccess}
          onError={onError}
        />
        <GitProjectPanel
          key={gitRefreshKey}
          project={project}
          onRefreshInspection={onRefreshInspection}
          onSuccess={onSuccess}
          onError={onError}
        />
      </div>
    );
  }

  return (
    <div className="github-project-panel">
      <section className="panel github-repository-card">
        <div className="github-repository-card__identity">
          <div className="github-repository-card__icon"><Icon name="git" /></div>
          <div>
            <p className="eyebrow">GitHub</p>
            <h3>{repository.slug}</h3>
            <code>{remoteUrl}</code>
          </div>
        </div>
        <div className="github-repository-card__actions">
          {viewer && (
            <span className="github-viewer">
              <img src={viewer.avatar_url} alt="" />
              @{viewer.login}
            </span>
          )}
          <button className="button button--secondary button--small" type="button" onClick={() => void openInBrowser(repository.htmlUrl)}>
            <Icon name="external" />{t("Repository öffnen", "Open repository")}
          </button>
          <button className="button button--ghost button--small" type="button" disabled={loading} onClick={() => void reloadGitHub()}>
            <Icon name="refresh" />{loading ? t("Lade…", "Loading…") : t("Aktualisieren", "Refresh")}
          </button>
        </div>
      </section>

      <section className="panel github-auth-card">
        <div>
          <strong>{viewer ? t("GitHub verbunden", "GitHub connected") : t("Optional: GitHub verbinden", "Optional: connect GitHub")}</strong>
          <p>
            {viewer
              ? t("Es werden deine zugewiesenen Issues angezeigt. Statusänderungen und Kommentare sind aktiviert.", "Your assigned issues are shown. State changes and comments are enabled.")
              : t("Ohne Token zeigt Code Deck alle Repository-Issues und Pull Requests nur lesend an.", "Without a token, Code Deck shows all repository issues and pull requests in read-only mode.")}
          </p>
        </div>
        <form onSubmit={saveToken} className="github-token-form">
          <input
            type="password"
            autoComplete="off"
            value={tokenDraft}
            onChange={(event) => setTokenDraft(event.target.value)}
            placeholder="github_pat_…"
            aria-label={t("GitHub Personal Access Token", "GitHub personal access token")}
          />
          <button className="button button--secondary button--small" type="submit">
            <Icon name="check" />{viewer ? t("Token aktualisieren", "Update token") : t("Verbinden", "Connect")}
          </button>
          {token && (
            <button className="button button--ghost button--small" type="button" onClick={disconnectToken}>
              {t("Trennen", "Disconnect")}
            </button>
          )}
        </form>
        <small>{t("Der Token bleibt nur für die aktuelle App-Sitzung gespeichert und wird nicht exportiert.", "The token is kept only for the current app session and is not exported.")}</small>
        <small>{t("Empfohlen für Fine-grained Tokens: Repository-Metadaten lesen, Issues lesen/schreiben und Pull Requests lesen.", "Recommended fine-grained token permissions: read repository metadata, read/write issues, and read pull requests.")}</small>
      </section>

      <nav className="github-subtabs" aria-label={t("GitHub-Bereiche", "GitHub sections")}>
        <button className={section === "issues" ? "active" : ""} type="button" onClick={() => setSection("issues")}>
          {t("Issues", "Issues")}<span>{issues.length}</span>
        </button>
        <button className={section === "pulls" ? "active" : ""} type="button" onClick={() => setSection("pulls")}>
          {t("Pull Requests", "Pull requests")}<span>{pullRequests.length}</span>
        </button>
        <button className={section === "git" ? "active" : ""} type="button" onClick={() => setSection("git")}>
          {t("Git-Arbeitsbereich", "Git workbench")}
        </button>
      </nav>

      {apiError && <div className="notice notice--danger"><Icon name="info" /><p>{apiError}</p></div>}

      {section === "issues" && (
        <div className="github-issue-layout">
          <aside className="panel github-item-list">
            <div className="panel__header">
              <div>
                <p className="eyebrow">Issues</p>
                <h3>{viewer ? t("Mir zugewiesen", "Assigned to me") : t("Repository-Issues", "Repository issues")}</h3>
              </div>
              <span className="badge">{issues.length}</span>
            </div>
            {loading ? (
              <div className="empty-state empty-state--compact"><Icon name="refresh" /><p>{t("Issues werden geladen…", "Loading issues…")}</p></div>
            ) : issues.length ? (
              <div className="github-item-list__items">
                {issues.map((issue) => (
                  <button
                    type="button"
                    className={issue.number === selectedIssueNumber ? "active" : ""}
                    onClick={() => setSelectedIssueNumber(issue.number)}
                    key={issue.number}
                  >
                    <span className={`github-state-dot github-state-dot--${issue.state}`} />
                    <span>
                      <strong>{issue.title}</strong>
                      <small>#{issue.number} · {formatDate(issue.updated_at)}</small>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="empty-state empty-state--compact"><Icon name="check" /><p>{t("Keine passenden Issues gefunden.", "No matching issues found.")}</p></div>
            )}
          </aside>

          <section className="panel github-issue-detail">
            {selectedIssue ? (
              <>
                <div className="github-issue-detail__header">
                  <div>
                    <div className="badge-row">
                      <span className={`badge github-state-badge github-state-badge--${selectedIssue.state}`}>{selectedIssue.state}</span>
                      <span className="badge">#{selectedIssue.number}</span>
                      {selectedIssue.milestone && <span className="badge">{selectedIssue.milestone.title}</span>}
                    </div>
                    <h3>{selectedIssue.title}</h3>
                    <p>{t("Erstellt von", "Created by")} @{selectedIssue.user.login} · {formatDate(selectedIssue.updated_at)}</p>
                  </div>
                  <div className="button-row">
                    <button className="button button--secondary button--small" type="button" onClick={() => void openInBrowser(selectedIssue.html_url)}>
                      <Icon name="external" />GitHub
                    </button>
                    <button
                      className="button button--ghost button--small"
                      type="button"
                      disabled={!token || Boolean(busyAction)}
                      onClick={() => void toggleIssueState(selectedIssue)}
                    >
                      {selectedIssue.state === "open" ? t("Schließen", "Close") : t("Wieder öffnen", "Reopen")}
                    </button>
                  </div>
                </div>

                <div className="github-meta-row">
                  <div>
                    <span>{t("Zugewiesen", "Assignees")}</span>
                    <strong>{selectedIssue.assignees.map((assignee) => `@${assignee.login}`).join(", ") || "–"}</strong>
                  </div>
                  <div>
                    <span>{t("Kommentare", "Comments")}</span>
                    <strong>{selectedIssue.comments}</strong>
                  </div>
                </div>

                {selectedIssue.labels.length > 0 && (
                  <div className="github-label-row">
                    {selectedIssue.labels.map((label) => (
                      <span
                        key={label.name}
                        style={{ borderColor: `#${label.color}66`, background: `#${label.color}1f` }}
                      >
                        {label.name}
                      </span>
                    ))}
                  </div>
                )}

                <div className="github-issue-body">
                  <pre>{selectedIssue.body || t("Keine Beschreibung vorhanden.", "No description provided.")}</pre>
                </div>

                <div className="github-comments">
                  <div className="panel__header">
                    <div><p className="eyebrow">Discussion</p><h3>{t("Kommentare", "Comments")}</h3></div>
                  </div>
                  {commentsLoading ? (
                    <p className="muted-text">{t("Kommentare werden geladen…", "Loading comments…")}</p>
                  ) : comments.length ? (
                    comments.map((comment) => (
                      <article key={comment.id}>
                        <header>
                          <span><img src={comment.user.avatar_url} alt="" />@{comment.user.login}</span>
                          <small>{formatDate(comment.created_at)}</small>
                        </header>
                        <pre>{comment.body}</pre>
                      </article>
                    ))
                  ) : (
                    <p className="muted-text">{t("Noch keine Kommentare.", "No comments yet.")}</p>
                  )}
                </div>

                <form className="github-comment-form" onSubmit={addComment}>
                  <textarea
                    rows={4}
                    value={commentDraft}
                    onChange={(event) => setCommentDraft(event.target.value)}
                    placeholder={token ? t("Kommentar hinzufügen…", "Add a comment…") : t("Für Kommentare GitHub verbinden.", "Connect GitHub to comment.")}
                    disabled={!token}
                  />
                  <div className="form-actions">
                    <button className="button button--primary" type="submit" disabled={!token || !commentDraft.trim() || Boolean(busyAction)}>
                      <Icon name="upload" />{t("Kommentar veröffentlichen", "Post comment")}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <div className="empty-state"><Icon name="list" /><h3>{t("Issue auswählen", "Select an issue")}</h3><p>{t("Wähle links ein Issue aus, um Details und Kommentare zu sehen.", "Select an issue on the left to view details and comments.")}</p></div>
            )}
          </section>
        </div>
      )}

      {section === "pulls" && (
        <section className="panel github-pull-panel">
          <div className="panel__header">
            <div><p className="eyebrow">Pull Requests</p><h3>{t("Offene Pull Requests", "Open pull requests")}</h3></div>
            <span className="badge">{pullRequests.length}</span>
          </div>
          {loading ? (
            <div className="empty-state"><Icon name="refresh" /><p>{t("Pull Requests werden geladen…", "Loading pull requests…")}</p></div>
          ) : pullRequests.length ? (
            <div className="github-pull-list">
              {pullRequests.map((pullRequest) => (
                <button type="button" key={pullRequest.number} onClick={() => void openInBrowser(pullRequest.html_url)}>
                  <span className="github-state-dot github-state-dot--open" />
                  <span className="github-pull-list__content">
                    <span className="badge-row">
                      {pullRequest.draft && <span className="badge">Draft</span>}
                      {pullRequest.milestone && <span className="badge">{pullRequest.milestone.title}</span>}
                    </span>
                    <strong>{pullRequest.title}</strong>
                    <small>#{pullRequest.number} · @{pullRequest.user.login} · {pullRequest.head.ref} → {pullRequest.base.ref}</small>
                  </span>
                  <span className="github-pull-list__date">{formatDate(pullRequest.updated_at)}</span>
                  <Icon name="external" />
                </button>
              ))}
            </div>
          ) : (
            <div className="empty-state"><Icon name="check" /><h3>{t("Keine offenen Pull Requests", "No open pull requests")}</h3></div>
          )}
        </section>
      )}

      {section === "git" && (
        <>
          <GitBulkStagePanel
            project={project}
            onRefreshInspection={onRefreshInspection}
            onStaged={() => setGitRefreshKey((value) => value + 1)}
            onSuccess={onSuccess}
            onError={onError}
          />
          <GitProjectPanel
            key={gitRefreshKey}
            project={project}
            onRefreshInspection={onRefreshInspection}
            onSuccess={onSuccess}
            onError={onError}
          />
        </>
      )}
    </div>
  );
}
