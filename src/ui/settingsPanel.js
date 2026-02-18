/**
 * Settings panel (PRD V2.10): Auto Check-In enable, proximity, dwell time.
 */

/**
 * @param {HTMLElement} host - overlay container (e.g. settings-host)
 * @param {{
 *   initialSettings: { enabled: boolean, proximityMeters: number, dwellSeconds: number },
 *   onSave: (settings: object) => Promise<void>,
 *   onClose: () => void
 * }} options
 * @returns {{ destroy: () => void, setSettings: (s: object) => void }}
 */
export function createSettingsPanel(host, options) {
  const { initialSettings, onSave, onClose } = options;
  let currentSettings = {
    enabled: Boolean(initialSettings?.enabled),
    proximityMeters: clamp(Number(initialSettings?.proximityMeters) || 50, 20, 200),
    dwellSeconds: clamp(Number(initialSettings?.dwellSeconds) || 30, 5, 120),
  };

  host.setAttribute("aria-hidden", "false");
  host.innerHTML = "";

  const overlay = document.createElement("div");
  overlay.className = "settings-panel-overlay";
  overlay.setAttribute("aria-label", "Settings overlay");

  const panel = document.createElement("div");
  panel.className = "settings-panel";

  const header = document.createElement("div");
  header.className = "settings-panel-header";
  const title = document.createElement("h2");
  title.className = "settings-panel-title";
  title.textContent = "Settings";
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "settings-panel-close";
  closeBtn.setAttribute("aria-label", "Close settings");
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", () => onClose());
  header.appendChild(title);
  header.appendChild(closeBtn);

  const section = document.createElement("div");
  section.className = "settings-section";
  section.innerHTML = "<h3 class=\"settings-section-title\">Auto Check-In</h3>";

  const enableWrap = document.createElement("label");
  enableWrap.className = "settings-row settings-row-toggle";
  const enableCheck = document.createElement("input");
  enableCheck.type = "checkbox";
  enableCheck.checked = currentSettings.enabled;
  enableCheck.addEventListener("change", () => {
    currentSettings.enabled = enableCheck.checked;
  });
  const enableLabel = document.createElement("span");
  enableLabel.textContent = "Enable Auto Check-In";
  enableWrap.appendChild(enableCheck);
  enableWrap.appendChild(enableLabel);
  section.appendChild(enableWrap);

  const proximityRow = document.createElement("div");
  proximityRow.className = "settings-row";
  proximityRow.innerHTML = "<label>Proximity (m)</label>";
  const proximityWrap = document.createElement("div");
  proximityWrap.className = "settings-input-row";
  const proximityInput = document.createElement("input");
  proximityInput.type = "number";
  proximityInput.min = 20;
  proximityInput.max = 200;
  proximityInput.value = currentSettings.proximityMeters;
  proximityInput.addEventListener("input", () => {
    currentSettings.proximityMeters = clamp(parseInt(proximityInput.value, 10) || 50, 20, 200);
    proximityInput.value = currentSettings.proximityMeters;
  });
  const proximityDown = document.createElement("button");
  proximityDown.type = "button";
  proximityDown.textContent = "−";
  proximityDown.addEventListener("click", () => {
    currentSettings.proximityMeters = Math.max(20, currentSettings.proximityMeters - 10);
    proximityInput.value = currentSettings.proximityMeters;
  });
  const proximityUp = document.createElement("button");
  proximityUp.type = "button";
  proximityUp.textContent = "+";
  proximityUp.addEventListener("click", () => {
    currentSettings.proximityMeters = Math.min(200, currentSettings.proximityMeters + 10);
    proximityInput.value = currentSettings.proximityMeters;
  });
  proximityWrap.appendChild(proximityDown);
  proximityWrap.appendChild(proximityInput);
  proximityWrap.appendChild(proximityUp);
  proximityRow.appendChild(proximityWrap);
  section.appendChild(proximityRow);

  const dwellRow = document.createElement("div");
  dwellRow.className = "settings-row";
  dwellRow.innerHTML = "<label>Dwell time (sec)</label>";
  const dwellWrap = document.createElement("div");
  dwellWrap.className = "settings-input-row";
  const dwellInput = document.createElement("input");
  dwellInput.type = "number";
  dwellInput.min = 5;
  dwellInput.max = 120;
  dwellInput.value = currentSettings.dwellSeconds;
  dwellInput.addEventListener("input", () => {
    currentSettings.dwellSeconds = clamp(parseInt(dwellInput.value, 10) || 30, 5, 120);
    dwellInput.value = currentSettings.dwellSeconds;
  });
  const dwellDown = document.createElement("button");
  dwellDown.type = "button";
  dwellDown.textContent = "−";
  dwellDown.addEventListener("click", () => {
    currentSettings.dwellSeconds = Math.max(5, currentSettings.dwellSeconds - 5);
    dwellInput.value = currentSettings.dwellSeconds;
  });
  const dwellUp = document.createElement("button");
  dwellUp.type = "button";
  dwellUp.textContent = "+";
  dwellUp.addEventListener("click", () => {
    currentSettings.dwellSeconds = Math.min(120, currentSettings.dwellSeconds + 5);
    dwellInput.value = currentSettings.dwellSeconds;
  });
  dwellWrap.appendChild(dwellDown);
  dwellWrap.appendChild(dwellInput);
  dwellWrap.appendChild(dwellUp);
  dwellRow.appendChild(dwellWrap);
  section.appendChild(dwellRow);

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "settings-save-btn";
  saveBtn.textContent = "Save";
  saveBtn.addEventListener("click", async () => {
    const s = { ...currentSettings };
    try {
      await onSave(s);
      onClose();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("Save settings failed", e);
    }
  });

  panel.appendChild(header);
  panel.appendChild(section);
  panel.appendChild(saveBtn);
  overlay.appendChild(panel);
  host.appendChild(overlay);

  const onBackdrop = (e) => {
    if (e.target === overlay) onClose();
  };
  overlay.addEventListener("click", onBackdrop);

  function destroy() {
    overlay.removeEventListener("click", onBackdrop);
    host.innerHTML = "";
    host.setAttribute("aria-hidden", "true");
  }

  function setSettings(s) {
    if (!s) return;
    currentSettings = {
      enabled: Boolean(s.enabled),
      proximityMeters: clamp(Number(s.proximityMeters) || 50, 20, 200),
      dwellSeconds: clamp(Number(s.dwellSeconds) || 30, 5, 120),
    };
    enableCheck.checked = currentSettings.enabled;
    proximityInput.value = currentSettings.proximityMeters;
    dwellInput.value = currentSettings.dwellSeconds;
  }

  return { destroy, setSettings };
}

function clamp(val, min, max) {
  if (Number.isNaN(val)) return min;
  return Math.max(min, Math.min(max, val));
}
