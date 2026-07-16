import { useState } from "react";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { ProjectsPage } from "../features/projects/ProjectsPage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { Sidebar, type AppPage } from "../shared/components/Sidebar";

export function App() {
  const [activePage, setActivePage] = useState<AppPage>("dashboard");

  return (
    <div className="app-shell">
      <Sidebar activePage={activePage} onNavigate={setActivePage} />

      <main className="app-main">
        {activePage === "dashboard" && <DashboardPage />}
        {activePage === "projects" && <ProjectsPage />}
        {activePage === "settings" && <SettingsPage />}
      </main>
    </div>
  );
}