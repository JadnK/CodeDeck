export function DashboardPage() {
  return (
    <section className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Welcome back</p>
          <h2>Dashboard</h2>
        </div>

        <button className="primary-button" type="button">
          Add project
        </button>
      </div>

      <div className="dashboard-grid">
        <article className="stat-card">
          <span className="stat-label">Projects</span>
          <strong>1</strong>
          <p>Your local coding projects.</p>
        </article>

        <article className="stat-card">
          <span className="stat-label">Favorites</span>
          <strong>1</strong>
          <p>Important projects for quick access.</p>
        </article>

        <article className="stat-card">
          <span className="stat-label">Running</span>
          <strong>0</strong>
          <p>Active commands will appear here later.</p>
        </article>
      </div>

      <section className="panel">
        <h3>Next steps</h3>

        <ul className="task-list">
          <li>Create project list UI</li>
          <li>Add local storage</li>
          <li>Add editor settings</li>
          <li>Implement open in editor</li>
        </ul>
      </section>
    </section>
  );
}