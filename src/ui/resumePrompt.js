/**
 * Resume active run prompt (PRD V2.6): modal asking user to resume or start new.
 */

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Create the resume prompt modal.
 * @param {HTMLElement} host - Container to render into
 * @param {object} options
 * @param {{ runName: string, startedAt: string, visitedCount: number, totalCount: number }} options.sessionInfo
 * @param {() => void} options.onResume
 * @param {() => void} options.onStartNew
 */
export function createResumePrompt(host, options) {
  const { sessionInfo, onResume, onStartNew } = options;
  const { runName = "—", startedAt, visitedCount = 0, totalCount = 0 } = sessionInfo || {};

  let startedAgo = "";
  if (startedAt) {
    const ms = Date.now() - new Date(startedAt).getTime();
    const mins = Math.floor(ms / 60000);
    const hours = Math.floor(ms / 3600000);
    const days = Math.floor(ms / 86400000);
    if (days > 0) startedAgo = `${days} day${days === 1 ? "" : "s"} ago`;
    else if (hours > 0) startedAgo = `${hours} hour${hours === 1 ? "" : "s"} ago`;
    else if (mins > 0) startedAgo = `${mins} min ago`;
    else startedAgo = "Just now";
  }

  host.innerHTML = "";
  host.setAttribute("aria-hidden", "false");

  const overlay = document.createElement("div");
  overlay.className = "resume-prompt-overlay";

  const modal = document.createElement("div");
  modal.className = "resume-prompt-modal";
  modal.innerHTML = `
    <h2 class="resume-prompt-title">Resume Active Run?</h2>
    <p class="resume-prompt-desc">You have an unfinished run:</p>
    <p class="resume-prompt-run-name">"${escapeHtml(runName)}"</p>
    ${startedAgo ? `<p class="resume-prompt-meta">Started ${startedAgo}</p>` : ""}
    <p class="resume-prompt-meta">${visitedCount} of ${totalCount} locations visited</p>
    <div class="resume-prompt-actions">
      <button type="button" class="resume-prompt-btn resume-prompt-btn-resume">Resume</button>
      <button type="button" class="resume-prompt-btn resume-prompt-btn-new">Start New</button>
    </div>
  `;

  const dismiss = () => {
    host.setAttribute("aria-hidden", "true");
    host.innerHTML = "";
  };

  modal.querySelector(".resume-prompt-btn-resume").addEventListener("click", () => {
    dismiss();
    if (typeof onResume === "function") onResume();
  });
  modal.querySelector(".resume-prompt-btn-new").addEventListener("click", () => {
    dismiss();
    if (typeof onStartNew === "function") onStartNew();
  });

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      dismiss();
      if (typeof onStartNew === "function") onStartNew();
    }
  });

  overlay.appendChild(modal);
  host.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("open"));
}
