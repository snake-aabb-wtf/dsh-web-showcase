# 贡献指南（Contributing to dsh-web-showcase）

本仓库是 **由 DeepSeek 搭配 DeepSeek Harness (DSH) 编写的网页与网页游戏作品集**。
本指南面向后续贡献者，说明**如何向作品集添加一个新项目**，以及仓库的通用约定。

## 仓库结构

```
dsh-web-showcase/
├── index.html                # 作品集索引页（站点根，GitHub Pages 首页）
├── README.md                 # 仓库说明 + 项目索引表格
├── CONTRIBUTING.md           # 本文件：贡献指南
├── LICENSE                   # MIT（覆盖全部项目）
├── .gitignore                # 根级忽略（node_modules/ dist/ 等）
├── .github/workflows/
│   └── deploy-pages.yml      # 构建全部项目并部署到 GitHub Pages
├── flightsim/                # 项目 01：Sky172 飞行模拟器
└── physx2d/                  # 项目 02：PhysX2D 物理引擎
```

每个项目一个独立子目录，包含**完整源文件**与**项目 README**。

## 新增项目流程（按顺序完成）

### 1. 创建项目子目录

```
mkdir <project-name>/
```

- 目录名使用小写字母（如 `flightsim`、`physx2d`），与 `package.json` 的 `name` 对应；
- 提交**完整源码与配置文件**（`src/`、`package.json`、`package-lock.json`、`tsconfig*`、`vite.config.ts`、`index.html`、`.gitignore` 等）；
- **一律不提交**：`node_modules/`、`dist/`、`.vite/`、`*.tsbuildinfo` 等构建产物与依赖（根 `.gitignore` 已覆盖，项目内也建议自带一份）；
- `package-lock.json` **必须提交**（CI 使用 `npm ci`，没有 lock 文件构建会失败）。

### 2. 项目技术栈约定

- **React + TypeScript（strict）+ Vite** 构建（作品集统一技术栈）；
- `vite.config.ts` 设置 `base: './'`——构建产物使用相对路径，可部署到任意子路径（GitHub Pages 子目录、离线本地打开均可用），这是多项目部署的前提；
- 项目核心算法（物理、渲染、逻辑）应尽量手写实现、不依赖现成引擎库——这是本作品集的主题；
- 引擎/核心模块建议与 UI 解耦（纯 TS 模块，不依赖 React/DOM），便于无头测试。

### 3. 编写项目 README

项目目录内的 `README.md` 建议包含（参考 `flightsim/README.md` 与 `physx2d/README.md`）：

```markdown
# 项目名（可附英文名）

一句话简介（强调手写/从零实现的部分）。

> 本项目由 **DeepSeek 搭配 DeepSeek Harness (DSH)** 生成，收录于
> [dsh-web-showcase](https://github.com/snake-aabb-wtf/dsh-web-showcase) 作品集。

## 技术栈        # 框架与依赖清单
## 快速开始      # npm install → npm run dev / build / preview
## 操作说明      # 交互方式表格
## 技术架构      # 目录结构与核心模块说明
## 验证与自测    # 测试脚本与结果
## 已知限制      # 诚实说明已知问题
```

### 4. 更新根 README 项目索引

在 `README.md` 的项目索引表格中新增一行：

| 项目 | 简介 | 技术栈 | 如何运行 | 访问方式 |
| --- | --- | --- | --- | --- |
| [<project>](./<project>) | 一句话简介 | 技术栈清单 | 进入 `<project>` 后 `npm install` → `npm run dev` | 本地 `http://localhost:5173`；在线预览 <https://snake-aabb-wtf.github.io/dsh-web-showcase/<project>/> |

### 5. 更新根索引页

在根 `index.html` 的卡片网格中添加新项目卡片：

```html
<section class="card">
  <div class="tag">PROJECT 0N · <NAME></div>
  <h2>项目标题</h2>
  <p class="desc">一句话简介。</p>
  <p class="stack"><b>React 18</b> · TypeScript · Vite · <b>亮点技术</b></p>
  <a class="link" href="./<project>/">打开演示 →</a>
</section>
```

### 6. 更新 CI 部署工作流（容易遗漏的一步）

`.github/workflows/deploy-pages.yml` 需要为新项目增加**构建 + 组装**步骤，否则线上不会出现新项目：

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 20
    cache: npm
    cache-dependency-path: <project>/package-lock.json
- name: Build <project>
  run: |
    npm ci
    npm run build
  working-directory: <project>
```

并在"组装站点"步骤把产物复制进子目录：

```bash
cp -r <project>/dist site/<project>
```

同时把触发路径加入 `on.push.paths`：

```yaml
paths:
  - '<project>/**'
  - '.github/workflows/deploy-pages.yml'
```

> 说明：本项目使用 `base: './'`，产物放在 `site/<project>/` 子路径即可正确加载，
> 无需修改项目自身的 vite 配置。

### 7. 自测与验收

推送到 `main` 前，请在本地完成：

- [ ] `npm ci && npm run build` 通过（严格模式零类型错误）；
- [ ] 提供自测脚本（如 Playwright 断言、无头物理/逻辑测试），并给出运行方式与结果；
- [ ] 在本地按部署结构验证子路径可访问（构建产物放入 `site/<project>/` 后静态托管，
      确认页面与资源加载正常）；
- [ ] 推送后确认 GitHub Actions 构建成功，线上 <https://snake-aabb-wtf.github.io/dsh-web-showcase/<project>/> 可打开。

## 提交约定

- 提交信息使用中文、一句话概括变更（参考现有历史，如
  "作品集新增第二个项目：PhysX2D 2D 刚体物理引擎（physx2d）"）；
- 一个提交聚焦一个主题（新增项目、修复、部署改造分开提交）；
- 文件行尾统一 LF（Windows 上 Git 会自动处理，无需额外配置）；
- 分支策略：直接推送到 `main`（本仓库为个人作品集）或使用 PR，均需通过 CI。

## 常见问题

| 现象 | 原因与处理 |
| --- | --- |
| CI 构建失败：`npm ci` 报错 | 未提交 `package-lock.json`，或 lock 与 `package.json` 不同步——提交 lock 文件 |
| CI 构建失败：TypeScript 错误 | 项目开启了 strict 模式，修复类型错误（`npm run build` 本地先过） |
| 线上打开新项目 404 | 未更新 `deploy-pages.yml` 的构建/组装/触发路径（见第 6 步） |
| 线上页面样式错乱 | 项目 `vite.config.ts` 未设置 `base: './'`，资源路径为绝对路径 |
| 线上项目未更新 | 检查触发路径是否包含该项目目录；部署约需 1~3 分钟，可稍后刷新 |

## 许可证

本仓库（含所有项目）以 [MIT License](./LICENSE) 授权。
