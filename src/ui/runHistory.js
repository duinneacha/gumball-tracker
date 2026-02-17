/**
 * Run History panel (PRD V2.7): list of all completed runs, sorted newest first.
 * Renders into a host container; uses provided completions array.
 */

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(isoString) {
  if (!isoString) return "—";
  const d = new Date(isoString);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatDuration(minutes) {
  if (minutes == null || typeof minutes !== "number") return "";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/**
 * Create the Run History panel.
 * @param {HTMLElement} host - Container to render into
 * @param {object} options
 * @param {Array<{ runName: string, completedAt: string, visitedCount: number, totalCount: number, durationMinutes?: number }>} options.completions - Sorted newest first
 * @param {() => void} options.onClose - Close panel, return to Dashboard
 * @returns {{ render: (completions?: Array) => void, destroy: () => void }}
 */
export function createRunHistoryPanel(host, options) {
  const { completions = [], onClose } = options;
  let panelEl = null;

  function renderList(list) {
    const wrap = document.createElement("div");
    wrap.className = "run-history-list";
    const ul = document.createElement("ul");
    ul.className = "run-history-entries";
    if (!list?.length) {
      const li = document.createElement("li");
      li.className = "run-history-empty";
      li.textContent = "No completed runs yet.";
      ul.appendChild(li);
    } else {
      list.forEach((c) => {
        const li = document.createElement("li");
        li.className = "run-history-entry";
        const dateStr = formatDate(c.completedAt);
        const durationStr = formatDuration(c.durationMinutes);
        const meta = [dateStr, `${c.visitedCount}/${c.totalCount}`];
        if (durationStr) meta.push(durationStr);
        li.innerHTML = `
          <span class="run-history-name">${escapeHtml(c.runName ?? c.runId ?? "—")}</span>
          <span class="run-history-meta">${escapeHtml(meta.join(" • "))}</span>
        `;
        ul.appendChild(li);
      });
    }
    wrap.appendChild(ul);
    return wrap;
  }

  function render(list = completions) {
    if (!panelEl) return;
    const content = panelEl.querySelector(".run-history-content");
    if (!content) return;
    content.innerHTML = "";
    content.appendChild(renderList(list));
  }

  function init() {
    panelEl = document.createElement("div");
    panelEl.className = "run-history-panel";
    panelEl.innerHTML = `
      <div class="run-history-header">
        <h2 class="run-history-title">Run History</h2>
        <button type="button" class="run-history-close" aria-label="Close">×</button>
      </div>
      <div class="run-history-content"></div>
    `;
    panelEl.querySelector(".run-history-close").addEventListener("click", () => {
      if (typeof onClose === "function") onClose();
    });
    host.innerHTML = "";
    host.appendChild(panelEl);
    host.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => panelEl.classList.add("open"));
    render();
  }

  function destroy() {
    if (host) host.setAttribute("aria-hidden", "true");
    if (panelEl?.parentNode) {
      panelEl.classList.remove("open");
      panelEl.addEventListener("transitionend", () => panelEl?.remove(), { once: true });
    }
    host.innerHTML = "";
  }

  init();

  return {
    render(list) {
      render(list);
    },
    destroy,
  };
}
