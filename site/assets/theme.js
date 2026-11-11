(() => {
  const key = "patrice-web-theme";
  const root = document.documentElement;
  const system = matchMedia("(prefers-color-scheme: dark)");
  const meta = document.querySelector('meta[name="theme-color"]');
  let selector;
  let preference = "system";

  function apply(value) {
    preference = value === "light" || value === "dark" ? value : "system";
    root.dataset.theme = preference;
    const dark = preference === "dark" || (preference === "system" && system.matches);
    meta.content = dark ? meta.dataset.dark : meta.dataset.light;
    if (selector) selector.value = preference;
  }

  try {
    apply(localStorage.getItem(key));
  } catch {
    apply("system");
  }

  document.addEventListener("DOMContentLoaded", () => {
    selector = document.querySelector("[data-theme-select]");
    selector.value = preference;
    selector.hidden = false;
    selector.addEventListener("change", () => {
      apply(selector.value);
      try { localStorage.setItem(key, preference); } catch { /* Use the preference for this page. */ }
    });
  });
  window.addEventListener("storage", (event) => {
    if (event.key === key || event.key === null) apply(event.newValue);
  });
  system.addEventListener("change", () => apply(preference));
})();
