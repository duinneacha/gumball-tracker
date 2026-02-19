/**
 * Reusable Bottom Sheet UI component.
 * Mobile: slides up from bottom (50–70% height). Tablet: uses side panel area.
 * Dual-mode: VIEW (read-only + Edit/Delete) and EDIT (editable + Save/Cancel).
 * Maintenance: Previous/Next replace Archive for location navigation.
 */

import { haversineKm } from "../utils/geo.js";

const TABLET_BREAKPOINT_PX = 768;
const SERVICE_FREQUENCIES = ["weekly", "fortnightly", "monthly", "adhoc"];

function isTablet() {
  return typeof window !== "undefined" && window.matchMedia(`(min-width: ${TABLET_BREAKPOINT_PX}px)`).matches;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function renderViewMode(location, callbacks, context = "maintenance", runsOptions = null, operationOptions = null) {
  const content = document.createElement("div");
  content.className = "bottom-sheet-content";
  const name = location.name != null ? String(location.name) : "—";
  const serviceFrequency = location.serviceFrequency != null ? String(location.serviceFrequency) : "—";
  const productType = location.productType != null ? String(location.productType) : "—";
  const notes = location.notes != null ? String(location.notes) : "—";
  const status = location.status != null ? String(location.status) : "—";

  const isOperation = context === "operation";
  const isDisruption = context === "disruption";
  const isReadOnlyWithMarkVisited = isOperation || isDisruption;
  const isVisited = operationOptions?.isVisited === true;
  const showRunsSection = context === "maintenance" && runsOptions && Array.isArray(runsOptions.runs) && runsOptions.runs.length > 0;

  let runsSectionHtml = "";
  if (showRunsSection) {
    const runs = runsOptions.runs;
    const selectedSet = runsOptions.selectedRunIds instanceof Set
      ? runsOptions.selectedRunIds
      : new Set(Array.isArray(runsOptions.selectedRunIds) ? runsOptions.selectedRunIds : []);
    const runItems = runs.map((run) => {
      const checked = selectedSet.has(run.id);
      return `<label class="bottom-sheet-run-item"><input type="checkbox" data-run-id="${escapeHtml(run.id)}" ${checked ? "checked" : ""} /><span>${escapeHtml(run.name ?? run.id)}</span></label>`;
    }).join("");
    runsSectionHtml = `
      <div class="bottom-sheet-runs-section">
        <h3 class="bottom-sheet-runs-title">Runs</h3>
        <div class="bottom-sheet-runs-list">${runItems}</div>
      </div>
    `;
  }

  const hasNav = context === "maintenance" && runsOptions?.allLocations?.length > 0 && typeof runsOptions?.onNavigateToLocation === "function";
  const actionsHtml = isReadOnlyWithMarkVisited
    ? `<div class="bottom-sheet-actions">
         ${isVisited
      ? '<button type="button" class="bottom-sheet-btn bottom-sheet-btn-unvisited" data-action="mark-unvisited">Mark Unvisited</button>'
      : '<button type="button" class="bottom-sheet-btn bottom-sheet-btn-primary" data-action="mark-visited">Mark Visited</button>'}
         ${isDisruption ? '<button type="button" class="bottom-sheet-btn bottom-sheet-btn-secondary" data-action="back">Back</button>' : ""}
       </div>`
    : `<div class="bottom-sheet-actions">
         <button type="button" class="bottom-sheet-btn bottom-sheet-btn-primary" data-action="edit">Edit</button>
         ${hasNav ? '<button type="button" class="bottom-sheet-btn bottom-sheet-btn-secondary" data-action="prev">Previous</button><button type="button" class="bottom-sheet-btn bottom-sheet-btn-secondary" data-action="next">Next</button>' : ""}
         <button type="button" class="bottom-sheet-btn bottom-sheet-btn-danger" data-action="delete">Delete</button>
       </div>`;

  content.innerHTML = `
    <dl class="bottom-sheet-details">
      <dt>Name</dt><dd>${escapeHtml(name)}</dd>
      <dt>Service Frequency</dt><dd>${escapeHtml(serviceFrequency)}</dd>
      <dt>Product Type</dt><dd>${escapeHtml(productType)}</dd>
      <dt>Notes</dt><dd>${escapeHtml(notes)}</dd>
      <dt>Status</dt><dd>${escapeHtml(status)}</dd>
    </dl>
    ${runsSectionHtml}
    ${actionsHtml}
  `;

  if (showRunsSection && typeof runsOptions.onRunToggle === "function") {
    const localSelected = new Set(
      runsOptions.selectedRunIds instanceof Set ? runsOptions.selectedRunIds : (runsOptions.selectedRunIds || [])
    );
    content.querySelectorAll(".bottom-sheet-run-item input[data-run-id]").forEach((cb) => {
      cb.addEventListener("change", () => {
        const runId = cb.getAttribute("data-run-id");
        const checked = cb.checked;
        if (checked) localSelected.add(runId);
        else localSelected.delete(runId);
        runsOptions.onRunToggle(runId, checked);
      });
    });
  }

  if (isReadOnlyWithMarkVisited) {
    content.querySelector('[data-action="mark-visited"]')?.addEventListener("click", () => callbacks.onMarkVisited?.());
    content.querySelector('[data-action="mark-unvisited"]')?.addEventListener("click", () => callbacks.onMarkUnvisited?.());
    content.querySelector('[data-action="back"]')?.addEventListener("click", () => callbacks.onBack?.());
  } else {
    content.querySelector('[data-action="edit"]')?.addEventListener("click", () => callbacks.onEdit());
    content.querySelector('[data-action="prev"]')?.addEventListener("click", () => callbacks.onPrevious?.());
    content.querySelector('[data-action="next"]')?.addEventListener("click", () => callbacks.onNext?.());
    content.querySelector('[data-action="delete"]')?.addEventListener("click", () => callbacks.onDelete());
  }
  return content;
}

function renderEditMode(draftLocation, callbacks) {
  const content = document.createElement("div");
  content.className = "bottom-sheet-content";
  const name = draftLocation.name != null ? String(draftLocation.name) : "";
  const serviceFrequency = draftLocation.serviceFrequency != null && SERVICE_FREQUENCIES.includes(draftLocation.serviceFrequency)
    ? draftLocation.serviceFrequency
    : "adhoc";
  const productType = draftLocation.productType != null ? String(draftLocation.productType) : "";
  const notes = draftLocation.notes != null ? String(draftLocation.notes) : "";

  const options = SERVICE_FREQUENCIES.map(
    (f) => `<option value="${escapeHtml(f)}"${f === serviceFrequency ? " selected" : ""}>${escapeHtml(f)}</option>`
  ).join("");

  content.innerHTML = `
    <form class="bottom-sheet-form">
      <label class="bottom-sheet-field">
        <span class="bottom-sheet-label">Name</span>
        <input type="text" name="name" value="${escapeHtml(name)}" required autocomplete="off" />
      </label>
      <label class="bottom-sheet-field">
        <span class="bottom-sheet-label">Service Frequency</span>
        <select name="serviceFrequency">
          ${options}
        </select>
      </label>
      <label class="bottom-sheet-field">
        <span class="bottom-sheet-label">Product Type</span>
        <input type="text" name="productType" value="${escapeHtml(productType)}" autocomplete="off" />
      </label>
      <label class="bottom-sheet-field">
        <span class="bottom-sheet-label">Notes</span>
        <textarea name="notes" rows="3">${escapeHtml(notes)}</textarea>
      </label>
      <div class="bottom-sheet-actions">
        <button type="submit" class="bottom-sheet-btn bottom-sheet-btn-primary">Save</button>
        <button type="button" class="bottom-sheet-btn bottom-sheet-btn-secondary" data-action="cancel">Cancel</button>
      </div>
    </form>
  `;

  content.querySelector("form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const form = e.target;
    const nameVal = (form.querySelector('[name="name"]')?.value ?? "").trim();
    if (!nameVal) return;
    const updated = {
      ...draftLocation,
      name: nameVal,
      serviceFrequency: form.querySelector('[name="serviceFrequency"]')?.value ?? "adhoc",
      productType: (form.querySelector('[name="productType"]')?.value ?? "").trim(),
      notes: (form.querySelector('[name="notes"]')?.value ?? "").trim(),
    };
    callbacks.onSave(updated);
  });
  content.querySelector('[data-action="cancel"]')?.addEventListener("click", () => callbacks.onCancel());
  return content;
}

function renderHeader(closeBtn) {
  const header = document.createElement("div");
  header.className = "bottom-sheet-header";
  header.innerHTML = `
    <h2 class="bottom-sheet-title">Location details</h2>
  `;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "bottom-sheet-close";
  btn.setAttribute("aria-label", "Close");
  btn.textContent = "×";
  header.appendChild(btn);
  if (closeBtn) closeBtn(btn);
  return header;
}

/**
 * @param {object} options
 * @param {HTMLElement} options.sheetHost - Container for mobile sliding panel
 * @param {HTMLElement} options.sidePanel - Side panel element for tablet layout
 * @param {() => void} options.onClose - Called when sheet is closed
 * @param {(location: object) => void} [options.onSave] - Called with updated location on Save
 * @param {(location: object) => void} [options.onArchive] - Called with location on Archive
 * @param {(location: object) => void} [options.onDelete] - Called with location on Delete
 * @param {(location: object) => void} [options.onMarkVisited] - Called when Mark Visited is pressed (Operation mode)
 * @param {(location: object) => void} [options.onMarkUnvisited] - Called when Mark Unvisited is pressed (Operation mode, PRD V2.5)
 */
export function createBottomSheet(options) {
  const { sheetHost, sidePanel, onClose, onSave, onArchive, onDelete, onMarkVisited, onMarkUnvisited } = options;
  let currentWrapper = null;
  let usedTablet = false;
  let touchStartY = 0;
  let currentLocation = null;
  let mode = "view";
  let openContext = "maintenance";
  let openRunsOptions = null;
  let openOperationOptions = null;

  function doClose() {
    const wrapper = currentWrapper;
    currentWrapper = null;
    currentLocation = null;
    mode = "view";
    if (!wrapper) return;
    if (usedTablet) {
      sidePanel.innerHTML = "";
      if (typeof onClose === "function") {
        onClose();
      }
    } else {
      wrapper.classList.remove("open");
      wrapper.addEventListener(
        "transitionend",
        () => {
          if (wrapper.parentNode) wrapper.remove();
        },
        { once: true }
      );
      if (typeof onClose === "function") {
        onClose();
      }
    }
  }

  function setupCloseButton(closeBtn) {
    closeBtn.addEventListener("click", () => doClose());
  }

  function setupSwipeDown(wrapper) {
    wrapper.addEventListener("touchstart", (e) => { touchStartY = e.touches[0].clientY; }, { passive: true });
    wrapper.addEventListener("touchend", (e) => {
      const delta = e.changedTouches[0].clientY - touchStartY;
      if (delta > 80) doClose();
    }, { passive: true });
  }

  function renderContentArea() {
    const contentSlot = currentWrapper?.querySelector(".bottom-sheet-content-slot");
    if (!contentSlot || !currentLocation) return;
    contentSlot.innerHTML = "";
    const callbacks = {
      onEdit: () => {
        mode = "edit";
        renderContentArea();
      },
      onCancel: () => {
        mode = "view";
        renderContentArea();
      },
      onSave: (updated) => {
        if (typeof onSave === "function") onSave(updated);
        currentLocation = updated;
        mode = "view";
        renderContentArea();
      },
      onPrevious: () => {
        const list = openRunsOptions?.allLocations;
        const nav = openRunsOptions?.onNavigateToLocation;
        if (!Array.isArray(list) || list.length === 0 || typeof nav !== "function") return;
        const idx = list.findIndex((loc) => loc.id === currentLocation?.id);
        if (idx > 0) nav(list[idx - 1]);
      },
      onNext: () => {
        const list = openRunsOptions?.allLocations;
        const nav = openRunsOptions?.onNavigateToLocation;
        if (!Array.isArray(list) || list.length === 0 || typeof nav !== "function") return;
        const cur = currentLocation;
        if (cur?.latitude == null || cur?.longitude == null) return;
        let nearest = null;
        let nearestDist = Infinity;
        for (const loc of list) {
          if (loc.id === cur.id) continue;
          const d = haversineKm(cur.latitude, cur.longitude, loc.latitude, loc.longitude);
          if (d < nearestDist) {
            nearestDist = d;
            nearest = loc;
          }
        }
        if (nearest) nav(nearest);
      },
      onDelete: () => {
        if (typeof onDelete === "function") onDelete(currentLocation);
        doClose();
      },
      onMarkVisited: () => {
        if (typeof onMarkVisited === "function") onMarkVisited(currentLocation);
        doClose();
      },
      onMarkUnvisited: () => {
        if (typeof onMarkUnvisited === "function") onMarkUnvisited(currentLocation);
        doClose();
      },
      onBack: () => doClose(),
    };
    const content = mode === "view"
      ? renderViewMode(currentLocation, callbacks, openContext, openRunsOptions, openOperationOptions)
      : renderEditMode({ ...currentLocation }, callbacks);
    contentSlot.appendChild(content);
  }

  /**
   * Open the bottom sheet with location details.
   * @param {object} location - { id, name, latitude, longitude, serviceFrequency, productType, notes, status }
   * @param {{ context?: 'maintenance'|'operation'|'disruption', runs?: object[], selectedRunIds?: Set<string>|string[], onRunToggle?: (runId: string, checked: boolean) => void, isVisited?: boolean }} [openOptions]
   */
  function open(location, openOptions = {}) {
    if (!location || typeof location !== "object") return;

    currentLocation = { ...location };
    mode = "view";
    openContext = openOptions.context === "operation" ? "operation" : (openOptions.context === "disruption" ? "disruption" : "maintenance");
    openOperationOptions = (openContext === "operation" || openContext === "disruption") ? { isVisited: openOptions.isVisited } : null;
    openRunsOptions = openContext === "maintenance" ? {
      runs: openOptions.runs || [],
      selectedRunIds: openOptions.selectedRunIds instanceof Set ? openOptions.selectedRunIds : new Set(openOptions.selectedRunIds || []),
      onRunToggle: openOptions.onRunToggle,
      allLocations: Array.isArray(openOptions.allLocations) ? openOptions.allLocations : [],
      onNavigateToLocation: typeof openOptions.onNavigateToLocation === "function" ? openOptions.onNavigateToLocation : undefined,
    } : null;
    usedTablet = isTablet();

    const contentSlot = document.createElement("div");
    contentSlot.className = "bottom-sheet-content-slot";

    const wrapper = document.createElement("div");
    wrapper.className = usedTablet ? "bottom-sheet bottom-sheet-tablet" : "bottom-sheet";
    wrapper.appendChild(renderHeader((btn) => setupCloseButton(btn)));
    wrapper.appendChild(contentSlot);

    if (usedTablet) {
      sidePanel.innerHTML = "";
      sidePanel.appendChild(wrapper);
    } else {
      sheetHost.innerHTML = "";
      sheetHost.appendChild(wrapper);
      setupSwipeDown(wrapper);
      requestAnimationFrame(() => wrapper.classList.add("open"));
    }

    currentWrapper = wrapper;
    renderContentArea();
  }

  return {
    open,
    close: doClose,
  };
}
