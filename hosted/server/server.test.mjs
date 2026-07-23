import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

const token = "integration-test-token";
let temporaryRoot;
let projectsRoot;
let serverProcess;
let baseUrl;
let serverLogs = "";

async function availablePort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.unref();
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", () => {
      const address = socket.address();
      const port = typeof address === "object" && address ? address.port : undefined;
      socket.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForHealth(url) {
  let lastError;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${url}/api/health`);
      if (response.ok) return;
      lastError = new Error(`Health endpoint returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`CodeDeck test server did not start: ${lastError?.message ?? "unknown error"}\n${serverLogs}`);
}

function authorizedHeaders(extra = {}) {
  return { authorization: `Bearer ${token}`, ...extra };
}

before(async () => {
  temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "codedeck-server-test-"));
  projectsRoot = path.join(temporaryRoot, "projects");
  const dataRoot = path.join(temporaryRoot, "data");
  const publicRoot = path.join(temporaryRoot, "public");
  const demoRoot = path.join(projectsRoot, "demo");
  await mkdir(demoRoot, { recursive: true });
  await mkdir(dataRoot, { recursive: true });
  await mkdir(publicRoot, { recursive: true });
  await writeFile(path.join(publicRoot, "index.html"), "<!doctype html><title>CodeDeck test</title>\n");
  await writeFile(path.join(demoRoot, "package.json"), JSON.stringify({
    name: "demo",
    scripts: { hello: "node -e \"console.log('hello')\"" },
    dependencies: { react: "19.1.0" },
    devDependencies: { vite: "7.0.4" },
  }));
  await writeFile(path.join(demoRoot, "index.js"), "console.log('demo');\n");

  const port = await availablePort();
  baseUrl = `http://127.0.0.1:${port}`;
  serverProcess = spawn(process.execPath, ["hosted/server/index.mjs"], {
    cwd: path.resolve("."),
    env: {
      ...process.env,
      CODEDECK_WEB_HOST: "127.0.0.1",
      CODEDECK_WEB_PORT: String(port),
      CODEDECK_WEB_TOKEN: token,
      CODEDECK_PROJECTS_ROOT: projectsRoot,
      CODEDECK_DATA_DIR: dataRoot,
      CODEDECK_WEB_ROOT: publicRoot,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  serverProcess.stdout.on("data", (chunk) => { serverLogs += chunk; });
  serverProcess.stderr.on("data", (chunk) => { serverLogs += chunk; });
  await waitForHealth(baseUrl);
});

after(async () => {
  if (serverProcess && serverProcess.exitCode === null) {
    const exited = new Promise((resolve) => serverProcess.once("exit", resolve));
    serverProcess.kill("SIGTERM");
    await Promise.race([
      exited,
      new Promise((resolve) => setTimeout(resolve, 2_000)),
    ]);
    if (serverProcess.exitCode === null) serverProcess.kill("SIGKILL");
  }
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
});

test("hosted API requires a bearer token and persists configuration", async () => {
  const unauthorized = await fetch(`${baseUrl}/api/data`);
  assert.equal(unauthorized.status, 401);

  const initial = await fetch(`${baseUrl}/api/data`, { headers: authorizedHeaders() });
  assert.equal(initial.status, 200);
  assert.equal((await initial.json()).version, "1");

  const payload = {
    version: "1",
    projects: [],
    editors: [],
    projectTemplates: [],
    workspaces: [],
    processHistory: [],
    settings: { theme: "dark" },
  };
  const saved = await fetch(`${baseUrl}/api/data`, {
    method: "PUT",
    headers: authorizedHeaders({ "content-type": "application/json" }),
    body: JSON.stringify(payload),
  });
  assert.equal(saved.status, 200);

  const reloaded = await fetch(`${baseUrl}/api/data`, { headers: authorizedHeaders() });
  assert.deepEqual(await reloaded.json(), payload);
});

test("hosted filesystem and project inspection stay inside the configured root", async () => {
  const listing = await fetch(`${baseUrl}/api/fs/list`, { headers: authorizedHeaders() });
  assert.equal(listing.status, 200);
  const listingBody = await listing.json();
  assert.deepEqual(listingBody.entries.map((entry) => entry.name), ["demo"]);

  const inspection = await fetch(`${baseUrl}/api/invoke`, {
    method: "POST",
    headers: authorizedHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({ command: "inspect_project", args: { path: path.join(projectsRoot, "demo") } }),
  });
  assert.equal(inspection.status, 200);
  const inspectionBody = (await inspection.json()).result;
  assert.deepEqual(inspectionBody.frameworks, ["React", "Vite"]);
  assert.equal(inspectionBody.scripts[0].command, "npm run hello");

  const escaped = await fetch(`${baseUrl}/api/fs/list?path=${encodeURIComponent(os.tmpdir())}`, {
    headers: authorizedHeaders(),
  });
  assert.equal(escaped.status, 400);
});

test("hosted commands stream output and exit events", async () => {
  const abortController = new AbortController();
  const eventsResponse = await fetch(`${baseUrl}/api/events`, {
    headers: authorizedHeaders(),
    signal: abortController.signal,
  });
  assert.equal(eventsResponse.status, 200);
  assert.ok(eventsResponse.body);

  const started = await fetch(`${baseUrl}/api/invoke`, {
    method: "POST",
    headers: authorizedHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({
      command: "start_process",
      args: {
        runId: "integration-run",
        projectPath: path.join(projectsRoot, "demo"),
        command: "node -e \"console.log('alpha'); console.log('beta')\"",
        env: {},
      },
    }),
  });
  assert.equal(started.status, 200);
  assert.ok(Number.isInteger((await started.json()).result.pid));

  const reader = eventsResponse.body.getReader();
  const decoder = new TextDecoder();
  let events = "";
  const timeout = setTimeout(() => abortController.abort(), 4_000);
  try {
    while (!events.includes("event: process-exit")) {
      const { value, done } = await reader.read();
      if (done) break;
      events += decoder.decode(value, { stream: true });
    }
  } finally {
    clearTimeout(timeout);
    abortController.abort();
    await reader.cancel().catch(() => undefined);
  }

  assert.match(events, /event: process-output/);
  assert.match(events, /"line":"alpha"/);
  assert.match(events, /"line":"beta"/);
  assert.match(events, /event: process-exit/);
  assert.match(events, /"success":true/);
});
