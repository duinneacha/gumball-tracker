/**
 * Snackbar UI: show transient messages with optional Undo action.
 * Uses existing snackbar-host element.
 */

const DEFAULT_DURATION_MS = 4000;
const UNDO_DURATION_MS = 5000;

/**
 * Show a snackbar message.
 * @param {HTMLElement} host - Snackbar host element
 * @param {string} message - Message text
 * @param {{ undoLabel?: string, onUndo?: () => void, duration?: number }} [opts]
 */
export function showSnackbar(host, message, opts = {}) {
  if (!host) return;

  // Dismiss any existing snackbar
  host.innerHTML = "";

  const snackbar = document.createElement("div");
  snackbar.className = "snackbar";
  snackbar.setAttribute("role", "status");
  snackbar.setAttribute("aria-live", "polite");

  const text = document.createElement("span");
  text.className = "snackbar-text";
  text.textContent = message;
  snackbar.appendChild(text);

  if (typeof opts.onUndo === "function" && opts.undoLabel) {
    const undoBtn = document.createElement("button");
    undoBtn.type = "button";
    undoBtn.className = "snackbar-undo";
    undoBtn.textContent = opts.undoLabel;
    undoBtn.addEventListener("click", () => {
      opts.onUndo();
      dismiss();
    });
    snackbar.appendChild(undoBtn);
  }

  host.appendChild(snackbar);
  requestAnimationFrame(() => snackbar.classList.add("visible"));

  const duration = opts.duration ?? (opts.onUndo ? UNDO_DURATION_MS : DEFAULT_DURATION_MS);
  const timeoutId = setTimeout(dismiss, duration);

  function dismiss() {
    clearTimeout(timeoutId);
    snackbar.classList.remove("visible");
    snackbar.addEventListener(
      "transitionend",
      () => {
        if (snackbar.parentNode) snackbar.remove();
      },
      { once: true }
    );
  }
}
