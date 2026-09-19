const THEME_STORAGE_KEY = "clintfintech-theme";

function systemTheme() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (_) {}
  const toggle = document.getElementById("themeToggle");
  if (toggle) {
    toggle.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
    toggle.title = theme === "dark" ? "Passer en mode clair" : "Passer en mode sombre";
    const icon = toggle.querySelector(".theme-toggle-icon");
    if (icon) icon.textContent = theme === "dark" ? "☀" : "☽";
  }
  window.dispatchEvent(new CustomEvent("themechange", { detail: { theme } }));
}

function initTheme() {
  let theme = systemTheme();
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "dark" || stored === "light") theme = stored;
  } catch (_) {}
  applyTheme(theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "light";
  applyTheme(current === "dark" ? "light" : "dark");
}

function initThemeToggle() {
  initTheme();
  const toggle = document.getElementById("themeToggle");
  if (toggle) toggle.onclick = toggleTheme;
}
