(function () {
  const THEME_KEY = "testergizer.theme";

  const THEMES = [
    { id: "default", name: "Default" },
    { id: "dark", name: "Dark" },
    { id: "high-contrast", name: "High Contrast" }
  ];

  const linkEl = document.getElementById("tg-theme");
  const selectEl = document.getElementById("tg-theme-select");

  if (!linkEl || !selectEl) return;

  function setTheme(id) {
    linkEl.href = linkEl.href.replace(/themes\/[^/]+\/theme\.css$/, `themes/${id}/theme.css`);
    localStorage.setItem(THEME_KEY, id);
  }

  THEMES.forEach(t => {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.name;
    selectEl.appendChild(opt);
  });

  const saved = localStorage.getItem(THEME_KEY);
  if (saved && THEMES.some(t => t.id === saved)) {
    selectEl.value = saved;
    setTheme(saved);
  } else {
    selectEl.value = "default";
  }

  selectEl.addEventListener("change", () => setTheme(selectEl.value));
})();