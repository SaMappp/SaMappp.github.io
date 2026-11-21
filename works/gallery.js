(() => {
  const windowFrame = document.querySelector(".exhibit-frame");
  const pointerArea = windowFrame.closest(".exhibit");
  const allowTilt = matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)");
  let tiltRequest = 0;
  function resetTilt() {
    cancelAnimationFrame(tiltRequest);
    windowFrame.style.removeProperty("--turn-x");
    windowFrame.style.removeProperty("--turn-y");
  }
  pointerArea.addEventListener("pointermove", event => {
    if (!allowTilt.matches || event.pointerType !== "mouse") return;
    const {clientX, clientY} = event;
    cancelAnimationFrame(tiltRequest);
    tiltRequest = requestAnimationFrame(() => {
      const rect = pointerArea.getBoundingClientRect();
      const x = (clientX - rect.left) / rect.width - .5;
      const y = (clientY - rect.top) / rect.height - .5;
      windowFrame.style.setProperty("--turn-x", (-y * 4).toFixed(2) + "deg");
      windowFrame.style.setProperty("--turn-y", (x * 5).toFixed(2) + "deg");
    });
  });
  pointerArea.addEventListener("pointerleave", resetTilt);
  allowTilt.addEventListener?.("change", resetTilt);

  const play = document.querySelector("#preview-eruption");
  const dialog = document.querySelector("#geyser-dialog");
  const stage = document.querySelector("#geyser-preview");
  const status = document.querySelector("#preview-status");
  const close = document.querySelector("#close-preview");
  let frame, observer, timeout;

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
      if (!sceneDocument.body.classList.contains("drawer-open")) dialog.close();
    }, {capture: true});
    update();
  }

  play.addEventListener("click", event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey ||
        !dialog.showModal || location.protocol === "file:" ||
        document.documentElement.dataset.homepageMode === "local") return;
    event.preventDefault();
    if (dialog.open) return;
    resetTilt();
    dialog.showModal();
    document.body.classList.add("preview-open");
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

  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    if (dialog.open) return;
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
