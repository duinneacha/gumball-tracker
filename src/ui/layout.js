// Application shell layout: header, mode tabs, run selector (placeholder),
// map container, and space for bottom sheets / dashboard.

import { createFab } from "./shared/fab.js";
import { renderDashboard } from "./dashboard.js";

/**
 * Floating Maintenance toggle button (PRD V1.6). Renders above map, top-right.
 * Tap switches to Maintenance (or back to Operation when already in Maintenance).
 * @param {HTMLElement} container - Map container to mount the button in
 * @param {{ initialActive: boolean, onClick: () => void }} options
 * @returns {{ setActive: (isActive: boolean) => void }}
 */
function createMaintenanceToggleButton(container, options) {
  const { initialActive, onClick } = options;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "maintenance-toggle";
  btn.setAttribute("aria-label", "Switch to Maintenance mode");
  btn.innerHTML = "&#9881;&#65039; Maintenance";

  if (initialActive) {
    btn.classList.add("active");
    btn.setAttribute("aria-pressed", "true");
  } else {
    btn.setAttribute("aria-pressed", "false");
  }

  btn.addEventListener("click", () => {
    if (typeof onClick === "function") onClick();
  });

  container.appendChild(btn);

  return {
    setActive(isActive) {
      if (isActive) {
        btn.classList.add("active");
        btn.setAttribute("aria-pressed", "true");
        btn.setAttribute("aria-label", "Switch to Operation mode (currently Maintenance)");
      } else {
        btn.classList.remove("active");
        btn.setAttribute("aria-pressed", "false");
        btn.setAttribute("aria-label", "Switch to Maintenance mode");
      }
    },
  };
}

/**
 * Create maintenance filter bar (PRD V1.7): status chips, unassigned toggle, search.
 * @param {{ active: boolean, archived: boolean, deleted: boolean, unassignedOnly: boolean, searchQuery: string }} filters
 * @param {(filters: object) => void} onFiltersChange
 */
function createMaintenanceFilterBar(filters, onFiltersChange) {
  const bar = document.createElement("div");
  bar.className = "maintenance-filter-bar";

  const chipsWrap = document.createElement("div");
  chipsWrap.className = "maintenance-filter-chips";
  ["active", "archived", "deleted"].forEach((status) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "filter-chip";
    btn.dataset.status = status;
    btn.textContent = status.charAt(0).toUpperCase() + status.slice(1);
    if (filters[status]) btn.classList.add("active");
    btn.addEventListener("click", () => {
      const next = { ...filters, [status]: !filters[status] };
      onFiltersChange(next);
    });
    chipsWrap.appendChild(btn);
  });

  const unassignedLabel = document.createElement("label");
  unassignedLabel.className = "filter-unassigned-label";
  const unassignedCheck = document.createElement("input");
  unassignedCheck.type = "checkbox";
  unassignedCheck.checked = filters.unassignedOnly;
  unassignedCheck.setAttribute("aria-label", "Unassigned only");
  unassignedLabel.appendChild(unassignedCheck);
  const unassignedSpan = document.createElement("span");
  unassignedSpan.textContent = "Unassigned only";
  unassignedLabel.appendChild(unassignedSpan);
  unassignedCheck.addEventListener("change", () => {
    onFiltersChange({ ...filters, unassignedOnly: unassignedCheck.checked });
  });

  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.className = "filter-search";
  searchInput.placeholder = "Search locations…";
  searchInput.setAttribute("aria-label", "Search locations by name");
  searchInput.value = filters.searchQuery ?? "";
  let searchTimeout;
  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      onFiltersChange({ ...filters, searchQuery: searchInput.value });
    }, 150);
  });

  bar.appendChild(chipsWrap);
  bar.appendChild(unassignedLabel);
  bar.appendChild(searchInput);
  return bar;
}

function renderSidePanelContent(sidePanel, mode, options = {}) {
  const { onImportSuccessRef, maintenanceFilterOptionsRef, operationOptionsRef } = options;
  const filterOpts = maintenanceFilterOptionsRef?.current;
  const maintenanceFilters = filterOpts?.maintenanceFilters;
  const onMaintenanceFiltersChange = filterOpts?.onMaintenanceFiltersChange;
  const onExportBackup = filterOpts?.onExportBackup;
  const operationOpts = operationOptionsRef?.current;

  sidePanel.innerHTML = "";
  if (mode === "operation") {
    const wrap = document.createElement("div");
    wrap.className = "side-panel-operation";
    const progress = document.createElement("p");
    progress.className = "operation-progress";
    progress.setAttribute("aria-live", "polite");
    const runName = operationOpts?.runName ?? "—";
    const visitedCount = operationOpts?.visitedCount ?? 0;
    const totalCount = operationOpts?.totalCount ?? 0;
    progress.textContent = `Run: ${runName} | ${visitedCount} / ${totalCount} visited`;
    wrap.appendChild(progress);
    sidePanel.appendChild(wrap);
  }
  if (mode === "maintenance") {
    const wrap = document.createElement("div");
    wrap.className = "side-panel-maintenance";

    if (maintenanceFilters && typeof onMaintenanceFiltersChange === "function") {
      const filterBar = createMaintenanceFilterBar(maintenanceFilters, (next) => {
        onMaintenanceFiltersChange(next);
      });
      wrap.appendChild(filterBar);
    }

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

    if (typeof onExportBackup === "function") {
      const exportBtn = document.createElement("button");
      exportBtn.type = "button";
      exportBtn.className = "export-backup-btn";
      exportBtn.textContent = "Export Backup JSON";
      exportBtn.addEventListener("click", () => onExportBackup());
      wrap.appendChild(exportBtn);
    }

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
  const {
    initialMode,
    onModeChange,
    onImportSuccessRef,
    maintenanceFilterOptionsRef,
    operationOptionsRef,
    dashboardDataRef,
    onFabClickRef,
    disruptionRef,
    onMapVisible,
  } = options;

  root.innerHTML = "";

  const app = document.createElement("div");
  app.className = "app-shell";

  const header = document.createElement("header");
  header.className = "app-header";
  const titleDiv = document.createElement("div");
  titleDiv.className = "app-title";
  titleDiv.textContent = "Gumball Tracker";
  const headerOperation = document.createElement("div");
  headerOperation.className = "header-operation";
  headerOperation.setAttribute("aria-label", "Run selection");
  const nav = document.createElement("nav");
  nav.className = "app-modes";
  nav.setAttribute("aria-label", "App modes");
  nav.innerHTML = `
    <button data-mode="dashboard" class="mode-btn">Dashboard</button>
    <button data-mode="maintenance" class="mode-btn">Maintenance</button>
    <button data-mode="operation" class="mode-btn">Operation</button>
  `;
  header.appendChild(titleDiv);
  header.appendChild(headerOperation);
  header.appendChild(nav);

  function updateHeaderOperation() {
    headerOperation.innerHTML = "";
    headerOperation.hidden = currentMode !== "operation";
    if (currentMode !== "operation") return;
    const opts = operationOptionsRef?.current;
    if (!opts) return;
    const { runs = [], selectedRunId, onRunSelect, resumeRunId } = opts;
    const select = document.createElement("select");
    select.className = "run-select";
    select.setAttribute("aria-label", "Select run");
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = resumeRunId ? "Resume last run" : "Select Run ▼";
    select.appendChild(placeholder);
    (runs || []).forEach((run) => {
      const opt = document.createElement("option");
      opt.value = run.id;
      opt.textContent = run.name ?? run.id;
      if (run.id === selectedRunId) opt.selected = true;
      select.appendChild(opt);
    });
    if (selectedRunId) select.value = selectedRunId;
    select.addEventListener("change", () => {
      const runId = select.value || null;
      if (typeof onRunSelect === "function") onRunSelect(runId);
    });
    headerOperation.appendChild(select);
  }

  const main = document.createElement("main");
  main.className = "app-main";

  const dashboardWrap = document.createElement("div");
  dashboardWrap.className = "dashboard-panel-wrap";
  dashboardWrap.setAttribute("aria-label", "Dashboard");

  const mapContainer = document.createElement("div");
  mapContainer.id = "map";
  mapContainer.className = "map-container";

  const maintenanceToggle = createMaintenanceToggleButton(mapContainer, {
    initialActive: initialMode === "maintenance",
    onClick: () => {
      const targetMode = currentMode === "maintenance" ? "operation" : "maintenance";
      header.querySelectorAll(".mode-btn").forEach((b) => b.classList.remove("active"));
      const targetBtn = header.querySelector(`.mode-btn[data-mode="${targetMode}"]`);
      if (targetBtn) targetBtn.classList.add("active");
      currentMode = targetMode;
      maintenanceToggle.setActive(currentMode === "maintenance");
      updateDashboardVisibility();
      renderSidePanelContent(sidePanel, currentMode, { onImportSuccessRef, maintenanceFilterOptionsRef, operationOptionsRef });
      updateHeaderOperation();
      updateFabVisibility();
      if (typeof onModeChange === "function") {
        onModeChange(currentMode);
      }
    },
  });

  const centerOnMeWrap = document.createElement("div");
  centerOnMeWrap.className = "map-controls-center";
  centerOnMeWrap.hidden = true;
  const centerOnMeBtn = document.createElement("button");
  centerOnMeBtn.type = "button";
  centerOnMeBtn.className = "center-on-me-btn";
  centerOnMeBtn.setAttribute("aria-label", "Center on my location");
  centerOnMeBtn.innerHTML = "&#128205;";
  let onCenterOnMeCallback = null;
  centerOnMeBtn.addEventListener("click", () => typeof onCenterOnMeCallback === "function" && onCenterOnMeCallback());
  centerOnMeWrap.appendChild(centerOnMeBtn);
  mapContainer.appendChild(centerOnMeWrap);

  function setGpsActive(active) {
    centerOnMeWrap.hidden = !active;
  }
  function setOnCenterOnMe(fn) {
    onCenterOnMeCallback = fn;
  }

  const sidePanel = document.createElement("section");
  sidePanel.className = "side-panel";
  sidePanel.setAttribute("aria-live", "polite");

  main.appendChild(dashboardWrap);
  main.appendChild(mapContainer);
  main.appendChild(sidePanel);

  const snackbarHost = document.createElement("div");
  snackbarHost.className = "snackbar-host";

  const disruptionPanelHost = document.createElement("div");
  disruptionPanelHost.className = "disruption-panel-host";

  const sheetHost = document.createElement("div");
  sheetHost.className = "bottom-sheet-host";

  app.appendChild(header);
  app.appendChild(main);
  app.appendChild(snackbarHost);
  app.appendChild(disruptionPanelHost);
  app.appendChild(sheetHost);

  root.appendChild(app);

  let currentMode = initialMode;
  function updateDashboardVisibility() {
    const isDashboard = currentMode === "dashboard";
    dashboardWrap.hidden = !isDashboard;
    mapContainer.hidden = isDashboard;
    sidePanel.hidden = isDashboard;
    if (isDashboard && dashboardDataRef?.current) {
      renderDashboard(dashboardWrap, dashboardDataRef.current);
    }
  }
  function updateFabVisibility() {
    const runActive = operationOptionsRef?.current?.selectedRunId != null;
    const inDisruption = disruptionRef?.current?.isDisruptionMode === true;
    fab.hidden = currentMode !== "operation" || !runActive || inDisruption;
  }
  updateDashboardVisibility();
  renderSidePanelContent(sidePanel, initialMode, { onImportSuccessRef, maintenanceFilterOptionsRef, operationOptionsRef });
  updateHeaderOperation();

  // Mode button wiring (header tabs + floating Maintenance toggle sync)
  header.querySelectorAll(".mode-btn").forEach((btn) => {
    const mode = btn.getAttribute("data-mode");
    if (mode === initialMode) {
      btn.classList.add("active");
    }
    btn.addEventListener("click", () => {
      header.querySelectorAll(".mode-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentMode = mode;
      maintenanceToggle.setActive(mode === "maintenance");
      updateDashboardVisibility();
      renderSidePanelContent(sidePanel, mode, { onImportSuccessRef, maintenanceFilterOptionsRef, operationOptionsRef });
      updateHeaderOperation();
      updateFabVisibility();
      if (typeof onModeChange === "function") {
        onModeChange(mode);
      }
    });
  });

  const fab = createFab("!", { label: "Disruption" });
  fab.addEventListener("click", () => typeof onFabClickRef?.current === "function" && onFabClickRef.current());
  updateFabVisibility();
  root.appendChild(fab);

  function setMode(mode) {
    currentMode = mode;
    header.querySelectorAll(".mode-btn").forEach((b) => b.classList.remove("active"));
    const btn = header.querySelector(`.mode-btn[data-mode="${mode}"]`);
    if (btn) btn.classList.add("active");
    maintenanceToggle.setActive(mode === "maintenance");
    updateDashboardVisibility();
    renderSidePanelContent(sidePanel, mode, { onImportSuccessRef, maintenanceFilterOptionsRef, operationOptionsRef });
    updateHeaderOperation();
    updateFabVisibility();
    if (typeof onModeChange === "function") {
      onModeChange(mode);
    }
    if (mode === "maintenance" || mode === "operation") {
      if (typeof onMapVisible === "function") {
        requestAnimationFrame(() => onMapVisible());
      }
    }
  }

  return {
    getMapContainer() {
      return mapContainer;
    },
    getDisruptionPanelHost() {
      return disruptionPanelHost;
    },
    getSidePanel() {
      return sidePanel;
    },
    getSheetHost() {
      return sheetHost;
    },
    getSnackbarHost() {
      return snackbarHost;
    },
    setGpsActive,
    setOnCenterOnMe,
    setMode,
    refreshSidePanel() {
      updateDashboardVisibility();
      renderSidePanelContent(sidePanel, currentMode, { onImportSuccessRef, maintenanceFilterOptionsRef, operationOptionsRef });
      updateHeaderOperation();
      updateFabVisibility();
    },
    updateHeaderOperation,
    showError(message) {
      // Minimal inline error for now; can be replaced with snackbar.
      // eslint-disable-next-line no-console
      console.error(message);
    },
  };
}

