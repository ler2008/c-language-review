# C 语言程序设计基础 · 习题复习库

一个纯静态、可直接在浏览器中使用的 C 语言复习题库，按 PTA 的练习风格组织，共 **300 题**，每题均配有答案解析。

> 300 题 · 6 大模块 · 纯静态 · 手机/微信内可在线做题

**在线访问：<https://ler2008.github.io/c-language-review/>**（手机浏览器、微信内均可打开）

## 内容概览

| 模块 | 选择题 | 程序填空 | 程序设计 | 小计 |
| --- | ---: | ---: | ---: | ---: |
| C 语言基础 | 30 | 12 | 8 | 50 |
| 数组 | 40 | 16 | 12 | 68 |
| 指针 | 47 | 17 | 12 | 76 |
| 结构体 | 36 | 13 | 11 | 60 |
| 枚举 | 10 | 3 | 3 | 16 |
| 函数 | 19 | 6 | 5 | 30 |
| **合计** | **182** | **67** | **51** | **300** |

其中数组、指针、结构体三个模块共 **204 题**，占全部题目的 **68%**，适合作为期末复习的重点。

## 功能

- **PTA 风格练习**：题号、模块标签、题型、难度、选项与答案解析分层展示。
- **三种题型**：选择题即时判分；程序填空对照每个空的答案与说明；程序设计提供完整可编译参考程序和采分点。
- **筛选与搜索**：按模块、题型、难度、未做/错题/收藏筛选，支持题干、选项、知识点关键词搜索。
- **学习进度**：自动记录作答、正确率、错题、收藏和完成度，数据保存在浏览器 `localStorage`。
- **答题卡**：300 格答题卡，颜色区分正确/错误/已看答案，点击题号快速跳转。
- **乱序练习 / 随机抽题**：避免按固定顺序背题。
- **深色模式、移动端适配、代码复制、快捷键 `/` 聚焦搜索**。
- 无后端、无第三方依赖、离线可用；部署到任意静态托管后即可在微信内打开。

## 本地打开

直接双击 `index.html` 即可。若浏览器对本地文件有限制，可在项目目录启动一个静态服务器：

```bash
python -m http.server 8000
# 打开 http://localhost:8000
```

## 在线访问（手机 / 微信）

网页已经通过 **GitHub Pages** 发布，直接打开：

**<https://ler2008.github.io/c-language-review/>**

- 手机浏览器可直接访问，页面已做移动端适配。
- 微信内打开链接即可在线做题；可点右上角 `···` 选择“收藏”或“浮窗”，方便下次进入。
- 中国大陆网络访问 GitHub Pages 可能偶有波动，若打不开可换网络或稍后重试。

### 更新线上页面

修改题目或页面后，提交并推送到 `main` 分支即可，GitHub Pages 会自动重新发布：

```bash
git add .
git commit -m "update question bank"
git push origin main
```

### 其他静态托管方式

如果希望国内访问更稳定，也可以把 `dist/` 上传到腾讯云 CloudBase、Netlify 或 Vercel。具体步骤见 [docs/WECHAT_DEPLOY.md](docs/WECHAT_DEPLOY.md)。

生成可上传的 `dist/` 目录：

```bash
python tools/package_site.py
```

## 目录结构

```text
.
├── index.html                 # 页面入口
├── assets/
│   ├── css/style.css          # 样式（含深色模式与响应式）
│   └── js/
│       ├── data.js            # 构建生成的题库数据
│       └── app.js             # 交互逻辑
├── data/
│   ├── SCHEMA.md              # 题库 JSON 规范
│   └── raw/                   # 分模块原始题库
│       ├── 01-basics-func.json
│       ├── 02-array.json
│       ├── 03-pointer.json
│       ├── 04-struct-enum.json
│       ├── 05-extra-basics-func.json
│       ├── 06-extra-array.json
│       ├── 07-extra-pointer.json
│       └── 08-extra-struct-enum.json
├── tools/
│   ├── build_data.py          # 校验并合并生成 data.js
│   └── package_site.py        # 提取运行文件到 dist/
├── docs/WECHAT_DEPLOY.md      # 微信在线做题部署指南
├── dist/                      # 打包生成的上传目录（运行 package_site.py 后出现）
└── README.md
```

## 重新生成题库

修改 `data/raw/*.json` 后，在项目根目录执行：

```bash
python tools/build_data.py
python tools/package_site.py
```

脚本会校验字段、ID、题型数量、模块数量、答案下标、重复题干等，并生成 `assets/js/data.js`。只做校验不写入：

```bash
python tools/build_data.py --check
```

## 说明

- 题目与解析为围绕《C 语言程序设计基础》常见教学大纲原创整理，**不是**官方题库，也不保证与某一版教材的课后题逐题对应。
- 选择题答案以标准 C（C99/C11）语义为准；涉及 `sizeof`、内存对齐等题目已在题干中写明环境假设。
- 代码示例已在 MSVC（`/std:c11`）下编译验证；不同编译器对个别实现定义行为可能有差异，题目已尽量避免依赖这些行为。
- 学习进度保存在当前浏览器（含微信内置浏览器），清理缓存或换设备后不会自动同步。
- 题库仅用于课程复习与自测，欢迎按 `data/SCHEMA.md` 的格式自行扩充。
