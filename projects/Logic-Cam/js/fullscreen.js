/** Native fullscreen where available, viewport-sized stage for iPhone/Safari. */
export class FullscreenStage {
  constructor(element, button, onResize = () => {}) {
    this.element = element;
    this.button = button;
    this.onResize = onResize;
    this.expanded = false;
    this.pending = false;
    button.addEventListener("click", () => this.toggle());
    document.addEventListener("fullscreenchange", () => {
      if (!document.fullscreenElement && this.expanded && !this.fallback)
        this.apply(false);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.expanded) {
        event.preventDefault();
        this.exit();
      }
    });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) this.onResize();
    });
    window.visualViewport?.addEventListener("resize", () => this.onResize());
  }
  apply(value) {
    this.expanded = value;
    this.element.classList.toggle("camera-fullscreen", value);
    document.body.classList.toggle("camera-expanded", value);
    const toast = document.getElementById("toast");
    if (toast) (value ? this.element : document.body).append(toast);
    this.button.setAttribute("aria-pressed", String(value));
    this.button.setAttribute(
      "aria-label",
      value ? "Vollbild beenden" : "Kamera im Vollbild",
    );
    this.button.title = value ? "Vollbild beenden" : "Vollbild";
    this.onResize();
    requestAnimationFrame(() => this.onResize());
  }
  async toggle() {
    if (this.pending) return;
    if (this.expanded) return this.exit();
    this.pending = true;
    this.fallback = true;
    this.apply(true);
    try {
      if (this.element.requestFullscreen) {
        await this.element.requestFullscreen({ navigationUI: "hide" });
        this.fallback = false;
      }
    } catch {
      /* Viewport-sized fallback remains useful when native fullscreen is unavailable. */
    } finally {
      this.pending = false;
      this.onResize();
    }
  }
  async exit() {
    if (this.pending) return;
    this.pending = true;
    try {
      if (document.fullscreenElement === this.element)
        await document.exitFullscreen();
    } catch {
      /* Always restore the page even if the browser exits fullscreen itself. */
    } finally {
      this.apply(false);
      this.pending = false;
      this.button.focus({ preventScroll: true });
    }
  }
}
