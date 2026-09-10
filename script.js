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
    var mid = window.innerHeight / 2;
    var best = 0;
    var bestDist = Infinity;
    stackItems.forEach(function (el, i) {
      var r = el.getBoundingClientRect();
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
    window.addEventListener(
      "scroll",
      function () {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () { syncPager(); ticking = false; });
      },
      { passive: true }
    );
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
