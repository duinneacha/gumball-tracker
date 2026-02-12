// Simple floating action button. The caller decides when to show/hide.

export function createFab(symbol, options = {}) {
  const button = document.createElement("button");
  button.className = "fab";
  button.type = "button";
  button.textContent = symbol;

  if (options.label) {
    button.setAttribute("aria-label", options.label);
  }

  return button;
}

