(() => {
  const play = document.querySelector("#preview-eruption");
  const dialog = document.querySelector("#geyser-dialog");
  const stage = document.querySelector("#geyser-preview");
  const status = document.querySelector("#preview-status");
  const close = document.querySelector("#close-preview");
  let frame, observer, timeout, closingTimer;

  function closePreview() {
    if (!dialog.open || dialog.hasAttribute("data-closing")) return;
    if (document.documentElement.dataset.motion !== "running" || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      dialog.close();
      return;
    }
    dialog.dataset.closing = "";
    closingTimer = setTimeout(() => dialog.close(), 175);
  }

  function clearFrame() {
    clearTimeout(timeout);
    observer?.disconnect();
    observer = undefined;
    frame?.remove();
    frame = undefined;
  }

  function showStill(message) {
    clearFrame();
    stage.dataset.mode = "still";
    status.textContent = message;
    if (document.activeElement === document.body) close.focus({preventScroll: true});
  }

  function observeScene(scene) {
    const sceneDocument = scene.contentDocument;
    const engine = sceneDocument?.getElementById("status");
    if (!engine) {
      showStill("互动场景暂时无法加载。可以先看场景预览，或尝试打开完整场景。");
      return;
    }
    const update = () => {
      if (frame !== scene) return;
      if (engine.dataset.state === "unavailable") {
        showStill("当前设备无法运行 WebGPU，先看看喷发画面。");
      } else if (engine.dataset.state === "live" || engine.dataset.state === "paused") {
        clearTimeout(timeout);
        stage.dataset.mode = "live";
        status.textContent = "场景已就绪。拖动海面，或甩一下观鲸船。";
        scene.removeAttribute("tabindex");
        scene.removeAttribute("aria-hidden");
      }
    };
    observer = new MutationObserver(update);
    observer.observe(engine, {attributes: true, attributeFilter: ["data-state"]});
    sceneDocument.addEventListener("keydown", event => {
      if (event.key !== "Escape" || !dialog.open) return;
      event.preventDefault();
      if (!sceneDocument.body.classList.contains("drawer-open")) closePreview();
    }, {capture: true});
    update();
  }

  play.addEventListener("click", event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey ||
        !dialog.showModal || location.protocol === "file:" ||
        document.documentElement.dataset.homepageMode === "local") return;
    event.preventDefault();
    if (dialog.open) return;
    dialog.showModal();
    document.body.classList.add("preview-open");
    window.dispatchEvent(new Event("exhibit:erupt"));
    if (!navigator.gpu) {
      showStill("当前设备无法运行 WebGPU，先看看喷发画面。");
      return;
    }

    stage.dataset.mode = "loading";
    status.textContent = "正在唤醒间歇泉…";
    const url = new URL(play.href);
    url.searchParams.set("embed", "1");
    const scene = document.createElement("iframe");
    scene.title = "间歇泉果冻互动试玩";
    scene.tabIndex = -1;
    scene.setAttribute("aria-hidden", "true");
    frame = scene;
    scene.addEventListener("load", () => {
      if (frame === scene) observeScene(scene);
    }, {once: true});
    scene.addEventListener("error", () => {
      if (frame === scene) showStill("互动场景暂时无法加载，可以先看场景预览。");
    }, {once: true});
    scene.src = url.href;
    stage.append(scene);
    timeout = setTimeout(() => {
      if (frame === scene) showStill("加载时间较长，可以先看场景预览，或尝试打开完整场景。");
    }, 14000);
  });

  close.addEventListener("click", closePreview);
  dialog.addEventListener("cancel", event => {
    event.preventDefault();
    closePreview();
  });
  dialog.addEventListener("close", () => {
    if (dialog.open) return;
    clearTimeout(closingTimer);
    delete dialog.dataset.closing;
    clearFrame();
    stage.dataset.mode = "still";
    status.textContent = "";
    document.body.classList.remove("preview-open");
    play.focus({preventScroll: true});
  });
  window.addEventListener("pagehide", () => {
    clearFrame();
    if (dialog.open) dialog.close();
  });
})();
