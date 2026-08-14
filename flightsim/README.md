# Sky172 飞行模拟器（Sky172 Flight Simulator）

纯前端、可离线运行的高仿真 3D 飞行模拟器。以 Cessna 172 单发螺旋桨飞机为气动基准，
六自由度刚体动力学与气动方程全部手写实现（不依赖任何刚体物理库），场景中所有
3D 资产（飞机、地形、跑道、天空、云、树木）均为程序化生成，无任何外部模型/贴图/音频。

> 本项目由 **DeepSeek 搭配 DeepSeek Harness (DSH)** 生成，收录于
> [dsh-web-showcase](https://github.com/snake-aabb-wtf/dsh-web-showcase) 作品集。

## 技术栈

- **React 18 + TypeScript**（strict 模式，无 `any` 滥用）
- **Vite 5** 构建
- **Three.js r160 + @react-three/fiber 8**（渲染层）
- **zustand**（UI/设置状态，飞行数据不经 React 状态，由 HUD 直接读引擎，避免每帧 setState）
- 物理引擎为纯 TypeScript 模块，**不依赖 three.js / DOM**，可无头运行与自动化测试

## 快速开始

```bash
# 进入项目目录
cd flightsim

# 安装依赖
npm install

# 开发模式（http://localhost:5173）
npm run dev

# 生产构建（产物在 dist/）
npm run build

# 本地预览构建产物
npm run preview

# 无头物理自测（33 项断言，无需浏览器）
npm run physics:test
```

## 操作说明

| 功能 | 按键（可在设置中自定义） |
| --- | --- |
| 拉杆 / 推杆（俯仰） | W / S（或 ↑ / ↓） |
| 左压杆 / 右压杆（滚转） | A / D（或 ← / →） |
| 左舵 / 右舵（偏航） | Q / E |
| 增大 / 减小油门 | Shift / Ctrl（或 PageUp / PageDown） |
| 收放襟翼 | F |
| 收放起落架 | G |
| 刹车 | B（按住） |
| 切换视角（第三人称 / 座舱） | V |
| 抬头 / 低头配平 | X / C |
| 暂停 / 继续 | P |
| 重置飞行 | R |
| 调试信息 | F1 |

- **起飞**：按住 Shift 推满油门 → 空速达 55–60 kt 后轻拉杆抬轮 → 离地后建立配平（按住 X 约 1.5 秒）松杆爬升。
- **失速改出**：大攻角拉杆速度下降、失速告警响起并有机头下坠趋势 → 推杆减小攻角、油门推满恢复速度。
- **着陆**：放下起落架（G）与襟翼（F），进近速度 65 kt 左右，接地下降率控制在 690 ft/min 以内，
  否则判定"着陆过重"坠毁。
- **可选输入**：设置中开启"鼠标指针锁定"后点击画面可用鼠标控制俯仰/滚转；支持 Gamepad 手柄
  （左摇杆俯仰/滚转、右摇杆方向舵、扳机油门）。

## 技术架构

```
src/
├── physics/            # 物理引擎（纯 TS，无 three.js 依赖）
│   ├── engine.ts       # 六自由度刚体引擎：固定 120Hz 步长、累加器与渲染解耦
│   ├── aero.ts         # 气动系数：升力/阻力/侧力/力矩（含失速骤降、地面效应）
│   ├── atmosphere.ts   # 国际标准大气密度模型
│   └── controls.ts     # 键盘/鼠标/手柄 → ControlInput 采样
├── config/             # 气动参数（C-172 基准，集中调参）与世界配置
├── aircraft/           # 程序化飞机模型（合并几何体 + 顶点色涂装）
├── world/              # 程序化地形/跑道/天空/云/树（heightfield 为物理与渲染共用）
├── cockpit/            # Canvas 2D 仪表：空速/高度/姿态/航向/升降率/转速
├── cameras/            # 第三人称平滑跟随 / 第一人称座舱
├── ui/                 # HUD、主菜单、暂停、设置、键位编辑、崩溃提示
├── input/              # 输入总线（可自定义键位）、指针锁定、手柄
├── mission/            # 起降任务（可选模式）
├── audio/              # WebAudio 程序化引擎/风声（无外部音频）
├── dev/autopilot.ts    # 集成测试用自动驾驶钩子（?autopilot=1）
└── store/              # zustand：屏幕/设置/键位（localStorage 持久化）
```

### 物理引擎要点

- **固定时间步长 120 Hz**：`tick(realDt)` 用累加器把渲染帧切成整数个固定步（Gaffer On Games,
  *Fix Your Timestep*），仿真表现与帧率完全无关；支持时间加速（测试用）。
- **姿态**：四元数积分 q̇ = ½ q ⊗ ω̂（Kuipers），欧拉角仅用于显示与初始构造，互为精确逆变换。
- **气动力**：L = q̄SC_L、D = q̄SC_D、Y = q̄SC_Y，动压 q̄ = ½ρV²；
  升力系数线性段 C_L = C_L0 + C_Lα·α + ΔC_Lflap，超过临界攻角后失速骤降（C_Lmax → C_Lpost →
  大攻角衰减）；诱导阻力 C_Di = C_L²/(π·e·AR)（Anderson, *Fundamentals of Aerodynamics*）。
- **力矩**：稳定导数量纲模型（Cmα 纵向静稳定、Clp/Cmq/Cnr 阻尼、Clβ/Cnβ 横航向静稳定、
  Cnδa 不利偏航与 Cnp 滚转-偏航耦合体现"滚转诱导偏航"、Cm_α̇ 飘摆阻尼），
  参考 Etkin & Reid, *Dynamics of Flight*；失速时机头下坠力矩（pitch-break）模拟气动中心前移。
- **推力**：螺旋桨可用推力 ≈ ηP/V（低速受静推力上限约束），右旋桨反扭矩 → 左滚耦合。
- **刚体动力学**：Euler 方程 α = I⁻¹(τ − ω×(Iω))，含陀螺耦合项。
- **起落架**：三点式弹簧-阻尼接触 + 库仑摩擦（滚动/侧向/刹车）+ 前轮转向，
  自然复现滑跑、抬轮、接地与弹跳；接地时按下沉率判定软/硬着陆（阈值 3.5 m/s ≈ 690 fpm）。
- **参数基准**：Cessna 172（质量 1110 kg、翼面积 16.2 m²、翼展 11 m、160 hp），
  全部集中在 `src/config/aircraft.ts` 便于调参。

### 性能

- 地形/机翼/机身等几何体合并为单 mesh（顶点色 + flat shading），云与树用 InstancedMesh；
- 场景雾与天空着色器一体（地平线颜色一致），单 draw call 天空；
- HUD/仪表通过 rAF 直读引擎状态（DOM ref 更新），无 React 每帧重渲染。

## 验证与自测

| 脚本 | 内容 | 结果 |
| --- | --- | --- |
| `npm run physics:test` | 无头物理断言 33 项（起飞/失速/着陆/耦合/稳定性/确定性） | ✅ 33/33 |
| `scripts/e2e_ui.py` | Playwright UI 探针（菜单/设置/键位/暂停/重置/视角） | ✅ 13/13 |
| `scripts/e2e_flight.py` | Playwright 自动驾驶飞行探针（`?autopilot=1`） | 起飞/爬升/失速/改出/转向/下降通过；着陆段调试中 |

详细逐条自测报告见 [SELF_TEST.md](./SELF_TEST.md)。

## 已知状态说明

- 自动驾驶探针（仅测试用钩子）的着陆段仍在调试；手动飞行的着陆判定（软/硬着陆）已由物理测试覆盖并通过。
- 手柄与鼠标指针锁定已实现，受自动化环境限制未纳入脚本断言，可手动体验。
