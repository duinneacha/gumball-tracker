// Application shell layout: header, mode tabs, run selector (placeholder),
// map container, and space for bottom sheets / dashboard.

import { createFab } from "./shared/fab.js";

function renderSidePanelContent(sidePanel, mode, options = {}) {
  const { onImportSuccessRef } = options;
  sidePanel.innerHTML = "";
  if (mode === "maintenance") {
    const wrap = document.createElement("div");
    wrap.className = "side-panel-maintenance";
    const label = document.createElement("label");
    label.className = "import-label";
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.className = "import-input";
    input.setAttribute("aria-label", "Import seed or backup JSON file");
    const span = document.createElement("span");
    span.textContent = "Import seed / backup";
    label.appendChild(input);
    label.appendChild(span);
    wrap.appendChild(label);
    const status = document.createElement("p");
    status.className = "import-status";
    status.setAttribute("aria-live", "polite");
    wrap.appendChild(status);
    sidePanel.appendChild(wrap);

    input.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      status.textContent = "Importing…";
      status.removeAttribute("class");
      status.className = "import-status";
      try {
        const text = await file.text();
        const json = JSON.parse(text);
        const { importFromJson } = await import("../storage/seed.js");
        const result = await importFromJson(json);
        if (result.kind === "full") {
          status.textContent = "Full backup restored.";
        } else {
          status.textContent = `Imported ${result.count} location(s).`;
        }
        status.className = "import-status import-status-ok";
        if (typeof onImportSuccessRef?.current === "function") {
          await onImportSuccessRef.current();
        }
      } catch (err) {
        status.textContent = err instanceof Error ? err.message : "Import failed.";
        status.className = "import-status import-status-err";
      }
      input.value = "";
    });
  }
}

export function createShellLayout(root, options) {
  const { initialMode, onModeChange, onImportSuccessRef } = options;

  root.innerHTML = "";

  const app = document.createElement("div");
  app.className = "app-shell";

  const header = document.createElement("header");
  header.className = "app-header";
  header.innerHTML = `
    <div class="app-title">Gumball Tracker</div>
    <nav class="app-modes" aria-label="App modes">
      <button data-mode="maintenance" class="mode-btn">Maintenance</button>
      <button data-mode="operation" class="mode-btn">Operation</button>
      <button data-mode="dashboard" class="mode-btn">Dashboard</button>
    </nav>
  `;

  const main = document.createElement("main");
  main.className = "app-main";

  const mapContainer = document.createElement("div");
  mapContainer.id = "map";
  mapContainer.className = "map-container";

  const sidePanel = document.createElement("section");
  sidePanel.className = "side-panel";
  sidePanel.setAttribute("aria-live", "polite");

  main.appendChild(mapContainer);
  main.appendChild(sidePanel);

  const snackbarHost = document.createElement("div");
  snackbarHost.className = "snackbar-host";

  const sheetHost = document.createElement("div");
  sheetHost.className = "bottom-sheet-host";

  app.appendChild(header);
  app.appendChild(main);
  app.appendChild(snackbarHost);
  app.appendChild(sheetHost);

  root.appendChild(app);

  let currentMode = initialMode;
  renderSidePanelContent(sidePanel, initialMode, { onImportSuccessRef });

  // Mode button wiring
  header.querySelectorAll(".mode-btn").forEach((btn) => {
    const mode = btn.getAttribute("data-mode");
    if (mode === initialMode) {
      btn.classList.add("active");
    }
    btn.addEventListener("click", () => {
      header.querySelectorAll(".mode-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentMode = mode;
      renderSidePanelContent(sidePanel, mode, { onImportSuccessRef });
      if (typeof onModeChange === "function") {
        onModeChange(mode);
      }
    });
  });

  // Disruption FAB - visible in Operation mode; actual behaviour implemented later.
  const fab = createFab("!", { label: "Disruption" });
  root.appendChild(fab);

  return {
    getMapContainer() {
      return mapContainer;
    },
    getSidePanel() {
      return sidePanel;
    },
    getSheetHost() {
      return sheetHost;
    },
    refreshSidePanel() {
      renderSidePanelContent(sidePanel, currentMode, { onImportSuccessRef });
    },
    showError(message) {
      // Minimal inline error for now; can be replaced with snackbar.
      // eslint-disable-next-line no-console
      console.error(message);
    },
  };
}

