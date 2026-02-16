/**
 * Disruption Mode: direction bar (N, S, E, W) and close button.
 * Visible only in Operation when Disruption Mode is active.
 */

/**
 * Create the direction panel DOM and wire callbacks.
 * @param {HTMLElement} container - Parent to append the panel to (e.g. above bottom-sheet-host)
 * @param {{ suggestionsByDirection: { N: object|null, S: object|null, E: object|null, W: object|null }, onDirection: (dir: 'N'|'S'|'E'|'W') => void, onClose: () => void }} options
 * @returns {{ updateSuggestions: (suggestionsByDirection: object) => void, destroy: () => void }}
 */
export function createDisruptionPanel(container, options) {
  const { suggestionsByDirection = {}, onDirection, onClose } = options;
  const panel = document.createElement("div");
  panel.className = "disruption-panel";

  const dirs = ["N", "S", "E", "W"];
  const buttons = {};
  dirs.forEach((dir) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "disruption-panel-btn";
    btn.textContent = dir;
    btn.dataset.direction = dir;
    btn.addEventListener("click", () => {
      if (typeof onDirection === "function") onDirection(dir);
    });
    panel.appendChild(btn);
    buttons[dir] = btn;
  });

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "disruption-panel-close";
  closeBtn.setAttribute("aria-label", "Exit Disruption Mode");
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", () => typeof onClose === "function" && onClose());
  panel.appendChild(closeBtn);

  function updateSuggestions(sugg) {
    dirs.forEach((dir) => {
      const has = sugg && (sugg[dir] != null);
      buttons[dir].disabled = !has;
      buttons[dir].classList.toggle("disabled", !has);
    });
  }

  updateSuggestions(suggestionsByDirection);
  container.appendChild(panel);

  return {
    updateSuggestions,
    destroy() {
      if (panel.parentNode) panel.parentNode.removeChild(panel);
    },
  };
}
