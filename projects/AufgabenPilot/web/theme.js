(() => {
  const key = "appshelf-theme";
  const root = document.documentElement;
  const system = window.matchMedia("(prefers-color-scheme: dark)");
  const valid = (value) => value === "light" || value === "dark" ? value : null;
  let preference = null;
  try { preference = valid(localStorage.getItem(key)); } catch { /* Storage is optional. */ }

  const current = () => preference || (system.matches ? "dark" : "light");
  const render = () => {
    const theme = current();
    root.dataset.theme = theme;
    const button = document.getElementById("theme-toggle");
    if (button) {
      button.hidden = false;
      button.setAttribute("aria-pressed", String(theme === "dark"));
    }
  };

  // Run before the stylesheet so saved preferences apply on the first paint.
  render();
  const setup = () => {
    render();
    document.getElementById("theme-toggle")?.addEventListener("click", () => {
      preference = current() === "dark" ? "light" : "dark";
      try { localStorage.setItem(key, preference); } catch { /* Keep this page usable. */ }
      render();
    });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setup, { once: true });
  else setup();

  system.addEventListener("change", () => { if (!preference) render(); });
  window.addEventListener("storage", (event) => {
    if (event.key !== key && event.key !== null) return;
    preference = valid(event.newValue);
    render();
  });
})();
