// 潘宜然 · 个人主页 V2 —— 粉紫樱花夜
(function () {
  "use strict";

  // ---------- 页脚年份 ----------
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // ---------- 滚动显示动画 ----------
  var revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add("visible");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("visible"); });
  }

  // ---------- 图片区进度条 + 左右切换 ----------
  var stackItems = Array.prototype.slice.call(document.querySelectorAll("[data-stack]"));
  var pagerFill = document.getElementById("pagerFill");
  var pagerCount = document.getElementById("pagerCount");
  var pagerPrev = document.getElementById("pagerPrev");
  var pagerNext = document.getElementById("pagerNext");
  // 这些图片现在位于「我的世界」面板内部，滚动的是 .panel-body 而不是整页
  var worldPanel = document.getElementById("world");
  var worldBody = worldPanel ? worldPanel.querySelector(".panel-body") : null;
  var current = 0;

  function renderPager() {
    var total = stackItems.length;
    if (!total) return;
    if (pagerCount) pagerCount.textContent = (current + 1) + " / " + total;
    if (pagerFill) pagerFill.style.width = (((current + 1) / total) * 100) + "%";
    if (pagerPrev) pagerPrev.disabled = current <= 0;
    if (pagerNext) pagerNext.disabled = current >= total - 1;
  }

  function syncPager() {
    if (!stackItems.length) return;
    // 基准线：面板内滚动时取面板可视区中线，退回整页时取视口中线
    var mid;
    if (worldBody && worldBody.clientHeight) {
      var br = worldBody.getBoundingClientRect();
      mid = br.top + br.height / 2;
    } else {
      mid = window.innerHeight / 2;
    }
    var best = 0;
    var bestDist = Infinity;
    stackItems.forEach(function (el, i) {
      var r = el.getBoundingClientRect();
      if (!r.height && !r.width) return; // 面板未展开时跳过
      var d = Math.abs((r.top + r.bottom) / 2 - mid);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    if (best !== current) { current = best; renderPager(); }
  }

  function goToCard(i) {
    if (i < 0 || i >= stackItems.length) return;
    current = i;
    renderPager();
    stackItems[i].scrollIntoView({ behavior: "smooth", block: "center" });
  }

  if (stackItems.length) {
    renderPager();
    if (pagerPrev) pagerPrev.addEventListener("click", function () { goToCard(current - 1); });
    if (pagerNext) pagerNext.addEventListener("click", function () { goToCard(current + 1); });

    var ticking = false;
    var onScroll = function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () { syncPager(); ticking = false; });
    };
    // 主要监听面板内部滚动；同时保底监听整页滚动
    if (worldBody) worldBody.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  // ---------- 求学经历：滚动点亮左侧时间轴圆点 ----------
  // 面板内滚到哪一所学校，哪个圆点亮起 + 竖线填充到该点，其余圆点熄灭。
  var tlItems = Array.prototype.slice.call(document.querySelectorAll("[data-tl]"));
  var tlFill = document.getElementById("tlFill");
  var tlRail = document.querySelector(".tl-rail");
  var eduPanel = document.getElementById("edu");
  var eduBody = eduPanel ? eduPanel.querySelector(".panel-body") : null;
  var tlActive = -1;

  function updateRailFill() {
    if (!tlFill || !tlRail || tlActive < 0) return;
    var el = tlItems[tlActive];
    if (!el) return;
    var dot = el.querySelector(".tl-dot");
    if (!dot) return;
    var railRect = tlRail.getBoundingClientRect();
    var dotRect = dot.getBoundingClientRect();
    if (!railRect.height || !dotRect.height) return; // 面板未展开
    var h = dotRect.top + dotRect.height / 2 - railRect.top;
    if (h < 0) h = 0;
    if (h > railRect.height) h = railRect.height;
    tlFill.style.height = h + "px";
  }

  function setTimelineActive(idx) {
    if (idx === tlActive) { updateRailFill(); return; }
    tlActive = idx;
    tlItems.forEach(function (el, i) {
      el.classList.toggle("is-active", i === idx);
    });
    updateRailFill();
  }

  function syncTimeline() {
    if (!tlItems.length || !eduBody) return;
    var br = eduBody.getBoundingClientRect();
    if (!br.height) return; // 面板未展开
    var refLine = br.top + br.height * 0.45; // 视觉基准线：略低于面板中线
    var best = 0;
    var bestDist = Infinity;
    tlItems.forEach(function (el, i) {
      var r = el.getBoundingClientRect();
      if (!r.height) return;
      var d = Math.abs(r.top + r.height / 2 - refLine);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    setTimelineActive(best);
  }

  if (tlItems.length && eduBody) {
    var tlTicking = false;
    eduBody.addEventListener(
      "scroll",
      function () {
        if (tlTicking) return;
        tlTicking = true;
        requestAnimationFrame(function () { syncTimeline(); tlTicking = false; });
      },
      { passive: true }
    );
    window.addEventListener("resize", updateRailFill, { passive: true });
  }

  // ---------- 入口页 ↔ 全屏面板 ----------
  // 面板由 CSS 的 :target 先兜底（禁用 JS 也能展开），JS 再接管：
  // 补上「关闭」、Esc、浏览器后退、焦点与滚动复位。
  // 面板之间可以互相跳转（例如「关于我」/「关于学习」→「我的作品」），
  // 所以右上角 ✕ 与左上角 🏠 的语义不同：✕ 只退一层，🏠 才无条件回首页。
  var PANEL_IDS = ["about", "world", "works", "edu", "skills", "study", "contact"];
  var PANEL_ALIAS = { work: "world" }; // 兼容旧的 #work 链接
  var panelEls = {};
  PANEL_IDS.forEach(function (id) { panelEls[id] = document.getElementById(id); });

  // ---------- 面板标题：打开时一个字一个字「敲」出来 ----------
  // 每个字先在原位乱跳几帧再定型，光标始终跟在已出现的文字后面；
  // 全部出现后撤掉光标（光标显隐由 CSS 的 .is-typing 控制）。
  // 乱码用全角片假名池：和中文等宽，跳动时字位不会左右串。
  var SCRAMBLE_CHARS =
    "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン";
  var reduceMotion = !!(
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  var titleItems = {};
  PANEL_IDS.forEach(function (id) {
    var panel = panelEls[id];
    if (!panel) return;
    var t = panel.querySelector(".panel-t");
    if (!t) return;
    // 顺手把 HTML 源码里的换行缩进清掉，之后才能安全地逐字替换
    var text = (t.textContent || "").replace(/\s+/g, " ").trim();
    if (!text) return;
    t.textContent = text;
    titleItems[id] = { el: t, text: text, timer: null };
  });

  function scrambleTitle(id) {
    var item = titleItems[id];
    if (!item) return;
    if (item.timer) { clearInterval(item.timer); item.timer = null; }

    var el = item.el;
    var target = item.text;
    var len = target.length;

    // 尊重系统「减少动态效果」：直接给完整文字，不出现光标
    if (reduceMotion || !len) {
      el.textContent = target;
      el.classList.remove("is-typing");
      return;
    }

    var TICK = 60;  // 每帧 60ms
    var FLICK = 6;  // 每个字先在原位乱跳 6 帧（≈0.36s）再定型
    var done = 0;   // 已经定型、稳定显示的字数
    var flick = 0;  // 当前这个字已经跳了几帧

    function paint() {
      // 定型的字照写；正在生成的那一个位置显示乱码，其余还没有位置留空
      var out = target.slice(0, done);
      if (done < len) {
        out += SCRAMBLE_CHARS.charAt(Math.floor(Math.random() * SCRAMBLE_CHARS.length));
      }
      el.textContent = out;
    }

    el.classList.add("is-typing"); // 光标只在打字期间显示
    paint();

    item.timer = setInterval(function () {
      if (done >= len) {
        // 文字全部出现：收回光标，并强制写回准确文案
        clearInterval(item.timer);
        item.timer = null;
        el.textContent = target;
        el.classList.remove("is-typing");
        return;
      }
      flick++;
      if (flick >= FLICK) { flick = 0; done++; }
      paint();
    }, TICK);
  }

  var lastFocus = null;
  var hasOpenPanel = PANEL_IDS.some(function (id) { return !!panelEls[id]; });

  // ---------- 面板层级（用来区分 ✕ 与 🏠） ----------
  // panelStack 记录「一次打开到底」依次经过的面板：
  //   首页 → 我的作品              → ["works"]            ✕ 退到首页（上一层就是首页）
  //   首页 → 关于我 → 我的作品     → ["about","works"]     ✕ 退到「关于我」，🏠 回首页
  // 这里不用 history.back() 判断层级：直接访问 / 刷新带 #xxx 的地址时，
  // 浏览器历史里没有可回退的条目，back() 会空转。
  var panelStack = [];
  var panelScroll = {};      // 每个面板离开时滚到哪儿了，返回那一层时还原
  var skipTitleOnce = false; // 「返回上一层」不再重放标题打字动画

  function trackPanel(id) {
    var at = panelStack.indexOf(id);
    if (at >= 0) panelStack.length = at + 1; // 退回链上已有的一层，丢掉它后面的
    else panelStack.push(id);                // 第一次打开的新一层
  }

  function currentOpenId() {
    for (var i = 0; i < PANEL_IDS.length; i++) {
      var el = panelEls[PANEL_IDS[i]];
      if (el && el.classList.contains("open")) return PANEL_IDS[i];
    }
    return "";
  }

  // 直接显示完整标题（返回上一层时用，免得像"重新打开"一样再打一遍字）
  function showTitleNow(id) {
    var item = titleItems[id];
    if (!item) return;
    if (item.timer) { clearInterval(item.timer); item.timer = null; }
    item.el.textContent = item.text;
    item.el.classList.remove("is-typing");
  }

  function resolvePanelId() {
    var h = (window.location.hash || "").replace(/^#/, "");
    if (PANEL_ALIAS[h]) h = PANEL_ALIAS[h];
    return panelEls[h] ? h : "";
  }

  function openPanel(id) {
    var target = panelEls[id];
    if (!target) return;

    // 切走之前，先记住当前这一层滚到哪儿了
    var leaving = currentOpenId();
    if (leaving && leaving !== id) {
      var leavingBody = panelEls[leaving].querySelector(".panel-body");
      if (leavingBody) panelScroll[leaving] = leavingBody.scrollTop;
    }

    trackPanel(id);

    PANEL_IDS.forEach(function (key) {
      var el = panelEls[key];
      if (!el) return;
      if (key === id) el.classList.add("open");
      else el.classList.remove("open");
    });
    document.body.classList.add("panel-open");

    // 从首页新进来的面板回到顶部；「返回上一层」则还原它离开时的位置
    var body = target.querySelector(".panel-body");
    if (body) body.scrollTop = panelScroll[id] || 0;

    if (skipTitleOnce) { skipTitleOnce = false; showTitleNow(id); }
    else scrambleTitle(id); // 标题乱码打字
    if (id === "world") requestAnimationFrame(syncPager);
    if (id === "edu") requestAnimationFrame(syncTimeline);

    var x = target.querySelector(".panel-x");
    if (x) x.focus({ preventScroll: true });
  }

  function closePanel() {
    PANEL_IDS.forEach(function (key) {
      var el = panelEls[key];
      if (el) el.classList.remove("open");
    });
    document.body.classList.remove("panel-open");
    panelStack.length = 0;   // 回首页了：层级与记住的滚动位置一起清空
    panelScroll = {};
    skipTitleOnce = false;
    if (lastFocus && typeof lastFocus.focus === "function") {
      lastFocus.focus({ preventScroll: true });
    }
  }

  function syncPanel() {
    var id = resolvePanelId();
    if (id) openPanel(id);
    else closePanel();
  }

  function closeFromButton() {
    // 不能依赖 history.back()：直接访问/刷新带 #xxx 的地址时，历史里没有可回退的条目，
    // back() 会空转，面板就关不掉。这里改成确定性地关面板 + 清掉 hash。
    closePanel();
    if (window.location.hash) {
      try {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      } catch (err) {
        // file:// 下 replaceState 可能被拒，退回直接清 hash（会触发一次 hashchange，无副作用）
        window.location.hash = "";
      }
    }
  }

  // 右上角 ✕ / Esc：只退回上一层，不回首页（左上角 🏠 才是无条件回首页）
  function goBackFromPanel() {
    if (panelStack.length <= 1) {
      // 链上只有当前这一层，说明是从首页直接进来的 → 它的上一层就是首页
      closeFromButton();
      return;
    }
    panelStack.pop();       // 先降一层；hashchange 回来时它会被认成「链上已有的一层」
    skipTitleOnce = true;   // 返回上一层，不重放标题打字
    window.history.back();  // 本会话内发生过面板间跳转，历史里一定有可回退的前一条
  }

  if (hasOpenPanel) {
    if (window.location.hash) syncPanel();

    window.addEventListener("hashchange", function () {
      syncPanel();
    });

    document.addEventListener("click", function (e) {
      var node = e.target;
      while (node && node.nodeType === 1) {
        // data-close（右上角 ✕）只退回上一层；data-home（左上角房子）无条件回初始页
        if (node.hasAttribute && node.hasAttribute("data-close")) {
          e.preventDefault();
          goBackFromPanel();
          return;
        }
        if (node.hasAttribute && node.hasAttribute("data-home")) {
          e.preventDefault();
          closeFromButton();
          return;
        }
        var href = node.getAttribute ? node.getAttribute("href") : null;
        if (href && href.charAt(0) === "#" && node.tagName === "A") {
          lastFocus = node; // 记住从哪个入口进来的，关闭时把焦点还回去
          break;
        }
        node = node.parentNode;
      }
    });

    document.addEventListener("keydown", function (e) {
      // Esc 与右上角 ✕ 一致：只退一层（要直接回首页用左上角 🏠）
      if (e.key === "Escape" && document.body.classList.contains("panel-open")) {
        e.preventDefault();
        goBackFromPanel();
      }
    });
  }

  // ---------- 极淡星光粒子 ----------
  var canvas = document.getElementById("stardust");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");
  var W, H, particles = [];
  var COLORS = ["255, 180, 210", "255, 143, 184", "180, 140, 255", "200, 220, 255", "255, 255, 255"];
  var COUNT = 60;

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  window.addEventListener("resize", resize);
  resize();

  function init() {
    particles = [];
    for (var i = 0; i < COUNT; i++) {
      particles.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.8 + 0.4,
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.22,
        a: Math.random() * 0.3 + 0.08,
        tw: Math.random() * 0.012 + 0.003,
        c: COLORS[Math.floor(Math.random() * COLORS.length)]
      });
    }
  }
  init();

  function draw() {
    ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      p.x += p.vx; p.y += p.vy; p.a += p.tw;
      if (p.a > 0.45 || p.a < 0.06) p.tw *= -1;
      if (p.x < -5) p.x = W + 5;
      if (p.x > W + 5) p.x = -5;
      if (p.y < -5) p.y = H + 5;
      if (p.y > H + 5) p.y = -5;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(" + p.c + ", " + p.a + ")";
      ctx.shadowColor = "rgba(" + p.c + ", 0.7)";
      ctx.shadowBlur = 6;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    requestAnimationFrame(draw);
  }
  draw();
})();
