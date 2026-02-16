/**
 * Reusable Bottom Sheet UI component.
 * Mobile: slides up from bottom (50–70% height). Tablet: uses side panel area.
 * Dual-mode: VIEW (read-only + Edit/Delete) and EDIT (editable + Save/Cancel).
 */

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

function renderViewMode(location, callbacks, context = "maintenance") {
  const content = document.createElement("div");
  content.className = "bottom-sheet-content";
  const name = location.name != null ? String(location.name) : "—";
  const serviceFrequency = location.serviceFrequency != null ? String(location.serviceFrequency) : "—";
  const productType = location.productType != null ? String(location.productType) : "—";
  const notes = location.notes != null ? String(location.notes) : "—";
  const status = location.status != null ? String(location.status) : "—";

  const isOperation = context === "operation";
  const actionsHtml = isOperation
    ? `<div class="bottom-sheet-actions">
         <button type="button" class="bottom-sheet-btn bottom-sheet-btn-primary" data-action="mark-visited">Mark Visited</button>
       </div>`
    : `<div class="bottom-sheet-actions">
         <button type="button" class="bottom-sheet-btn bottom-sheet-btn-primary" data-action="edit">Edit</button>
         <button type="button" class="bottom-sheet-btn bottom-sheet-btn-primary" data-action="archive">Archive</button>
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
    ${actionsHtml}
  `;

  if (isOperation) {
    content.querySelector('[data-action="mark-visited"]')?.addEventListener("click", () => callbacks.onMarkVisited?.());
  } else {
    content.querySelector('[data-action="edit"]')?.addEventListener("click", () => callbacks.onEdit());
    content.querySelector('[data-action="archive"]')?.addEventListener("click", () => callbacks.onArchive());
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
 * @param {() => void} [options.onMarkVisited] - Called when Mark Visited is pressed (Operation mode)
 */
export function createBottomSheet(options) {
  const { sheetHost, sidePanel, onClose, onSave, onArchive, onDelete, onMarkVisited } = options;
  let currentWrapper = null;
  let usedTablet = false;
  let touchStartY = 0;
  let currentLocation = null;
  let mode = "view";
  let openContext = "maintenance";

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
      onArchive: () => {
        if (typeof onArchive === "function") onArchive(currentLocation);
        doClose();
      },
      onDelete: () => {
        if (typeof onDelete === "function") onDelete(currentLocation);
        doClose();
      },
      onMarkVisited: () => {
        if (typeof onMarkVisited === "function") onMarkVisited(currentLocation);
        doClose();
      },
    };
    const content = mode === "view"
      ? renderViewMode(currentLocation, callbacks, openContext)
      : renderEditMode({ ...currentLocation }, callbacks);
    contentSlot.appendChild(content);
  }

  /**
   * Open the bottom sheet with location details.
   * @param {object} location - { id, name, latitude, longitude, serviceFrequency, productType, notes, status }
   * @param {{ context?: 'maintenance'|'operation' }} [openOptions] - When context is 'operation', shows Mark Visited only.
   */
  function open(location, openOptions = {}) {
    if (!location || typeof location !== "object") return;

    currentLocation = { ...location };
    mode = "view";
    openContext = openOptions.context === "operation" ? "operation" : "maintenance";
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
