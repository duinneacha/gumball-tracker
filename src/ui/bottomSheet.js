/**
 * Reusable Bottom Sheet UI component.
 * Mobile: slides up from bottom (50–70% height). Tablet: uses side panel area.
 * Displays arbitrary content; open/close programmatically with close control and swipe-down (mobile).
 */

const TABLET_BREAKPOINT_PX = 768;

function isTablet() {
  return typeof window !== "undefined" && window.matchMedia(`(min-width: ${TABLET_BREAKPOINT_PX}px)`).matches;
}

function renderLocationContent(location) {
  const fragment = document.createDocumentFragment();

  const header = document.createElement("div");
  header.className = "bottom-sheet-header";
  const title = document.createElement("h2");
  title.className = "bottom-sheet-title";
  title.textContent = "Location details";
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "bottom-sheet-close";
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.textContent = "×";
  header.appendChild(title);
  header.appendChild(closeBtn);

  const content = document.createElement("div");
  content.className = "bottom-sheet-content";
  const name = location.name != null ? String(location.name) : "—";
  const lat = location.latitude != null ? Number(location.latitude) : "";
  const lon = location.longitude != null ? Number(location.longitude) : "";
  const serviceFrequency = location.serviceFrequency != null ? String(location.serviceFrequency) : "—";
  const productType = location.productType != null ? String(location.productType) : "—";
  const status = location.status != null ? String(location.status) : "—";

  content.innerHTML = `
    <dl class="bottom-sheet-details">
      <dt>Name</dt><dd>${escapeHtml(name)}</dd>
      <dt>Latitude</dt><dd>${escapeHtml(String(lat))}</dd>
      <dt>Longitude</dt><dd>${escapeHtml(String(lon))}</dd>
      <dt>Service Frequency</dt><dd>${escapeHtml(serviceFrequency)}</dd>
      <dt>Product Type</dt><dd>${escapeHtml(productType)}</dd>
      <dt>Status</dt><dd>${escapeHtml(status)}</dd>
    </dl>
  `;

  fragment.appendChild(header);
  fragment.appendChild(content);
  return { fragment, closeBtn };
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/**
 * @param {object} options
 * @param {HTMLElement} options.sheetHost - Container for mobile sliding panel (e.g. bottom-sheet-host).
 * @param {HTMLElement} options.sidePanel - Side panel element for tablet layout.
 * @param {() => void} options.onClose - Called when sheet is closed (e.g. to restore side panel content).
 */
export function createBottomSheet(options) {
  const { sheetHost, sidePanel, onClose } = options;
  let currentWrapper = null;
  let usedTablet = false;
  let touchStartY = 0;

  function close() {
    const wrapper = currentWrapper;
    currentWrapper = null;
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
          if (wrapper.parentNode) {
            wrapper.remove();
          }
        },
        { once: true }
      );
    }
  }

  function setupCloseButton(closeBtn) {
    closeBtn.addEventListener("click", () => close());
  }

  function setupSwipeDown(wrapper) {
    wrapper.addEventListener(
      "touchstart",
      (e) => {
        touchStartY = e.touches[0].clientY;
      },
      { passive: true }
    );
    wrapper.addEventListener(
      "touchend",
      (e) => {
        const touchEndY = e.changedTouches[0].clientY;
        const delta = touchEndY - touchStartY;
        if (delta > 80) {
          close();
        }
      },
      { passive: true }
    );
  }

  /**
   * Open the bottom sheet with read-only location details.
   * @param {object} location - { id, name, latitude, longitude, serviceFrequency, productType, status }
   */
  function open(location) {
    if (!location || typeof location !== "object") return;

    usedTablet = isTablet();

    if (usedTablet) {
      sidePanel.innerHTML = "";
      const { fragment, closeBtn } = renderLocationContent(location);
      const wrapper = document.createElement("div");
      wrapper.className = "bottom-sheet bottom-sheet-tablet";
      wrapper.appendChild(fragment);
      sidePanel.appendChild(wrapper);
      currentWrapper = wrapper;
      setupCloseButton(closeBtn);
      return;
    }

    const { fragment, closeBtn } = renderLocationContent(location);
    const wrapper = document.createElement("div");
    wrapper.className = "bottom-sheet";
    wrapper.appendChild(fragment);
    sheetHost.innerHTML = "";
    sheetHost.appendChild(wrapper);
    currentWrapper = wrapper;
    setupCloseButton(closeBtn);
    setupSwipeDown(wrapper);
    requestAnimationFrame(() => {
      wrapper.classList.add("open");
    });
  }

  return {
    open,
    close,
  };
}
