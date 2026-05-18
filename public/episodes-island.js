// Episodes filter island. Progressive enhancement — page works without JS.
(function () {
  const main = document.querySelector("main [data-island]");
  if (!main) return;

  const searchInput = document.getElementById("q");
  let debounce = 0;
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        const url = new URL(window.location.href);
        if (searchInput.value) url.searchParams.set("q", searchInput.value);
        else url.searchParams.delete("q");
        url.searchParams.delete("page");
        window.location.assign(url.toString());
      }, 350);
    });
  }

  // Sort select submits its enclosing form on change (already wired server-side).
  // Sidebar links and tag-cloud anchors are real hrefs — they navigate naturally.

  console.log("episodes island loaded");
})();
