# DeepSeek Harness 网页作品集（dsh-web-showcase）

本仓库是 **由 DeepSeek 搭配 DeepSeek Harness (DSH) 编写的网页与网页游戏作品集**，
用于集中展示 DSH 生成的前端项目。每个项目占据一个独立子目录，后续新项目按同样方式追加。

## 项目索引

| 项目 | 简介 | 技术栈 | 如何运行 | 访问方式 |
| --- | --- | --- | --- | --- |
| [flightsim](./flightsim) | Sky172 高仿真 3D 飞行模拟器：手写六自由度气动物理、程序化场景与座舱仪表 | React 18, TypeScript, Vite 5, Three.js / R3F 8, zustand | 进入 `flightsim` 后 `npm install` → `npm run dev` | 本地 `http://localhost:5173`；在线预览 <https://snake-aabb-wtf.github.io/dsh-web-showcase/> |

## 新增项目规范

- 每个项目一个独立子目录（如 `flightsim/`），保持其完整目录结构与全部源文件；
- 在项目目录内提供该项目的 README（简介、技术栈、运行方式）；
- 更新本文件的项目索引表格，并为新项目添加专节说明；
- 项目构建产物与依赖（`node_modules/`、`dist/` 等）一律不提交。

## 许可证

本仓库（含其中所有项目）以 [MIT License](./LICENSE) 授权。
