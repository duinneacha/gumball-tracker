/**
 * Dashboard (V1): default landing mode. Cards for active locations, runs, last visit,
 * last run (PRD V2.1); quick links to Maintenance and Operation. Map is hidden when Dashboard is active.
 */

/**
 * Render dashboard content into the given container.
 * @param {HTMLElement} container
 * @param {{ activeCount: number, runsCount: number, lastVisitText: string, lastRun?: object | null, onGoToMaintenance: () => void, onGoToOperation: () => void }} options
 */
export function renderDashboard(container, options) {
  const {
    activeCount = 0,
    runsCount = 0,
    lastVisitText = "No visits yet",
    lastRun = null,
    onGoToMaintenance,
    onGoToOperation,
  } = options;

  container.innerHTML = "";
  container.className = "dashboard-panel";

  const card1 = document.createElement("div");
  card1.className = "dashboard-card";
  card1.innerHTML = `<span class="dashboard-card-label">Total Active Locations</span><span class="dashboard-card-value">${activeCount}</span>`;

  const card2 = document.createElement("div");
  card2.className = "dashboard-card";
  card2.innerHTML = `<span class="dashboard-card-label">Total Runs</span><span class="dashboard-card-value">${runsCount}</span>`;

  const card3 = document.createElement("div");
  card3.className = "dashboard-card";
  card3.innerHTML = `<span class="dashboard-card-label">Last Visit</span><span class="dashboard-card-value dashboard-card-value--muted">${escapeHtml(lastVisitText)}</span>`;

  const card4 = document.createElement("div");
  card4.className = "dashboard-card";
  if (lastRun && lastRun.runName) {
    const completedAt = lastRun.completedAt
      ? new Date(lastRun.completedAt).toLocaleString()
      : "—";
    card4.innerHTML = `<span class="dashboard-card-label">Last Run</span><span class="dashboard-card-value">${escapeHtml(lastRun.runName)}</span><span class="dashboard-card-sublabel">${lastRun.visitedCount}/${lastRun.totalCount} visited · ${completedAt}</span>`;
  } else {
    card4.innerHTML = `<span class="dashboard-card-label">Last Run</span><span class="dashboard-card-value dashboard-card-value--muted">No runs completed yet</span>`;
  }

  const actions = document.createElement("div");
  actions.className = "dashboard-actions";
  const btnMaint = document.createElement("button");
  btnMaint.type = "button";
  btnMaint.className = "dashboard-btn dashboard-btn-primary";
  btnMaint.textContent = "Go to Maintenance";
  btnMaint.addEventListener("click", () => typeof onGoToMaintenance === "function" && onGoToMaintenance());
  const btnOp = document.createElement("button");
  btnOp.type = "button";
  btnOp.className = "dashboard-btn dashboard-btn-secondary";
  btnOp.textContent = "Go to Operation";
  btnOp.addEventListener("click", () => typeof onGoToOperation === "function" && onGoToOperation());
  actions.appendChild(btnMaint);
  actions.appendChild(btnOp);

  container.appendChild(card1);
  container.appendChild(card2);
  container.appendChild(card3);
  container.appendChild(card4);
  container.appendChild(actions);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
