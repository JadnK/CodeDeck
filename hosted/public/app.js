const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const state = {
  token: localStorage.getItem("codedeck-hosted-token") || sessionStorage.getItem("codedeck-hosted-token") || "",
  data: null,
  runtime: null,
  root: "/projects",
  selectedProjectId: null,
  selectedTech: new Set(),
  activeRuns: new Map(),
  scanCandidates: [],
};

function authHeaders(extra = {}) {
  return { authorization: `Bearer ${state.token}`, ...extra };
}

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: authHeaders(options.headers || {}) });
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) throw new Error(body?.error || body || `Request failed with ${response.status}`);
  return body;
}

async function invoke(command, args = {}) {
  const body = await api("/api/invoke", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ command, args }),
  });
  return body.result;
}

function toast(message, type = "info") {
  const element = document.createElement("div");
  element.className = `toast ${type}`;
  element.textContent = message;
  $("#toast-region").append(element);
  setTimeout(() => element.remove(), 4200);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function projectTechnologies(project) {
  const inspection = project.inspection || {};
  return [...new Set([...(inspection.languages || []), ...(inspection.frameworks || []), ...(inspection.tools || [])])].filter(Boolean);
}

function normalizeData(input) {
  const data = input && typeof input === "object" ? structuredClone(input) : {};
  data.version = "1";
  data.projects = Array.isArray(data.projects) ? data.projects : [];
  data.editors = Array.isArray(data.editors) ? data.editors : [];
  data.projectTemplates = Array.isArray(data.projectTemplates) ? data.projectTemplates : [];
  data.workspaces = Array.isArray(data.workspaces) ? data.workspaces : [];
  data.processHistory = Array.isArray(data.processHistory) ? data.processHistory : [];
  data.settings = { theme: "dark", language: "en", onboardingComplete: true, ...(data.settings || {}) };
  for (const project of data.projects) {
    project.id ||= uid();
    project.name ||= project.path?.split(/[\\/]/).filter(Boolean).pop() || "Project";
    project.description ||= "";
    project.favorite = Boolean(project.favorite);
    project.archived = Boolean(project.archived);
    project.commands = Array.isArray(project.commands) ? project.commands : [];
    project.todos = Array.isArray(project.todos) ? project.todos : [];
    project.createdAt ||= now();
    project.updatedAt ||= now();
  }
  return data;
}

async function saveData() {
  await api("/api/data", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(state.data),
  });
}

async function loadApp() {
  state.runtime = await fetch("/api/runtime").then((response) => response.json());
  state.data = normalizeData(await api("/api/data"));
  const listing = await api("/api/fs/list");
  state.root = listing.root;
  $("#projects-root").textContent = listing.root;
  $("#runtime-version").textContent = state.runtime.version || "Hosted";
  $("#scan-path").value = listing.root;
  $("#add-path").value = listing.root;
  renderAll();
  connectEvents().catch((error) => toast(`Live events disconnected: ${error.message}`, "error"));
}

function showLogin(error = "") {
  $("#login").hidden = false;
  $("#app").hidden = true;
  $("#login-error").textContent = error;
  $("#token").value = state.token;
}

function showApp() {
  $("#login").hidden = true;
  $("#app").hidden = false;
}

async function authenticate(token, remember) {
  state.token = token.trim();
  await api("/api/auth/verify", { method: "POST" });
  localStorage.removeItem("codedeck-hosted-token");
  sessionStorage.removeItem("codedeck-hosted-token");
  (remember ? localStorage : sessionStorage).setItem("codedeck-hosted-token", state.token);
  showApp();
  await loadApp();
}

function setView(name) {
  $$(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === name));
  $$(".view").forEach((view) => view.classList.toggle("active", view.id === `${name}-view`));
  $("#page-title").textContent = name[0].toUpperCase() + name.slice(1);
  const projectActionsVisible = name === "projects";
  $("#scan-open").hidden = !projectActionsVisible;
  $("#add-open").hidden = !projectActionsVisible;
  if (name === "processes") renderProcesses();
}

function visibleProjects() {
  const query = $("#search").value.trim().toLowerCase();
  const favoritesOnly = $("#favorites-only").checked;
  return state.data.projects
    .filter((project) => !project.archived)
    .filter((project) => !favoritesOnly || project.favorite)
    .filter((project) => {
      const haystack = [project.name, project.path, project.description, ...projectTechnologies(project)].join(" ").toLowerCase();
      return !query || haystack.includes(query);
    })
    .filter((project) => {
      const technologies = new Set(projectTechnologies(project).map((item) => item.toLowerCase()));
      return [...state.selectedTech].every((item) => technologies.has(item.toLowerCase()));
    })
    .sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name, undefined, { numeric: true }));
}

function renderTechnologyFilter() {
  const counts = new Map();
  for (const project of state.data.projects.filter((item) => !item.archived)) {
    for (const technology of projectTechnologies(project)) counts.set(technology, (counts.get(technology) || 0) + 1);
  }
  const technologies = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  $("#technology-filter").innerHTML = technologies.map(([technology, count]) => `
    <button class="pill ${state.selectedTech.has(technology) ? "active" : ""}" data-tech="${escapeHtml(technology)}">${escapeHtml(technology)} · ${count}</button>
  `).join("");
}

function renderProjects() {
  renderTechnologyFilter();
  const projects = visibleProjects();
  $("#project-empty").hidden = state.data.projects.length > 0;
  $("#project-list").innerHTML = projects.map((project) => {
    const technologies = projectTechnologies(project).slice(0, 5);
    return `
      <button class="project-card ${project.id === state.selectedProjectId ? "selected" : ""}" data-project-id="${escapeHtml(project.id)}">
        <div class="card-head"><h3>${escapeHtml(project.name)}</h3><span class="favorite">${project.favorite ? "★" : ""}</span></div>
        <p title="${escapeHtml(project.path)}">${escapeHtml(project.path)}</p>
        <div class="tech-list">${technologies.map((technology) => `<span class="tech">${escapeHtml(technology)}</span>`).join("") || '<span class="tech">Not inspected</span>'}</div>
      </button>`;
  }).join("");
}

function selectedProject() {
  return state.data.projects.find((project) => project.id === state.selectedProjectId);
}

function renderDetails() {
  const project = selectedProject();
  if (!project) {
    $("#details").innerHTML = `<div class="details-placeholder"><div class="placeholder-icon">⌘</div><h2>Select a project</h2><p>Inspect technologies, run saved commands, and view Git status.</p></div>`;
    return;
  }
  const inspection = project.inspection;
  const technologies = projectTechnologies(project);
  const savedCommands = project.commands || [];
  const detectedScripts = inspection?.scripts || [];
  $("#details").innerHTML = `
    <div class="detail-content">
      <div class="detail-header">
        <div><p class="eyebrow">PROJECT</p><h2>${escapeHtml(project.name)}</h2></div>
        <div class="detail-actions">
          <button class="icon-button" data-detail-action="favorite" title="Favorite">${project.favorite ? "★" : "☆"}</button>
          <button class="icon-button danger" data-detail-action="archive" title="Archive">×</button>
        </div>
      </div>
      <p class="muted">${escapeHtml(project.description || "No description")}</p>
      <dl class="meta-list"><div><dt>Path</dt><dd>${escapeHtml(project.path)}</dd></div><div><dt>Git</dt><dd>${inspection?.isGit ? escapeHtml(inspection.branch || "Repository") : "Not detected"}</dd></div></dl>
      <div class="tech-list">${technologies.map((technology) => `<span class="tech">${escapeHtml(technology)}</span>`).join("")}</div>
      <div class="button-row"><button class="secondary" data-detail-action="inspect">Refresh inspection</button><button class="secondary" data-detail-action="git">Git status</button></div>
      <section class="section">
        <h3>Saved commands</h3>
        ${savedCommands.map((command) => commandRow(command.label, command.command, `saved:${command.id}`, true)).join("") || '<p class="muted">No saved commands.</p>'}
        <form id="command-form" class="inline-form"><input id="command-label" placeholder="Label" required /><input id="command-value" placeholder="npm run dev" required /><button class="primary" type="submit">Save</button></form>
      </section>
      <section class="section">
        <h3>Detected scripts</h3>
        ${detectedScripts.map((script) => commandRow(script.name, script.command, `detected:${script.name}`)).join("") || '<p class="muted">Inspect the project to detect package scripts.</p>'}
      </section>
      <section id="git-section" class="section"><h3>Git</h3><p class="muted">Use Git status to load repository details.</p></section>
    </div>`;
}

function commandRow(label, command, key, removable = false) {
  return `<div class="command-row"><div><strong>${escapeHtml(label)}</strong><code>${escapeHtml(command)}</code></div><div class="button-row"><button class="primary compact" data-run-command="${escapeHtml(key)}">Run</button>${removable ? `<button class="ghost compact danger" data-remove-command="${escapeHtml(key.slice(6))}">Delete</button>` : ""}</div></div>`;
}

function renderGit(status) {
  const section = $("#git-section");
  if (!section) return;
  const files = status.files || [];
  section.innerHTML = `<h3>Git · ${escapeHtml(status.branch || "detached HEAD")}</h3>
    <p class="muted">${status.upstream ? `${escapeHtml(status.upstream)} · ${status.ahead} ahead · ${status.behind} behind` : "No upstream configured"}</p>
    ${files.slice(0, 25).map((file) => `<div class="git-row"><span>${escapeHtml(file.path)}</span><code>${escapeHtml(`${file.indexStatus}${file.workTreeStatus}`)}</code></div>`).join("") || '<p class="muted">Working tree clean.</p>'}
    ${files.length > 25 ? `<p class="muted">${files.length - 25} more files…</p>` : ""}`;
}

function renderProcesses() {
  const runs = [...state.activeRuns.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  $("#process-count").textContent = String(runs.filter((run) => run.status === "running").length);
  $("#process-empty").hidden = runs.length > 0;
  $("#process-list").innerHTML = runs.map((run) => `
    <article class="process-card">
      <div class="process-head"><div><strong>${escapeHtml(run.label)}</strong><p class="muted">${escapeHtml(run.projectName)} · <code>${escapeHtml(run.command)}</code></p></div><span class="status ${escapeHtml(run.status)}">${escapeHtml(run.status)}</span></div>
      <pre class="logs">${run.logs.map((line) => `<span class="${line.stream === "stderr" ? "log-err" : ""}">${escapeHtml(line.line)}</span>`).join("\n")}</pre>
      ${run.status === "running" ? `<div><button class="ghost danger" data-stop-run="${escapeHtml(run.id)}">Stop process</button></div>` : ""}
    </article>`).join("");
}

function renderAll() {
  renderProjects();
  renderDetails();
  renderProcesses();
}

async function inspectAndSave(project, silent = false) {
  const inspection = await invoke("inspect_project", { path: project.path });
  project.inspection = inspection;
  project.updatedAt = now();
  await saveData();
  renderAll();
  if (!silent) toast(`Inspected ${project.name}`);
  return inspection;
}

async function addProject({ path, name, description = "", inspection }) {
  const existing = state.data.projects.find((project) => project.path === path);
  if (existing) throw new Error("This folder is already in CodeDeck.");
  const project = {
    id: uid(), name: name || path.split(/[\\/]/).filter(Boolean).pop() || "Project", path, description,
    favorite: false, archived: false, commands: [], todos: [], createdAt: now(), updatedAt: now(), inspection,
  };
  state.data.projects.push(project);
  await saveData();
  state.selectedProjectId = project.id;
  renderAll();
  return project;
}

async function openFolderBrowser(path = state.root) {
  const listing = await api(`/api/fs/list?path=${encodeURIComponent(path)}`);
  $("#add-path").value = listing.current;
  const entries = [];
  if (listing.parent) entries.push(`<button type="button" class="folder-entry" data-folder="${escapeHtml(listing.parent)}"><strong>↰</strong><span>Parent folder</span></button>`);
  entries.push(...listing.entries.map((entry) => `<button type="button" class="folder-entry" data-folder="${escapeHtml(entry.path)}"><strong>▸</strong><span>${escapeHtml(entry.name)}</span></button>`));
  $("#folder-browser").innerHTML = entries.join("") || '<p class="muted" style="padding:.8rem">No subfolders.</p>';
}

async function runCommand(project, label, command, workingDir = "", env = {}) {
  const id = uid();
  const run = { id, projectId: project.id, projectName: project.name, label, command, status: "running", startedAt: now(), logs: [] };
  state.activeRuns.set(id, run);
  renderProcesses();
  try {
    const result = await invoke("start_process", { runId: id, projectPath: project.path, workingDir, command, env });
    run.pid = result.pid;
    toast(`Started ${label}`);
  } catch (error) {
    run.status = "failed";
    run.logs.push({ stream: "stderr", line: error.message });
    renderProcesses();
    throw error;
  }
}

async function connectEvents() {
  const response = await fetch("/api/events", { headers: authHeaders() });
  if (!response.ok || !response.body) throw new Error(`Event stream returned ${response.status}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let separator;
    while ((separator = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, separator);
      buffer = buffer.slice(separator + 2);
      let event = "message";
      let data = "";
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!data) continue;
      const payload = JSON.parse(data);
      const run = state.activeRuns.get(payload.runId);
      if (!run) continue;
      if (event === "process-output") {
        run.logs.push({ stream: payload.stream, line: payload.line });
        if (run.logs.length > 500) run.logs.shift();
      } else if (event === "process-exit") {
        run.status = payload.success ? "success" : "failed";
        run.exitCode = payload.exitCode;
        run.endedAt = now();
        toast(`${run.label} ${payload.success ? "finished" : "failed"}`, payload.success ? "info" : "error");
      }
      renderProcesses();
    }
  }
}

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("#login-error").textContent = "";
  try {
    await authenticate($("#token").value, $("#remember-token").checked);
  } catch (error) {
    showLogin(error.message);
  }
});

$("#logout").addEventListener("click", () => {
  localStorage.removeItem("codedeck-hosted-token");
  sessionStorage.removeItem("codedeck-hosted-token");
  state.token = "";
  location.reload();
});

$("nav").addEventListener("click", (event) => {
  const button = event.target.closest("[data-view]");
  if (button) setView(button.dataset.view);
});

$("#search").addEventListener("input", renderProjects);
$("#favorites-only").addEventListener("change", renderProjects);
$("#technology-filter").addEventListener("click", (event) => {
  const button = event.target.closest("[data-tech]");
  if (!button) return;
  const technology = button.dataset.tech;
  state.selectedTech.has(technology) ? state.selectedTech.delete(technology) : state.selectedTech.add(technology);
  renderProjects();
});

$("#project-list").addEventListener("click", (event) => {
  const card = event.target.closest("[data-project-id]");
  if (!card) return;
  state.selectedProjectId = card.dataset.projectId;
  renderAll();
});

$("#project-empty").addEventListener("click", (event) => {
  if (event.target.closest('[data-action="empty-add"]')) $("#add-open").click();
});

$("#add-open").addEventListener("click", async () => {
  $("#add-error").textContent = "";
  $("#add-dialog").showModal();
  await openFolderBrowser(state.root).catch((error) => { $("#add-error").textContent = error.message; });
});

$("#folder-browser").addEventListener("click", async (event) => {
  const entry = event.target.closest("[data-folder]");
  if (!entry) return;
  await openFolderBrowser(entry.dataset.folder).catch((error) => { $("#add-error").textContent = error.message; });
});

$("#add-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("#add-error").textContent = "";
  try {
    const path = $("#add-path").value.trim();
    const inspection = await invoke("inspect_project", { path });
    await addProject({ path, name: $("#add-name").value.trim(), description: $("#add-description").value.trim(), inspection });
    $("#add-dialog").close();
    event.target.reset();
    toast("Project added");
  } catch (error) {
    $("#add-error").textContent = error.message;
  }
});

$("#scan-open").addEventListener("click", () => {
  $("#scan-dialog").showModal();
  $("#scan-error").textContent = "";
});

$("#scan-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("#scan-error").textContent = "";
  $("#scan-results").innerHTML = '<p class="muted" style="padding:.8rem">Scanning…</p>';
  try {
    state.scanCandidates = await invoke("scan_projects", { path: $("#scan-path").value.trim() });
    const existing = new Set(state.data.projects.map((project) => project.path));
    $("#scan-results").innerHTML = state.scanCandidates.map((candidate, index) => `<label class="scan-entry"><input type="checkbox" data-scan-index="${index}" ${existing.has(candidate.path) ? "disabled" : ""} /><span><strong>${escapeHtml(candidate.name)}</strong><br><small class="muted">${escapeHtml(candidate.path)}</small></span></label>`).join("") || '<p class="muted" style="padding:.8rem">No projects found.</p>';
    $("#scan-add-selected").disabled = true;
  } catch (error) {
    $("#scan-error").textContent = error.message;
  }
});

$("#scan-results").addEventListener("change", () => {
  $("#scan-add-selected").disabled = $$("[data-scan-index]:checked").length === 0;
});

$("#scan-add-selected").addEventListener("click", async () => {
  const selected = $$("[data-scan-index]:checked").map((input) => state.scanCandidates[Number(input.dataset.scanIndex)]);
  try {
    for (const candidate of selected) {
      const inspection = await invoke("inspect_project", { path: candidate.path });
      await addProject({ path: candidate.path, name: candidate.name, inspection });
    }
    $("#scan-dialog").close();
    toast(`Added ${selected.length} project${selected.length === 1 ? "" : "s"}`);
  } catch (error) {
    $("#scan-error").textContent = error.message;
  }
});

$("#details").addEventListener("click", async (event) => {
  const project = selectedProject();
  if (!project) return;
  const action = event.target.closest("[data-detail-action]")?.dataset.detailAction;
  try {
    if (action === "favorite") {
      project.favorite = !project.favorite; project.updatedAt = now(); await saveData(); renderAll();
    } else if (action === "archive") {
      if (!confirm(`Archive ${project.name}?`)) return;
      project.archived = true; project.updatedAt = now(); state.selectedProjectId = null; await saveData(); renderAll();
    } else if (action === "inspect") {
      await inspectAndSave(project);
    } else if (action === "git") {
      const status = await invoke("git_status", { projectPath: project.path }); renderGit(status);
    }

    const runButton = event.target.closest("[data-run-command]");
    if (runButton) {
      const [type, id] = runButton.dataset.runCommand.split(":");
      const command = type === "saved" ? project.commands.find((item) => item.id === id) : project.inspection?.scripts?.find((item) => item.name === id);
      if (command) await runCommand(project, command.label || command.name, command.command, command.workingDir, command.env || {});
    }

    const removeButton = event.target.closest("[data-remove-command]");
    if (removeButton) {
      project.commands = project.commands.filter((command) => command.id !== removeButton.dataset.removeCommand);
      project.updatedAt = now(); await saveData(); renderDetails();
    }
  } catch (error) { toast(error.message, "error"); }
});

$("#details").addEventListener("submit", async (event) => {
  if (event.target.id !== "command-form") return;
  event.preventDefault();
  const project = selectedProject();
  if (!project) return;
  project.commands.push({ id: uid(), label: $("#command-label").value.trim(), command: $("#command-value").value.trim(), workingDir: "", env: {}, trusted: true });
  project.updatedAt = now();
  await saveData();
  renderDetails();
  toast("Command saved");
});

$("#process-list").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-stop-run]");
  if (!button) return;
  const run = state.activeRuns.get(button.dataset.stopRun);
  if (!run?.pid) return;
  try { await invoke("stop_process", { pid: run.pid }); run.status = "stopping"; renderProcesses(); } catch (error) { toast(error.message, "error"); }
});

$("#export-data").addEventListener("click", () => {
  const blob = new Blob([`${JSON.stringify(state.data, null, 2)}\n`], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `codedeck-hosted-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
});

$("#import-data").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const imported = normalizeData(JSON.parse(await file.text()));
    if (!confirm(`Replace the hosted configuration with ${imported.projects.length} project(s)?`)) return;
    state.data = imported; state.selectedProjectId = null; await saveData(); renderAll(); toast("Configuration imported");
  } catch (error) { toast(`Import failed: ${error.message}`, "error"); }
  event.target.value = "";
});

$$('[data-close]').forEach((button) => button.addEventListener("click", () => $(`#${button.dataset.close}`).close()));

(async () => {
  if (!state.token) return showLogin();
  try { showApp(); await loadApp(); }
  catch (error) { showLogin(error.message); }
})();
