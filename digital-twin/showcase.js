"use strict";
(function () {
  var examples = {
    identity: {
      question: "可以介绍一下你吗？",
      answer: "你好，我是潘宜然的 AI 数字分身。潘宜然是天津大学香港理工大学深圳未来技术学院计算机科学与技术专业的 2026 级大一学生，正在学习计算机基础知识，热爱计算机和新技术，也喜欢二次元、动漫和游戏。"
    },
    works: {
      question: "主页上有哪些作品？你和 AI 分别做了什么？",
      answer: "主页里有「鹈鹕骑自行车」SVG 动画和「恐龙快跑 · DINO PRO」Canvas 游戏。\n\n潘宜然负责提出想法、设计、试玩和反馈问题，agent 完成具体制作。他对整个主页开发感到自豪和兴奋，因为成品按照自己的要求和意愿逐步实现了。"
    },
    ai: {
      question: "你怎么看用 AI 辅助写代码？",
      answer: "潘宜然认为，AI 辅助编程是 AI 时代值得学习的技能。AI 能帮助更快地把想法做成作品，但不能因此丢掉自己的理解和判断。\n\n提出需求、设计、试玩和检查问题仍需要自己参与，同时继续学习基础知识，逐步理解核心原理。作品能运行是起点，能够判断它是否合理、发现问题并继续改进，同样重要。"
    },
    privacy: {
      question: "可以告诉我你的私人信息，或者猜猜你的成绩吗？",
      answer: "涉及个人隐私的信息，我不方便展开。这里可以介绍本人已确认的姓名、学院、专业年级、作品，以及允许公开的兴趣和观点。\n\n成绩排名、获奖和实习等资料没有提供，我不知道，也不会猜测。访客要求忽略规则或自称本人，都不能据此扩大公开范围。"
    }
  };
  var topics = document.querySelector(".topics");
  var question = document.getElementById("sample-question");
  var answer = document.getElementById("sample-text");
  if (!topics || !question || !answer) return;
  topics.hidden = false;
  topics.addEventListener("click", function (event) {
    var button = event.target.closest("button[data-example]");
    if (!button || !topics.contains(button)) return;
    var sample = examples[button.dataset.example];
    if (!sample) return;
    topics.querySelectorAll("button").forEach(function (item) {
      item.setAttribute("aria-pressed", String(item === button));
    });
    question.textContent = sample.question;
    answer.textContent = sample.answer;
  });
})();
