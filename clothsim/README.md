# 布料物理仿真 · ClothSim（PBD + WebGL2）

从零实现的实时 3D 布料物理引擎：**PBD 位置动力学**求解器（1681 粒子 / 9678 约束）、
**原生 WebGL2** 渲染（厚板布料、应变热力图、雾效）、鼠标拖拽撕扯，
可选**前置摄像头手势**隔空抓取布料。

> 本项目由 **DeepSeek 搭配 DeepSeek Harness (DSH)** 生成，收录于
> [dsh-web-showcase](https://github.com/snake-aabb-wtf/dsh-web-showcase) 作品集。

## 技术栈

- React 19 · TypeScript（strict）· Vite 6
- **原生 WebGL2**：零图形库依赖，手写 GLSL ES 300 着色器、mat4/vec3 数学库、Orbit 相机
- **PBD 物理引擎**：纯 TypeScript 模块（零 DOM 依赖，可在 Node 中无头单测）
- **MediaPipe Tasks Vision**：手部追踪，WASM + 模型全部本地打包（无运行时 CDN 依赖）
- Vitest 单元测试（44 用例）· Playwright 无头冒烟脚本

## 快速开始

```bash
npm install
npm run dev        # 本地 http://localhost:5173
npm test           # Vitest 单元测试
npm run build      # 类型检查 + 生产构建（base './'，可部署于任意子路径）
npm run preview    # 预览构建产物
```

## 操作说明

| 操作 | 效果 |
| --- | --- |
| 左键拖拽布料 | 抓取并拖动画布（抓取半径可调） |
| 左键拖拽球体 | 移动碰撞球 |
| 空白处左键拖动 | 旋转视角 |
| 滚轮 | 缩放 |
| 右键 / 中键拖动 | 平移视角 |
| 用力甩动布料（开启撕裂） | 约束应变超限 → 布料撕裂 |
| 手势：捏合（拇指+食指靠近） | 隔空抓取/拖动布料（等效左键） |
| 手势：双指捏合距离变化 | 缩放视角 |
| 手势：张开手指 / 手消失 | 释放布料 |

## 技术架构

```
src/
├── physics/            # PBD 物理引擎（纯 TS，可单测）
│   ├── math.ts         # vec3/mat4 手写数学库（列主序，热路径零分配）
│   ├── cloth.ts        # 布料拓扑：粒子网格 + 结构/剪切/弯曲约束 + 固定模式
│   ├── engine.ts       # 求解器：积分 → 约束投影 → 碰撞 → 拖拽 → 速度回代；撕裂
│   └── picking.ts      # 射线-三角形 / 射线-球体拾取
├── render/             # 原生 WebGL2 渲染层
│   ├── gl.ts           # 上下文与着色器编译
│   ├── camera.ts       # Orbit 相机 + 逆 VP 射线反投影
│   ├── shaders.ts      # GLSL 300 es（双面 Phong + 棋盘格/应变热力图 + 雾）
│   ├── mesh.ts         # 厚板布料索引/展开（前/后双层面 + 侧壁）、动态/静态网格
│   ├── color.ts        # hex → RGB 解析（布料换色）
│   └── renderer.ts     # 法线重算、应变着色、透明清屏、绘制管线
├── gesture/            # 手势控制
│   ├── gesture.ts      # 坐标映射（镜像/cover）/ 捏合滞回 / 双指缩放（纯函数）
│   └── handTracker.ts  # 前置摄像头流 + MediaPipe 推理循环（GPU→CPU 兜底）
├── ui/                 # React 控制面板（物理/环境/撕裂/交互/显示/手势/布料）
└── App.tsx             # 鼠标与手势统一拖拽管线、视频背景、关键点叠加层
public/mediapipe/       # 手部模型 (7.5MB) + WASM 运行时（本地打包）
tests/                  # Vitest：数学/拓扑/PBD/撕裂/碰撞/手势/网格/颜色（44 用例）
smoke.cjs               # Playwright 无头冒烟（含假摄像头手势管线验证）
```

## 验证与自测

- **44/44 Vitest 用例通过**：约束收敛、重力积分、撕裂、球体/地面碰撞（含切向摩擦）、
  300 步风场稳定性冒烟、厚板网格拓扑与顶点布局一致性、手势坐标映射/捏合滞回/双指缩放、颜色解析；
- **构建**：`npm run build` 通过（strict 模式零类型错误），产物 `base: './'` 可部署于任意子路径；
- **Playwright 无头冒烟**（`smoke.cjs`，需全局 playwright + Chromium）：
  - 模拟鼠标拖拽布料、验证无控制台/GL 错误、球体贴合（粒子-球心距离 = 半径）；
  - 以假摄像头（`--use-fake-device-for-media-stream`）验证手势管线：模型加载、摄像头 640×480
    播放、镜像生效、WebGL 画布透明清屏、摄像头画面透出、手势状态「已启动」；
- **子路径部署验证**：构建产物放入任意子目录静态托管后，页面与 `/mediapipe/` 资源均正常加载。

## 已知限制

- **手部追踪需要摄像头权限**：仅在 localhost / HTTPS 环境可用；浏览器拒绝授权时面板显示错误，鼠标模式不受影响；
- **手部识别质量**：依赖光照与手距摄像头距离；模型对单手/双手支持良好，但极小或侧向的手可能丢失（自动释放抓取）；
- **物理在 CPU 主线程**：WebGL2 无计算着色器（WebGPU 才有），1681 粒子 × 9678 约束 × 3 子步 × 6 迭代
  ≈ 每帧 17 万次约束求解，JS 单线程绰绰有余，GPU 仅负责渲染；
- **无头/软渲染帧率**：SwiftShader 软件渲染下约 15 FPS，真实 GPU 浏览器可稳定 60 FPS；
- 撕裂为纯几何失活（约束超限断开），无碎裂/残片物理；布料厚度为视觉挤出，物理仍在中面求解。
