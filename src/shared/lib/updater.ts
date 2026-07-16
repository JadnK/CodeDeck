import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import {
  check,
  type DownloadEvent,
  type Update,
} from "@tauri-apps/plugin-updater";
import { isTauri } from "./tauri";

const RELEASE_API_URL = "https://api.github.com/repos/JadnK/CodeDeck/releases/latest";

export type AvailableAppUpdate = {
  currentVersion: string;
  version: string;
  date?: string;
  body?: string;
  update: Update;
};

export type UpdateProgress = {
  downloaded: number;
  total?: number;
  percent?: number;
  phase: "downloading" | "installing";
};

type LatestReleaseResponse = {
  tag_name?: string;
  draft?: boolean;
  prerelease?: boolean;
};

function normalizedVersion(value: string) {
  return value.trim().replace(/^v/i, "").split("+")[0];
}

function compareVersions(left: string, right: string) {
  const parse = (value: string) => {
    const [core, prerelease = ""] = normalizedVersion(value).split("-", 2);
    const parts = core.split(".").map((part) => Number.parseInt(part, 10) || 0);
    return { parts, prerelease };
  };

  const a = parse(left);
  const b = parse(right);
  const length = Math.max(a.parts.length, b.parts.length, 3);
  for (let index = 0; index < length; index += 1) {
    const difference = (a.parts[index] ?? 0) - (b.parts[index] ?? 0);
    if (difference !== 0) return difference;
  }

  if (a.prerelease === b.prerelease) return 0;
  if (!a.prerelease) return 1;
  if (!b.prerelease) return -1;
  return a.prerelease.localeCompare(b.prerelease, undefined, { numeric: true });
}

async function getLatestPublishedReleaseVersion() {
  const response = await fetch(`${RELEASE_API_URL}?_=${Date.now()}`, {
    cache: "no-store",
    headers: { Accept: "application/vnd.github+json" },
  });

  if (!response.ok) return undefined;
  const release = await response.json() as LatestReleaseResponse;
  if (release.draft || release.prerelease || !release.tag_name) return undefined;
  return normalizedVersion(release.tag_name);
}

function updateCheckError(error: unknown, latestVersion?: string) {
  const raw = error instanceof Error ? error.message : String(error);
  const details = raw.replace(/^Error:\s*/i, "");

  if (latestVersion) {
    return new Error(
      `GitHub Release v${latestVersion} wurde gefunden, aber die Update-Datei latest.json konnte nicht geladen oder gelesen werden. ` +
      `Prüfe, ob der Release veröffentlicht ist und latest.json sowie die signierten Update-Dateien unter Assets enthält. ` +
      `Technischer Fehler: ${details}`,
    );
  }

  return new Error(
    `Die Update-Informationen konnten nicht geladen werden. Prüfe die Internetverbindung und ob der neueste GitHub Release eine gültige latest.json enthält. ` +
    `Technischer Fehler: ${details}`,
  );
}

export async function getCurrentAppVersion() {
  if (!isTauri()) return "development";
  return getVersion();
}

export async function checkForAppUpdate(): Promise<AvailableAppUpdate | null> {
  if (!isTauri()) return null;

  const currentVersion = await getVersion();

  try {
    const update = await check({ timeout: 20_000 });
    if (!update) return null;

    return {
      currentVersion: update.currentVersion,
      version: update.version,
      date: update.date,
      body: update.body,
      update,
    };
  } catch (error) {
    // The GitHub API is used only to distinguish "no update" from a broken
    // updater manifest. Actual update downloads still go through Tauri's
    // signed native updater.
    const latestVersion = await getLatestPublishedReleaseVersion().catch(() => undefined);
    if (latestVersion && compareVersions(latestVersion, currentVersion) <= 0) {
      return null;
    }
    throw updateCheckError(error, latestVersion);
  }
}

export async function installAppUpdate(
  available: AvailableAppUpdate,
  onProgress: (progress: UpdateProgress) => void,
) {
  let downloaded = 0;
  let total: number | undefined;

  const handleEvent = (event: DownloadEvent) => {
    if (event.event === "Started") {
      total = event.data.contentLength;
      onProgress({
        downloaded,
        total,
        percent: total ? 0 : undefined,
        phase: "downloading",
      });
      return;
    }

    if (event.event === "Progress") {
      downloaded += event.data.chunkLength;
      onProgress({
        downloaded,
        total,
        percent: total ? Math.min(100, Math.round((downloaded / total) * 100)) : undefined,
        phase: "downloading",
      });
      return;
    }

    onProgress({
      downloaded,
      total,
      percent: 100,
      phase: "installing",
    });
  };

  await available.update.downloadAndInstall(handleEvent, { timeout: 600_000 });
  await relaunch();
}
