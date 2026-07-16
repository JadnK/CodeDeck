export type Editor = {
  id: string;
  name: string;
  commandTemplate: string;
  icon?: string;
  enabled: boolean;
  platform?: "windows" | "macos" | "linux" | "all";
};