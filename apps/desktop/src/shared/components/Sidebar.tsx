export type AppPage = "dashboard" | "projects" | "settings";

type SidebarProps = {
  activePage: AppPage;
  onNavigate: (page: AppPage) => void;
};

const navigationItems: Array<{
  id: AppPage;
  label: string;
  description: string;
}> = [
  {
    id: "dashboard",
    label: "Dashboard",
    description: "Overview"
  },
  {
    id: "projects",
    label: "Projects",
    description: "Manage projects"
  },
  {
    id: "settings",
    label: "Settings",
    description: "Configure app"
  }
];

export function Sidebar({ activePage, onNavigate }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="app-logo">CD</div>

        <div>
          <h1>Code Deck</h1>
          <p>Developer Dashboard</p>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Main navigation">
        {navigationItems.map((item) => {
          const isActive = activePage === item.id;

          return (
            <button
              key={item.id}
              className={isActive ? "nav-item nav-item-active" : "nav-item"}
              type="button"
              onClick={() => onNavigate(item.id)}
            >
              <span>{item.label}</span>
              <small>{item.description}</small>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <span className="status-dot" />
        <span>Local only</span>
      </div>
    </aside>
  );
}