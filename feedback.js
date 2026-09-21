/* ============================================================
   潘宜然 · 个人主页 V3.1 —— 反馈入口（前端 → Supabase 后台）
   ------------------------------------------------------------
   架构：GitHub Pages（静态页面） → 浏览器 → Supabase（后台 + 数据库）
   本文件只放「可公开」的配置。
   secret key / service_role key / 数据库密码 绝不能出现在前端。
   ============================================================ */
(function () {
  "use strict";

  /* ============================================================
     ① 配置区 —— 把 Supabase 项目里的两个值填到这里
        在 Supabase 控制台：Project Settings → API
        - Project URL       → 下面 SUPABASE_URL
        - publishable key   → 下面 SUPABASE_KEY（旧称 anon key，可公开）
     ============================================================ */
  var SUPABASE_URL = "https://cyjsttvgmfquhnrluvti.supabase.co";
  var SUPABASE_KEY = "sb_publishable_XMf36FlXFyW0QOZII6PjGg_qx9LECdI";
  var SITE_VERSION = "V3.2"; // 每条反馈自动附带，方便你区分是哪个版本收到的

  // 后台客户端库：优先用站点自带的副本（不依赖境外 CDN，国内访问更稳），
  // 万一本站文件缺失，再回退到 CDN。
  var LIB_LOCAL = "assets/supabase-js.min.js";
  var LIB_CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js";

  /* ============================================================
     ② 取元素
     ============================================================ */
  var fab = document.getElementById("fbFab");
  var modal = document.getElementById("fbModal");
  var form = document.getElementById("fbForm");
  var nameEl = document.getElementById("fbName");
  var relationEl = document.getElementById("fbRelation");
  var deviceEl = document.getElementById("fbDevice");
  var messageEl = document.getElementById("fbMessage");
  var countEl = document.getElementById("fbCount");
  var statusEl = document.getElementById("fbStatus");
  var submitBtn = document.getElementById("fbSubmit");
  var cancelBtn = document.getElementById("fbCancel");

  if (!fab || !modal || !form) return; // 页面没放反馈入口就安静退出

  var busy = false;
  var client = null;
  var clientLoading = null;
  var lastFocus = null;

  /* ============================================================
     ③ 小工具
     ============================================================ */
  function setStatus(kind, text) {
    if (!statusEl) return;
    statusEl.textContent = text || "";
    statusEl.className = "fb-status" + (kind ? " is-" + kind : "");
  }

  function updateCount() {
    if (countEl && messageEl) countEl.textContent = String(messageEl.value.length);
  }

  // 按访问设备预选设备类型（访客仍可自己改）
  function detectDevice() {
    var ua = navigator.userAgent || "";
    if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return "平板";
    if (/Mobi|Android|iPhone|iPod|Windows Phone/i.test(ua)) return "手机";
    if (/Windows|Macintosh|Linux|CrOS/i.test(ua)) return "电脑";
    return "其他";
  }

  // 动态插入一个 <script>
  function injectScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error("加载失败：" + src)); };
      document.head.appendChild(s);
    });
  }

  // 按需加载 Supabase 官方客户端库（保持纯静态，无需构建工具）
  function loadClient() {
    if (client) return Promise.resolve(client);
    if (clientLoading) return clientLoading;

    clientLoading = (function () {
      if (window.supabase && window.supabase.createClient) {
        client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        return Promise.resolve(client);
      }
      return injectScript(LIB_LOCAL)
        .catch(function () { return injectScript(LIB_CDN); })
        .then(function () {
          if (!window.supabase || !window.supabase.createClient) {
            throw new Error("后台客户端库加载异常，请刷新页面重试");
          }
          client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
          return client;
        });
    })();

    return clientLoading;
  }

  /* ============================================================
     ④ 开关弹窗
     ============================================================ */
  function openModal() {
    lastFocus = document.activeElement;
    modal.hidden = false;
    document.body.classList.add("fb-locked");
    if (deviceEl && !deviceEl.dataset.touched) deviceEl.value = detectDevice();
    setStatus("", "");
    window.setTimeout(function () {
      if (nameEl) nameEl.focus();
    }, 30);
  }

  function closeModal() {
    modal.hidden = true;
    document.body.classList.remove("fb-locked");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  fab.addEventListener("click", openModal);

  modal.addEventListener("click", function (e) {
    if (e.target.hasAttribute && e.target.hasAttribute("data-fb-close")) closeModal();
  });

  if (cancelBtn) cancelBtn.addEventListener("click", closeModal);

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !modal.hidden) closeModal();
  });

  if (deviceEl) {
    deviceEl.addEventListener("change", function () { deviceEl.dataset.touched = "1"; });
  }

  if (messageEl) {
    messageEl.addEventListener("input", updateCount);
    updateCount();
  }

  /* ============================================================
     ⑤ 提交
     ============================================================ */
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (busy) return; // 防止重复点击

    var message = (messageEl.value || "").trim();
    if (!message) {
      setStatus("err", "反馈内容还是空的，写一句也行。");
      messageEl.focus();
      return;
    }

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      setStatus("err", "反馈通道还没接通：需要先在 feedback.js 里填入 Supabase 的项目地址和 publishable key。");
      return;
    }

    busy = true;
    var oldLabel = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = "提交中…";
    setStatus("info", "正在提交，请稍等…");

    loadClient()
      .then(function (sb) {
        return sb.from("feedback").insert({
          name: (nameEl.value || "").trim() || null,
          relation: relationEl.value,
          device: deviceEl.value,
          message: message,
          version: SITE_VERSION
        });
      })
      .then(function (res) {
        if (res && res.error) throw res.error;
        // 只有后台真的写入成功，才提示成功
        form.reset();
        updateCount();
        setStatus("ok", "收到啦，谢谢你！这条反馈已经存进我的后台了。");
        window.setTimeout(closeModal, 2200);
      })
      .catch(function (err) {
        // 失败时保留已填内容，允许直接重试
        setStatus("err", "提交失败：" + ((err && err.message) ? err.message : "网络或后台异常") + "。内容已保留，可以直接重试。");
      })
      .then(function () {
        busy = false;
        submitBtn.disabled = false;
        submitBtn.textContent = oldLabel;
      });
  });
})();
