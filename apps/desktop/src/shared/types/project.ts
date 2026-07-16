export type Project = {
  id: string;
  name: string;
  path: string;
  description?: string;
  tags: string[];
  favorite: boolean;
  preferredEditorId?: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt?: string;
};