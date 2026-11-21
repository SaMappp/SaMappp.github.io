(() => {
  const local = document.querySelector("[data-local-twin]");
  const publicEntry = document.querySelector("[data-public-twin]");
  if (local && publicEntry) {
    document.documentElement.dataset.homepageMode = "local";
    local.className = publicEntry.className;
    local.textContent = "进入本机演示";
    local.setAttribute("aria-label", local.textContent);
    publicEntry.replaceWith(local);
    document.querySelector("[data-twin-note]").textContent = "课堂演示连接当前电脑上的数字分身服务。";
    document.querySelector(".note-media video").hidden = true;
    document.querySelector(".local-note-still").hidden = false;
  }

  const links = Array.from(document.querySelectorAll(".site-nav [data-section]"));
  const sections = links.map(link => document.getElementById(link.hash.slice(1)));
  const header = document.querySelector(".site-header");
  let scheduled = false;
  function highlightSection() {
    scheduled = false;
    const line = header.offsetHeight + Math.min(110, window.innerHeight * .16);
    let current = -1;
    sections.forEach((section, index) => {
      if (section.getBoundingClientRect().top <= line) current = index;
    });
    links.forEach((link, index) => {
      if (index === current) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
  }
  function scheduleHighlight() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(highlightSection);
  }
  window.addEventListener("scroll", scheduleHighlight, {passive: true});
  window.addEventListener("resize", scheduleHighlight);
  window.addEventListener("pageshow", scheduleHighlight);
  window.addEventListener("hashchange", scheduleHighlight);
  function openLinkedNote() {
    const note = document.getElementById(window.location.hash.slice(1));
    if (note?.matches("details.note")) note.open = true;
  }
  window.addEventListener("hashchange", openLinkedNote);
  openLinkedNote();
  highlightSection();
})();
