// Vibe Coding 个人主页 V1 —— 交互脚本
(function () {
  "use strict";

  // 页脚年份自动更新
  document.getElementById("year").textContent = new Date().getFullYear();

  // 平滑滚动由 CSS scroll-behavior 处理，此处仅做导航高亮增强（预留 V2 迭代点）
  console.log("潘宜然 · 个人主页 V1 已加载");
})();
