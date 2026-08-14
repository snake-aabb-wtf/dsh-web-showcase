# DeepSeek Harness 网页作品集（dsh-web-showcase）

本仓库是 **由 DeepSeek 搭配 DeepSeek Harness (DSH) 编写的网页与网页游戏作品集**，
用于集中展示 DSH 生成的前端项目。每个项目占据一个独立子目录，后续新项目按同样方式追加。

## 项目索引

| 项目 | 简介 | 技术栈 | 如何运行 | 访问方式 |
| --- | --- | --- | --- | --- |
| [flightsim](./flightsim) | Sky172 高仿真 3D 飞行模拟器：手写六自由度气动物理、程序化场景与座舱仪表 | React 18, TypeScript, Vite 5, Three.js / R3F 8, zustand | 进入 `flightsim` 后 `npm install` → `npm run dev` | 本地 `http://localhost:5173`；GitHub Pages 预览见下 |

## flightsim —— Sky172 飞行模拟器（第一个项目）

**Sky172 Flight Simulator**：纯前端、可离线运行的高仿真 3D 飞行模拟器，以 Cessna 172
为气动基准。核心特点：

- **手写六自由度飞行物理**：固定 120 Hz 步长与渲染帧率完全解耦；升力/阻力/推力/重力
  与稳定导数量纲力矩模型，包含失速骤降与机头下坠、偏航-侧滑、滚转-偏航耦合、
  地面效应、三点式起落架接触与硬着陆判定——不依赖任何刚体物理库；
- **全程序化场景**：低多边形飞机（合并几何体）、起伏地形、带标记的跑道与滑行道、
  渐变天空与太阳、实例化云与树、雾效，无任何外部模型/贴图/音频；
- **座舱仪表**：第一人称视角下六块 Canvas 2D 仪表（空速/高度/姿态/航向/升降率/转速），
  读数与 HUD 实时一致；第三人称相机平滑跟随；
- **完整游戏流程**：主菜单、操作说明、灵敏度/画质/音量设置、键位自定义（持久化）、
  HUD 与失速告警、暂停/重置/崩溃提示、起降任务模式、配平系统、可选鼠标指针锁定与手柄支持。

技术栈：**React 18 · TypeScript（strict）· Vite 5 · Three.js / @react-three/fiber ·
zustand**；物理引擎为纯 TS 模块，可无头运行与自动化测试（33 项断言全部通过，
详见项目内 [SELF_TEST.md](./flightsim/SELF_TEST.md)）。

> 本项目由 **DeepSeek 搭配 DeepSeek Harness (DSH) 生成**。

### 本地运行

```bash
cd flightsim
npm install
npm run dev        # http://localhost:5173
```

生产构建与预览：`npm run build` → `npm run preview`。

### GitHub Pages 在线预览

仓库已配置 GitHub Actions（`.github/workflows/deploy-pages.yml`）：
每次向 `main` 推送 `flightsim/**` 变更后自动构建并部署到 Pages。
启用方式（一次性）：

1. 仓库 Settings → Pages → Source 选择 **GitHub Actions**；
2. 推送后等待 Actions 工作流完成，即可通过 `https://snake-aabb-wtf.github.io/dsh-web-showcase/` 直接游玩。

> 说明：当前部署以 flightsim 的构建产物为站点根；未来新增多项目时可将
> deploy-pages.yml 扩展为多项目部署矩阵，或为各项目分别部署到子路径。

## 新增项目规范

- 每个项目一个独立子目录（如 `flightsim/`），保持其完整目录结构与全部源文件；
- 在项目目录内提供该项目的 README（简介、技术栈、运行方式）；
- 更新本文件的项目索引表格，并为新项目添加专节说明；
- 项目构建产物与依赖（`node_modules/`、`dist/` 等）一律不提交。
