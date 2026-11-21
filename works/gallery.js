(() => {
  const panel = document.querySelector("#works");
  const play = document.querySelector("#preview-eruption");
  const preview = document.querySelector("#geyser-preview");
  if (!panel || !play || !preview) return;

  const feature = play.closest("article");
  const cover = preview.querySelector("img");
  const close = document.createElement("button");
  close.type = "button";
  close.className = "gallery-close";
  close.textContent = "关闭试玩";

  function end(focus = true) {
    feature.classList.remove("is-playing");
    preview.replaceChildren(cover);
    close.remove();
    if (focus) play.focus({preventScroll: true});
  }

  play.addEventListener("click", event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const scene = document.createElement("iframe");
    scene.title = "间歇泉果冻试玩";
    const url = new URL(play.href);
    url.searchParams.set("embed", "1");
    scene.src = url.href;
    feature.classList.add("is-playing");
    preview.replaceChildren(scene);
    play.after(close);
    close.focus({preventScroll: true});
    if (feature.getBoundingClientRect().top < panel.querySelector(".panel-bar").getBoundingClientRect().bottom) {
      feature.scrollIntoView({block: "start"});
    }
  });
  close.addEventListener("click", () => end());

  new MutationObserver(() => {
    if (!panel.classList.contains("open") && feature.classList.contains("is-playing")) end(false);
  }).observe(panel, {attributes: true, attributeFilter: ["class"]});
})();
