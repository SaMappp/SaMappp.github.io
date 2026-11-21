(() => {
  const root = document.documentElement;
  const stage = document.querySelector(".island-scene");
  const image = stage.querySelector(".island-still");
  const toggle = document.querySelector("#motion-toggle");
  const dialog = document.querySelector("#geyser-dialog");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const compact = matchMedia("(max-width: 700px), (pointer: coarse)");
  const TAU = Math.PI * 2;
  const clamp = (value, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, value));
  let override = null;
  let running = !reduced.matches;
  root.dataset.motion = running ? "running" : "paused";

  if (!window.IntersectionObserver || !window.ResizeObserver || !window.Path2D) return;
  const surfaces = Array.from(document.querySelectorAll("canvas[data-atmosphere]"), canvas => ({
    canvas, ctx: canvas.getContext("2d"), kind: canvas.dataset.atmosphere,
    time: 0, visible: false, resize: true, dirty: true, w: 0, h: 0
  })).filter(surface => surface.ctx);
  if (!surfaces.length) return;

  function texture(rgb) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "rgba(" + rgb + ",1)");
    gradient.addColorStop(.36, "rgba(" + rgb + ",.64)");
    gradient.addColorStop(.68, "rgba(" + rgb + ",.23)");
    gradient.addColorStop(1, "rgba(" + rgb + ",0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    return canvas;
  }
  const textures = {
    violet: texture("183,104,255"), blue: texture("83,135,255"), cyan: texture("105,231,238"),
    rose: texture("231,134,242"), steam: texture("220,241,243"), hot: texture("255,140,95")
  };

  function glow(ctx, name, x, y, w, h, opacity) {
    ctx.globalAlpha = clamp(opacity);
    ctx.drawImage(textures[name], x - w / 2, y - h / 2, w, h);
    ctx.globalAlpha = 1;
  }

  function makePath(points) {
    const path = new Path2D();
    points.forEach(([x, y], index) => {
      if (index === 0) path.moveTo(x,y);
      else path.lineTo(x,y);
    });
    path.closePath();
    return path;
  }

  const waterMask = new Path2D();
  waterMask.addPath(makePath([[193,354],[355,239],[423,195],[464,165],[403,250],[350,276],[345,323],[373,349],[428,371],[494,383],[473,412],[579,435],[675,463],[729,434],[752,379],[803,349],[849,264],[853,224],[928,245],[910,315],[708,660],[207,424]]));

  let art;
  function prepareIsland() {
    const values = getComputedStyle(image).getPropertyValue("--island-outline");
    const points = Array.from(values.matchAll(/([\d.]+)%\s+([\d.]+)%/g),
      ([,x,y]) => [Number(x) * 11.2, Number(y) * 7.2]);
    if (points.length < 3 || !image.naturalWidth) return;
    art = document.createElement("canvas");
    art.width = 1120;
    art.height = 720;
    const ctx = art.getContext("2d");
    ctx.clip(makePath(points));
    ctx.drawImage(image, 0, 0, art.width, art.height);
    surfaceFor("island").dirty = true;
    queueFrame();
  }

  const surfaceByCanvas = new Map(surfaces.map(surface => [surface.canvas, surface]));
  const surfaceFor = kind => surfaces.find(surface => surface.kind === kind);

  const heroPointer = {x: .52, y: .47, targetX: .52, targetY: .47};
  let press, pulseTime = -100, modalAge = 2;
  const touches = [];
  let frame = 0, previous = 0, paintedAt = 0;

  stage.addEventListener("pointermove", event => {
    if (!running || event.pointerType !== "mouse") return;
    const rect = stage.getBoundingClientRect();
    heroPointer.targetX = clamp((event.clientX - rect.left) / rect.width);
    heroPointer.targetY = clamp((event.clientY - rect.top) / rect.height);
  }, {passive: true});
  stage.addEventListener("pointerleave", () => {
    heroPointer.targetX = .52;
    heroPointer.targetY = .47;
  });
  stage.addEventListener("pointerdown", event => {
    press = {id: event.pointerId, x: event.clientX, y: event.clientY};
  }, {passive: true});
  stage.addEventListener("pointerup", event => {
    const pending = press;
    press = undefined;
    if (!running || !pending || pending.id !== event.pointerId ||
        Math.hypot(event.clientX - pending.x, event.clientY - pending.y) > 15) return;
    const rect = stage.getBoundingClientRect();
    const scene = surfaceFor("island");
    if (!scene || !rect.width || !rect.height) return;
    const x = clamp((event.clientX - rect.left) / rect.width);
    const y = clamp((event.clientY - rect.top) / rect.height);
    heroPointer.targetX = x;
    heroPointer.targetY = y;
    touches.push({x, y, start: scene.time});
    if (touches.length > 3) touches.shift();
  }, {passive: true});
  stage.addEventListener("pointercancel", () => { press = undefined; });

  function ring(ctx,x,y,r,flatten,opacity,color) {
    ctx.strokeStyle = color;
    ctx.globalAlpha = clamp(opacity);
    ctx.lineWidth = Math.max(1, r * .010);
    ctx.beginPath();
    ctx.ellipse(x,y,r,Math.max(1,r * flatten),0,0,TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function ribbon(ctx, w, h, time, base, amplitude, width, opacity, phase, swap) {
    const gradient = ctx.createLinearGradient(0,0,w,0);
    gradient.addColorStop(0, "#8cb0ff00");
    gradient.addColorStop(.24, swap ? "#69cfff" : "#ad7bff");
    gradient.addColorStop(.56, swap ? "#a98cff" : "#68caff");
    gradient.addColorStop(.8, "#c98df9");
    gradient.addColorStop(1, "#9acfff00");
    ctx.strokeStyle = gradient;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const u = i / 24;
      const y = h * (base + Math.sin(u * 7.7 + time * .73 + phase) * amplitude + Math.sin(u * 14 - time * .39) * amplitude * .31);
      if (i === 0) ctx.moveTo(0, y);
      else ctx.lineTo(u * w, y);
    }
    ctx.globalAlpha = opacity * .19;
    ctx.lineWidth = width * 1.9;
    ctx.stroke();
    ctx.globalAlpha = opacity * .34;
    ctx.lineWidth = width * .76;
    ctx.stroke();
    ctx.globalAlpha = opacity;
    ctx.lineWidth = Math.max(1, width * .084);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawSteam(ctx, time, x, y, strength, phase) {
    const count = compact.matches ? 5 : 8;
    for (let i = 0; i < count; i++) {
      const age = (time * .39 + i / count + phase) % 1;
      const sx = x + 57 * age + Math.sin(age * 9 + time * 1.1 + i) * (5 + age * 20);
      const sy = y - 125 * age;
      const opacity = Math.sin(age * Math.PI) * (1 - age * .53) * strength;
      glow(ctx, i % 3 === 0 ? "blue" : "steam", sx, sy, 25 + 118 * age, 29 + 85 * age, opacity);
    }
  }

  function drawWater(ctx, time) {
    ctx.save();
    ctx.clip(waterMask);
    const count = compact.matches ? 22 : 38;
    for (let i = 0; i < count; i++) {
      const x = 171 + ((i * 191.27 + time * (39 + i % 7)) % 753);
      const y = 216 + (i * 139.73 % 412) + Math.sin(time * 1.8 + i) * 11;
      ctx.globalAlpha = .22 + .19 * Math.sin(i * .38 + time * 1.6) ** 2;
      ctx.strokeStyle = i % 3 ? "#c0f8ee" : "#dbb7ff";
      ctx.lineWidth = 1.4 + (i % 4) * .45;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + 12, y - 5, x + 36, y + 8, x + 63, y + 6);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawIsland(surface, delta) {
    const {ctx, w, h, time} = surface;
    const follow = delta ? 1 - Math.exp(-delta * 6) : 0;
    heroPointer.x += (heroPointer.targetX - heroPointer.x) * follow;
    heroPointer.y += (heroPointer.targetY - heroPointer.y) * follow;
    const dx = heroPointer.x - .52, dy = heroPointer.y - .47;
    const s = Math.min(w * .92 / 735, h * .80 / 582);
    const opened = !running && time === 0 ? 1 : Math.min(1, time / 1.05);
    const ease = 1 - (1 - opened) ** 3;

    // The same sky lights feed the water and the drift in front of the island.
    const spotlight = w * (.52 + dx * .39 + Math.sin(time * .73) * .15);
    glow(ctx, "violet", spotlight, h * (.38 + dy * .35), w * .96, h * 1.03, .41 + .14 * Math.sin(time * 1.25));
    glow(ctx, "blue", w * (.70 - dx * .24), h * (.64 + .10 * Math.sin(time * .87)), w * .8, h * .66, .47);
    glow(ctx, "cyan", w * (.52 + dx * .18), h * .78, w * .69, h * .30, .40);
    ribbon(ctx,w,h,time,.30,.078,h * .056,.50,0,false);
    ribbon(ctx,w,h,time + .55,.46,.112,h * .057,.42,1.8,true);
    ribbon(ctx,w,h,time,.18,.065,h * .034,.37,3.2,false);

    for (let i = 0; i < 3; i++) {
      ring(ctx, w * .52 - dx * 16, h * (.80 + i * .032), w * (.23 + i * .105 + Math.sin(time * .68 + i) * .016),
        .22, .22 - i * .038, i === 0 ? "#ae99ff" : "#83dbee");
    }

    if (art) {
      const artScale = s * (.983 + ease * .017);
      const x = w * .514 - 560 * artScale - dx * w * .046;
      const y = h * .495 - 375 * artScale + Math.sin(time * 1.15) * h * .011 - dy * h * .038;
      const burst = clamp(1 - (time - pulseTime) / 1.25);
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(artScale, artScale);
      glow(ctx, "cyan", 602, 540, 820, 330, .32);
      ctx.globalAlpha = .77 + .23 * ease;
      ctx.drawImage(art, 0, 0);
      ctx.globalAlpha = 1;
      drawWater(ctx, time);
      glow(ctx, "hot", 511, 137, 110 + 23 * Math.sin(time * 1.84), 100, .26 + .14 * Math.sin(time * 1.52));
      drawSteam(ctx, time, 548, 99, .51, .17);
      drawSteam(ctx, time, 593, 239, .44 + burst * .20, .53);
      glow(ctx, "cyan", 588, 234, 124 + 21 * Math.sin(time * 2.1), 84, .35 + burst * .27);

      ctx.fillStyle = "#d0fff7";
      const droplets = compact.matches ? 14 : 24;
      for (let i = 0; i < droplets; i++) {
        const age = (time * (1.25 + (i % 5) * .12) + i / droplets) % 1;
        const x = 588 - age * 31 + Math.sin(i * 8.4) * (2 + age * 17);
        const y = 232 - age * (205 + i % 5 * 11) + 45 * age ** 3;
        ctx.globalAlpha = Math.sin(age * Math.PI) * (.32 + (i % 3) * .18);
        ctx.fillRect(x, y, 1.3 + i % 3, 3 + i % 4);
      }
      ctx.globalAlpha = 1;

      const cinders = compact.matches ? 12 : 22;
      for (let i = 0; i < cinders; i++) {
        const age = (time * (.27 + (i % 5) * .022) + i * .213) % 1;
        const ex = 523 + age * (52 + i * 7) + Math.sin(i * 4.6 + time) * (9 + age * 20);
        const ey = 125 + i % 7 * 8 - age * (93 + i % 6 * 18);
        glow(ctx, "hot", ex, ey, 5 + i % 5, 8 + i % 6, Math.sin(age * Math.PI) ** 2 * .86);
      }
      ctx.restore();
      if (!stage.hasAttribute("data-painted")) stage.dataset.painted = "";
    }

    const mistCount = compact.matches ? 7 : 11;
    for (let i = 0; i < mistCount; i++) {
      const drift = (time * .112 + i / mistCount) % 1;
      const x = w * (-.25 + 1.5 * drift) + dx * w * .14;
      const y = h * (.76 + .075 * Math.sin(i * 2.33 + time * .64)) + dy * h * .09;
      glow(ctx, i % 2 ? "violet" : "blue", x, y, w * (.38 + (i % 4) * .056), h * (.12 + i % 3 * .039),
        Math.sin(drift * Math.PI) * (.29 + (i % 3) * .06));
    }
    ribbon(ctx,w,h,time + 1.5,.82,.045,h * .034,.48,1.2,true);

    if (Math.abs(dx) + Math.abs(dy) > .026) {
      glow(ctx, "violet", heroPointer.x * w, heroPointer.y * h, w * .63, h * .68, .28);
      glow(ctx, "cyan", heroPointer.x * w, heroPointer.y * h, w * .21, h * .23, .23);
    }
    while (touches.length && time - touches[0].start > 1.2) touches.shift();
    for (const ripple of touches) {
      const age = clamp((time - ripple.start) / 1.2);
      glow(ctx, "cyan", ripple.x * w, ripple.y * h, w * .42, h * .38, (1 - age) * .73);
      ring(ctx, ripple.x * w, ripple.y * h, w * (.025 + age * .44), .58, (1 - age) * .83, "#aafcf1");
      ring(ctx, ripple.x * w, ripple.y * h, w * (.018 + age * .27), .66, (1 - age) * .56, "#e6a6ff");
    }
  }

  function drawEdges(surface) {
    const {ctx, w, h, kind, time} = surface;
    const water = kind === "water", night = kind === "night";
    const edge = Math.min(w * (compact.matches ? .21 : .196), water ? 270 : 220);
    const strength = water ? .28 : night ? .26 : .18;
    const color = water ? "#439dbe" : night ? "#ad67d3" : "#a46aba";
    const reflection = water ? "#7bd6e2" : "#81accf";
    for (let side = 0; side < 2; side++) {
      ctx.save();
      if (side) { ctx.translate(w, 0); ctx.scale(-1, 1); }
      const flow = side ? -time : time;
      const extent = Math.min(h, water ? 410 : 350);
      for (let i = 0; i < (compact.matches ? 7 : 10); i++) {
        const x = edge * (.12 + (i % 4) * .14);
        ctx.beginPath();
        for (let y = -10; y <= h + 28; y += 19) {
          const px = x + edge * (.16 * Math.sin(y * .015 + flow * .71 + i * .52) + .11 * Math.sin(y * .031 - flow * .98 + i));
          if (y === -10) ctx.moveTo(px,y);
          else ctx.lineTo(px,y);
        }
        ctx.strokeStyle = i % 3 === 0 ? reflection : color;
        ctx.globalAlpha = strength * (.63 + .28 * Math.sin(flow + i * .36) ** 2);
        ctx.lineWidth = i % 4 === 0 ? 4 : 1.4;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      for (let i = 0; i < 3; i++) {
        const y = ((i * h / 3 + flow * 30) % h + h) % h;
        glow(ctx, water ? "cyan" : "violet", edge * .18, y, edge * 2, extent, strength * .67);
      }
      ctx.restore();
    }
    if (water) ribbon(ctx,w,Math.min(h,260),time,.21,.12,23,.29,.4,true);
  }

  function drawBurst(surface) {
    const {ctx,w,h} = surface;
    if (modalAge >= 1.2) return;
    const age = clamp(modalAge / 1.2), fade = (1 - age) ** 1.35;
    const x = w * .475, y = h * .49;
    const scale = Math.min(w,h);
    glow(ctx, "cyan", x, y, scale * (1.30 + age), scale * (.70 + age), fade * .46);
    glow(ctx, "rose", x, y * .79, scale * .62, scale * .82, fade * .30);
    glow(ctx, "steam", x, y - h * (.095 + age * .16), scale * (.15 + age * .17), h * .40, fade * .74);
    for (let i = 0; i < 3; i++) {
      const p = clamp(age * 1.5 - i * .19);
      ring(ctx,x,y,scale * (.08 + p * .64),.49, fade * (.95 - i * .20), i === 1 ? "#f0afd9" : "#a4f7e7");
    }
  }

  function fit(surface) {
    const bounds = surface.canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return false;
    const limit = compact.matches ? 1.10 : 1.40;
    const budget = compact.matches ? 590000 : 1390000;
    const ratio = Math.min(window.devicePixelRatio || 1, limit, Math.sqrt(budget / (bounds.width * bounds.height)));
    surface.w = bounds.width;
    surface.h = bounds.height;
    surface.canvas.width = Math.max(1, Math.round(surface.w * ratio));
    surface.canvas.height = Math.max(1, Math.round(surface.h * ratio));
    surface.ctx.setTransform(surface.canvas.width / surface.w,0,0,surface.canvas.height / surface.h,0,0);
    surface.resize = false;
    return true;
  }

  function active(surface) {
    if (!running || !surface.visible) return false;
    return surface.kind === "burst" ? dialog.open && modalAge < 1.2 : !dialog.open;
  }
  function needsFrame(surface) {
    return surface.visible && (surface.dirty || active(surface));
  }
  function queueFrame() {
    if (!frame && !document.hidden && surfaces.some(needsFrame)) frame = requestAnimationFrame(draw);
  }
  function stopFrame() {
    cancelAnimationFrame(frame);
    frame = 0;
    previous = 0;
    paintedAt = 0;
  }
  function draw(now) {
    frame = 0;
    if (document.hidden) return;
    const interval = compact.matches ? 1000 / 30 : 1000 / 42;
    const elapsed = previous ? now - previous : interval;
    const dirty = surfaces.some(surface => surface.visible && surface.dirty);
    if (elapsed + .2 < interval && !dirty) { queueFrame(); return; }
    previous = now - Math.max(0, elapsed % interval);
    const delta = Math.min(.075, (paintedAt ? now - paintedAt : interval) / 1000);
    paintedAt = now;
    for (const surface of surfaces) {
      if (!needsFrame(surface)) continue;
      if (surface.resize && !fit(surface)) { surface.dirty = false; continue; }
      const advancing = active(surface);
      if (advancing) surface.time += delta;
      surface.ctx.clearRect(0,0,surface.w,surface.h);
      if (surface.kind === "island") drawIsland(surface, advancing ? delta : 0);
      else if (surface.kind === "burst") {
        if (advancing) modalAge += delta;
        drawBurst(surface);
      } else drawEdges(surface);
      surface.dirty = false;
    }
    if (surfaces.some(needsFrame)) queueFrame();
    else previous = paintedAt = 0;
  }

  const visibility = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const surface = surfaceByCanvas.get(entry.target);
      surface.visible = entry.isIntersecting && entry.intersectionRect.width > 0 && entry.intersectionRect.height > 0;
      if (surface.visible) surface.dirty = true;
    }
    if (!surfaces.some(needsFrame)) stopFrame();
    else queueFrame();
  });
  const resize = new ResizeObserver(entries => {
    for (const entry of entries) {
      const surface = surfaceByCanvas.get(entry.target);
      surface.resize = surface.dirty = true;
    }
    queueFrame();
  });
  for (const surface of surfaces) {
    visibility.observe(surface.canvas);
    resize.observe(surface.canvas);
  }

  function setMotion() {
    running = override ?? !reduced.matches;
    root.dataset.motion = running ? "running" : "paused";
    toggle.textContent = running ? "暂停动效" : "开启动效";
    if (!running) stopFrame();
    queueFrame();
  }
  toggle.hidden = false;
  toggle.addEventListener("click", () => { override = !running; setMotion(); });
  reduced.addEventListener?.("change", () => { override = null; setMotion(); });
  compact.addEventListener?.("change", () => {
    surfaces.forEach(surface => { surface.resize = surface.dirty = true; });
    queueFrame();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopFrame();
    else queueFrame();
  });
  window.addEventListener("exhibit:erupt", () => {
    if (!running) return;
    const island = surfaceFor("island");
    if (island) pulseTime = island.time;
    const burst = surfaceFor("burst");
    if (burst && dialog.open) {
      modalAge = 0;
      burst.dirty = true;
      if (fit(burst)) {
        burst.ctx.clearRect(0,0,burst.w,burst.h);
        drawBurst(burst);
      }
    }
    queueFrame();
  });
  dialog.addEventListener("close", () => {
    modalAge = 2;
    queueFrame();
  });
  if (surfaceFor("island")) {
    if (image.complete) prepareIsland();
    else image.addEventListener("load", prepareIsland, {once: true});
  }
  setMotion();
})();
