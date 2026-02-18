/**
 * Simple 7-day visits bar chart (PRD V2.9). Dependency-free HTML/CSS bars.
 * @param {HTMLElement} container - parent to append the chart into
 * @param {Array<{ dayLabel: string, count: number }>} dailyCounts - length 7, order Mon..Sun or oldest..today
 */
export function renderVisitsChart(container, dailyCounts) {
  container.innerHTML = "";
  container.className = "visits-chart";
  const list = Array.isArray(dailyCounts) ? dailyCounts : [];
  const maxCount = list.length > 0 ? Math.max(1, ...list.map((d) => d.count)) : 1;

  const heading = document.createElement("p");
  heading.className = "visits-chart-heading";
  heading.textContent = "Last 7 days";
  container.appendChild(heading);

  const chartWrap = document.createElement("div");
  chartWrap.className = "visits-chart-bars";
  for (const day of list) {
    const row = document.createElement("div");
    row.className = "stat-row";
    const pct = maxCount > 0 ? (day.count / maxCount) * 100 : 0;
    row.innerHTML = `
      <span class="day-label">${escapeHtml(day.dayLabel)}</span>
      <div class="bar-container"><div class="bar" style="width: ${pct}%"></div></div>
      <span class="count">${day.count}</span>
    `;
    chartWrap.appendChild(row);
  }
  container.appendChild(chartWrap);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
