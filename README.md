# DeepSeek Harness 网页作品集（dsh-web-showcase）

本仓库是 **由 DeepSeek 搭配 DeepSeek Harness (DSH) 编写的网页与网页游戏作品集**，
用于集中展示 DSH 生成的前端项目。每个项目占据一个独立子目录，后续新项目按同样方式追加。

## 项目索引

| 项目 | 简介 | 技术栈 | 如何运行 | 访问方式 |
| --- | --- | --- | --- | --- |
| [flightsim](./flightsim) | Sky172 高仿真 3D 飞行模拟器：手写六自由度气动物理、程序化场景与座舱仪表 | React 18, TypeScript, Vite 5, Three.js / R3F 8, zustand | 进入 `flightsim` 后 `npm install` → `npm run dev` | 本地 `http://localhost:5173`；在线预览 <https://snake-aabb-wtf.github.io/dsh-web-showcase/flightsim/> |
| [physx2d](./physx2d) | PhysX2D 2D 刚体物理引擎：手写 SAT 碰撞检测、顺序冲量求解器、距离/鼠标关节与岛屿休眠 | React 18, TypeScript, Vite 6, Canvas 2D | 进入 `physx2d` 后 `npm install` → `npm run dev` | 本地 `http://localhost:5173`；在线预览 <https://snake-aabb-wtf.github.io/dsh-web-showcase/physx2d/> |

> 站点根 <https://snake-aabb-wtf.github.io/dsh-web-showcase/> 为作品集索引页（`index.html`），
> 由 GitHub Actions 构建各项目后统一部署（见 `.github/workflows/deploy-pages.yml`）。

## 新增项目规范

- 每个项目一个独立子目录（如 `flightsim/`、`physx2d/`），保持其完整目录结构与全部源文件；
- 在项目目录内提供该项目的 README（简介、技术栈、运行方式）；
- 更新本文件的项目索引表格；
- 项目构建产物与依赖（`node_modules/`、`dist/` 等）一律不提交；
- 完整的新增项目流程（含 CI 部署改造、验收清单）见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 许可证

本仓库（含其中所有项目）以 [MIT License](./LICENSE) 授权。
