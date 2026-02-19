/**
 * Dashboard (V1): default landing mode. Cards for active locations, runs, last visit,
 * last run (PRD V2.1), resume last run (PRD V2.4); quick links to Maintenance and Operation.
 * V2.9: Statistics section (visits today/week/month, most/least visited, due for service, 7-day chart).
 * Map is hidden when Dashboard is active.
 */

import { renderVisitsChart } from "./visitsChart.js";

/**
 * Render dashboard content into the given container.
 * @param {HTMLElement} container
 * @param {{ activeCount: number, runsCount: number, lastVisitText: string, lastRun?: object | null, stats?: object, onGoToMaintenance: () => void, onGoToOperation: () => void, onResumeLastRun?: () => void, onOpenRunManagement?: () => void, onOpenRunHistory?: () => void }} options
 */
export function renderDashboard(container, options) {
  const {
    activeCount = 0,
    runsCount = 0,
    lastVisitText = "No visits yet",
    lastRun = null,
    lastRunResumable = false,
    stats = null,
    onGoToMaintenance,
    onGoToOperation,
    onResumeLastRun,
    onOpenRunManagement,
    onOpenRunHistory,
  } = options;

  container.innerHTML = "";

  const panel = document.createElement("div");
  panel.className = "dashboard-panel";

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

  const card5 = document.createElement("div");
  card5.className = "dashboard-card dashboard-card-resume";
  if (lastRun && lastRun.runName && lastRunResumable) {
    const completedAt = lastRun.completedAt
      ? new Date(lastRun.completedAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
      : "";
    card5.innerHTML = `
      <span class="dashboard-card-label">Resume Last Run</span>
      <span class="dashboard-card-value">${escapeHtml(lastRun.runName)}</span>
      ${completedAt ? `<span class="dashboard-card-sublabel">Completed ${completedAt}</span>` : ""}
    `;
    const resumeBtn = document.createElement("button");
    resumeBtn.type = "button";
    resumeBtn.className = "dashboard-btn dashboard-btn-resume";
    resumeBtn.textContent = "Resume";
    resumeBtn.addEventListener("click", () => typeof onResumeLastRun === "function" && onResumeLastRun());
    card5.appendChild(resumeBtn);
  } else {
    card5.innerHTML = `<span class="dashboard-card-label">Resume Last Run</span><span class="dashboard-card-value dashboard-card-value--muted">No recent run.</span>`;
  }

  const historyBtnWrap = document.createElement("div");
  historyBtnWrap.className = "dashboard-history-wrap";
  const historyBtn = document.createElement("button");
  historyBtn.type = "button";
  historyBtn.className = "dashboard-btn-link";
  historyBtn.textContent = "View Run History";
  historyBtn.addEventListener("click", () => typeof onOpenRunHistory === "function" && onOpenRunHistory());
  historyBtnWrap.appendChild(historyBtn);

  panel.appendChild(card1);
  panel.appendChild(card2);
  panel.appendChild(card3);
  panel.appendChild(card4);
  panel.appendChild(card5);
  panel.appendChild(historyBtnWrap);

  if (stats) {
    const sectionHeading = document.createElement("h2");
    sectionHeading.className = "dashboard-statistics-heading";
    sectionHeading.textContent = "Statistics";
    panel.appendChild(sectionHeading);

    const cardToday = document.createElement("div");
    cardToday.className = "dashboard-card";
    cardToday.innerHTML = `<span class="dashboard-card-label">Visits Today</span><span class="dashboard-card-value">${stats.visitsToday ?? 0}</span>`;
    panel.appendChild(cardToday);

    const cardWeek = document.createElement("div");
    cardWeek.className = "dashboard-card";
    cardWeek.innerHTML = `<span class="dashboard-card-label">Visits This Week</span><span class="dashboard-card-value">${stats.visitsThisWeek ?? 0}</span>`;
    panel.appendChild(cardWeek);

    const cardMonth = document.createElement("div");
    cardMonth.className = "dashboard-card";
    cardMonth.innerHTML = `<span class="dashboard-card-label">Visits This Month</span><span class="dashboard-card-value">${stats.visitsThisMonth ?? 0}</span>`;
    panel.appendChild(cardMonth);

    const mostVisitedText = stats.mostVisited
      ? `${escapeHtml(stats.mostVisited.name)} (${stats.mostVisited.count}×)`
      : "—";
    const cardMost = document.createElement("div");
    cardMost.className = "dashboard-card";
    cardMost.innerHTML = `<span class="dashboard-card-label">Most Visited</span><span class="dashboard-card-value dashboard-card-value--muted">${mostVisitedText}</span>`;
    panel.appendChild(cardMost);

    const leastVisitedText = stats.leastVisited
      ? `${escapeHtml(stats.leastVisited.name)} (${stats.leastVisited.count}×)`
      : "—";
    const cardLeast = document.createElement("div");
    cardLeast.className = "dashboard-card";
    cardLeast.innerHTML = `<span class="dashboard-card-label">Least Visited</span><span class="dashboard-card-value dashboard-card-value--muted">${leastVisitedText}</span>`;
    panel.appendChild(cardLeast);

    const cardDue = document.createElement("div");
    cardDue.className = "dashboard-card";
    cardDue.innerHTML = `<span class="dashboard-card-label">Due for Service</span><span class="dashboard-card-value">${stats.dueForServiceCount ?? 0} locations</span>`;
    panel.appendChild(cardDue);

    const chartContainer = document.createElement("div");
    chartContainer.className = "dashboard-chart-wrap";
    renderVisitsChart(chartContainer, stats.visitsPerDayLast7 ?? []);
    panel.appendChild(chartContainer);
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

  panel.appendChild(actions);

  container.appendChild(panel);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
