import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import {
  check,
  type DownloadEvent,
  type Update,
} from "@tauri-apps/plugin-updater";
import { isTauri } from "./tauri";

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

export async function getCurrentAppVersion() {
  if (!isTauri()) return "development";
  return getVersion();
}

export async function checkForAppUpdate(): Promise<AvailableAppUpdate | null> {
  if (!isTauri()) return null;

  const update = await check({ timeout: 20_000 });
  if (!update) return null;

  return {
    currentVersion: update.currentVersion,
    version: update.version,
    date: update.date,
    body: update.body,
    update,
  };
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
