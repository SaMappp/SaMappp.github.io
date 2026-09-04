# 潘宜然 · 个人主页

这是「Project-Based Vibe Coding」课程的核心项目：一个可以不断打磨、发布并收集反馈的个人主页。

## 课程迭代路线（V1 → V4）

| 阶段 | 版本 | 本阶段要做的 |
| ---- | ---- | ------------ |
| Stage 1 | V1 | 可本地预览的个人主页，结构清晰、内容真实 |
| Stage 2 | V2 | 通过多次小迭代打磨设计 |
| Stage 3 | V3 | 加入反馈功能，发布到 GitHub |
| Stage 4 | V4 | 依据真实用户反馈改进 |

## 当前状态

- 版本：**V1**
- 完成度：✅ 可本地预览 ✅ 结构清晰 ✅ 已填入真实信息
- 已有信息：姓名（潘宜然）· 学校（天津大学）· 专业（计算机科学与技术 CS）· 邮箱（16624650126@163.com）
- 远程仓库：https://github.com/SaMappp/Git

## 本地预览

无需安装依赖，直接用浏览器打开 `index.html` 即可，或运行一个静态服务器：

```bash
# Python
python -m http.server 8000
# 然后访问 http://localhost:8000
```

## 目录结构

```
personal-homepage/
├── index.html   # 主页结构
├── style.css    # 样式
├── script.js    # 交互脚本
└── README.md    # 本说明文档
```
