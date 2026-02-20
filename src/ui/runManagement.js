/**
 * Run Management panel (PRD V2.3): create, edit, delete runs.
 * Renders into a host container; uses callbacks for all persistence.
 */

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Create the Run Management panel.
 * @param {HTMLElement} host - Container to render into
 * @param {object} options
 * @param {{ current: Array<{ id: string, name: string, locationCount: number }> }} options.runsRef - Ref to runs (updated by parent, panel re-renders)
 * @param {() => void} options.onClose - Close panel, return to map
 * @param {(name: string) => Promise<void>} options.onCreateRun
 * @param {(runId: string, newName: string) => Promise<void>} options.onUpdateRun
 * @param {(runId: string) => Promise<void>} options.onDeleteRun
 * @returns {{ render: () => void, destroy: () => void }}
 */
export function createRunManagementPanel(host, options) {
  const { runsRef = { current: [] }, onClose, onCreateRun, onUpdateRun, onDeleteRun } = options;
  let currentView = "list"; // "list" | "form" | "confirm"
  let formMode = "create"; // "create" | "edit"
  let editingRunId = null;
  let editingRunName = "";
  let editingRunColour = "#3b82f6";
  let confirmingRun = null;
  let panelEl = null;

  function renderList() {
    const listWrap = document.createElement("div");
    listWrap.className = "run-mgmt-list";

    const newBtn = document.createElement("button");
    newBtn.type = "button";
    newBtn.className = "run-mgmt-new-btn";
    newBtn.textContent = "+ New Run";
    newBtn.addEventListener("click", () => {
      formMode = "create";
      editingRunId = null;
      editingRunName = "";
      editingRunColour = "#3b82f6";
      currentView = "form";
      render();
    });
    listWrap.appendChild(newBtn);

    const runs = runsRef?.current ?? [];
    const ul = document.createElement("ul");
    ul.className = "run-mgmt-runs";
    if (runs.length === 0) {
      const li = document.createElement("li");
      li.className = "run-mgmt-empty";
      li.textContent = "No runs yet. Tap + New Run to create one.";
      ul.appendChild(li);
    } else {
      runs.forEach((run) => {
        const li = document.createElement("li");
        li.className = "run-mgmt-run-row";
        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "run-mgmt-icon-btn";
        editBtn.setAttribute("aria-label", `Edit ${escapeHtml(run.name ?? run.id)}`);
        editBtn.textContent = "\u270F\uFE0F";
        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "run-mgmt-icon-btn run-mgmt-icon-btn-danger";
        deleteBtn.setAttribute("aria-label", `Delete ${escapeHtml(run.name ?? run.id)}`);
        deleteBtn.textContent = "\uD83D\uDDD1\uFE0F";
        li.innerHTML = `
          <span class="run-mgmt-colour-swatch" style="background:${escapeHtml(run.colour ?? '#3b82f6')}"></span>
          <span class="run-mgmt-run-name">${escapeHtml(run.name ?? run.id)}</span>
          <span class="run-mgmt-run-count">${run.locationCount ?? 0}</span>
        `;
        li.appendChild(editBtn);
        li.appendChild(deleteBtn);
        editBtn.addEventListener("click", () => {
          formMode = "edit";
          editingRunId = run.id;
          editingRunName = run.name ?? run.id;
          editingRunColour = run.colour ?? "#3b82f6";
          currentView = "form";
          render();
        });
        deleteBtn.addEventListener("click", () => {
          confirmingRun = run;
          currentView = "confirm";
          render();
        });
        ul.appendChild(li);
      });
    }
    listWrap.appendChild(ul);
    return listWrap;
  }

  function renderForm() {
    const formWrap = document.createElement("div");
    formWrap.className = "run-mgmt-form-wrap";
    const title = formMode === "create" ? "New Run" : "Edit Run";
    formWrap.innerHTML = `
      <h3 class="run-mgmt-form-title">${escapeHtml(title)}</h3>
      <form class="run-mgmt-form">
        <label class="run-mgmt-field">
          <span class="run-mgmt-label">Run Name</span>
          <input type="text" name="runName" value="${escapeHtml(editingRunName)}" required autocomplete="off" />
        </label>
        <label class="run-mgmt-field">
          <span class="run-mgmt-label">Colour</span>
          <input type="color" name="runColour" value="${escapeHtml(editingRunColour)}" />
        </label>
        <div class="run-mgmt-form-actions">
          <button type="submit" class="run-mgmt-btn run-mgmt-btn-primary">Save</button>
          <button type="button" class="run-mgmt-btn run-mgmt-btn-secondary" data-action="cancel">Cancel</button>
        </div>
      </form>
    `;
    formWrap.querySelector("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = formWrap.querySelector('[name="runName"]')?.value?.trim();
      const colour = formWrap.querySelector('[name="runColour"]')?.value ?? editingRunColour;
      if (!name) return;
      try {
        if (formMode === "create") {
          await onCreateRun?.(name, colour);
        } else {
          await onUpdateRun?.(editingRunId, name, colour);
        }
        currentView = "list";
        editingRunId = null;
        editingRunName = "";
        editingRunColour = "#3b82f6";
        render();
      } catch (err) {
        // Caller may show snackbar; re-render to stay on form
        render();
      }
    });
    formWrap.querySelector('[data-action="cancel"]').addEventListener("click", () => {
      currentView = "list";
      editingRunId = null;
      editingRunName = "";
      editingRunColour = "#3b82f6";
      render();
    });
    return formWrap;
  }

  function renderConfirm() {
    const run = confirmingRun;
    if (!run) return document.createElement("div");
    const wrap = document.createElement("div");
    wrap.className = "run-mgmt-confirm";
    wrap.innerHTML = `
      <p class="run-mgmt-confirm-text">Delete "${escapeHtml(run.name ?? run.id)}"?</p>
      <p class="run-mgmt-confirm-sub">This will remove it from all assigned locations.</p>
      <div class="run-mgmt-confirm-actions">
        <button type="button" class="run-mgmt-btn run-mgmt-btn-secondary" data-action="cancel">Cancel</button>
        <button type="button" class="run-mgmt-btn run-mgmt-btn-danger" data-action="delete">Delete</button>
      </div>
    `;
    wrap.querySelector('[data-action="cancel"]').addEventListener("click", () => {
      confirmingRun = null;
      currentView = "list";
      render();
    });
    wrap.querySelector('[data-action="delete"]').addEventListener("click", async () => {
      try {
        await onDeleteRun?.(run.id);
        confirmingRun = null;
        currentView = "list";
        render();
      } catch (err) {
        render();
      }
    });
    return wrap;
  }

  function render() {
    if (!panelEl) return;
    const content = panelEl.querySelector(".run-mgmt-content");
    if (!content) return;
    content.innerHTML = "";
    if (currentView === "list") {
      content.appendChild(renderList());
    } else if (currentView === "form") {
      content.appendChild(renderForm());
    } else if (currentView === "confirm") {
      content.appendChild(renderConfirm());
    }
  }

  function init() {
    panelEl = document.createElement("div");
    panelEl.className = "run-mgmt-panel";
    panelEl.innerHTML = `
      <div class="run-mgmt-header">
        <h2 class="run-mgmt-title">Runs</h2>
        <button type="button" class="run-mgmt-close" aria-label="Close">×</button>
      </div>
      <div class="run-mgmt-content"></div>
    `;
    panelEl.querySelector(".run-mgmt-close").addEventListener("click", () => {
      if (typeof onClose === "function") onClose();
    });
    host.innerHTML = "";
    host.appendChild(panelEl);
    requestAnimationFrame(() => panelEl.classList.add("open"));
    render();
  }

  function destroy() {
    if (panelEl?.parentNode) {
      panelEl.classList.remove("open");
      panelEl.addEventListener("transitionend", () => panelEl?.remove(), { once: true });
    }
    host.innerHTML = "";
  }

  init();

  return {
    render() {
      render();
    },
    destroy,
  };
}
