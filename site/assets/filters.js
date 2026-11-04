const controls = document.querySelector("#catalog-filters");

if (controls) {
  const search = controls.elements.query;
  const category = controls.elements.category;
  const type = controls.elements.projectType;
  const sort = controls.elements.sort;
  const grid = document.querySelector("#app-grid");
  const cards = [...grid.children];
  const counter = document.querySelector("#catalog-count");
  const empty = document.querySelector("#empty-state");
  const collator = new Intl.Collator("de");
  const orders = {
    recent: cards,
    name: [...cards].sort((a, b) => collator.compare(a.dataset.name, b.dataset.name)),
    category: [...cards].sort((a, b) =>
      collator.compare(a.dataset.category, b.dataset.category) || collator.compare(a.dataset.name, b.dataset.name)),
  };

  function updateResults() {
    const terms = search.value.trim().toLocaleLowerCase("de").split(/\s+/).filter(Boolean);
    let visible = 0;
    for (const card of cards) {
      const matches = terms.every((term) => card.dataset.search.includes(term))
        && (!category.value || card.dataset.category === category.value)
        && (!type?.value || card.dataset.type === type.value);
      card.hidden = !matches;
      visible += Number(matches);
    }
    counter.textContent = visible === cards.length
      ? `${visible} ${visible === 1 ? "Projekt" : "Projekte"}`
      : `${visible} von ${cards.length} Projekten`;
    empty.hidden = visible > 0;
  }

  function applySort() {
    grid.append(...(orders[sort.value] || cards));
  }

  controls.addEventListener("submit", (event) => event.preventDefault());
  search.addEventListener("input", updateResults);
  category.addEventListener("change", updateResults);
  type?.addEventListener("change", updateResults);
  sort.addEventListener("change", applySort);
  document.querySelector("#reset-filters").addEventListener("click", () => {
    controls.reset();
    applySort();
    updateResults();
    search.focus();
  });
  window.addEventListener("pageshow", () => {
    if (sort.value !== "recent") applySort();
    updateResults();
  });
}
