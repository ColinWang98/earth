# 三尺度天文探索器 / Astronomical Explorer

一个可直接部署到 GitHub Pages 的静态 WebXR 场景，可在地球、真实太阳系和 Gaia 邻近恒星三个局部尺度之间切换。电脑端可用鼠标探索；Quest 3 浏览器中点击“进入 VR”即可使用手柄观察。

## 本地运行

```bash
npm install
npm run dev
```

## 控制方式

- **尺度导航**：在地球观察、太阳系和 100 pc 恒星邻域间切换，每个尺度使用独立坐标和相机范围。
- **时间轴**：支持 1900–2100 年、暂停、正反向加速与回到当前时间。
- **电脑端**：左键拖拽环绕，滚轮拉近或拉远；可搜索行星、中文恒星名、英文恒星名或 Gaia source ID。
- **Quest 3**：左摇杆环绕观察，右摇杆调整距离；手柄射线可点击界面按钮。
- **场景按钮**：显示或隐藏中英双语解说，并可进入 VR。
- **预报云层**：使用 Open-Meteo 的全球总云量与高、中、低云量预报，控制三层卫星云纹理的区域显隐；约每 45 分钟刷新一次。它是天气模型预报，不是实时卫星实拍。

## 部署 GitHub Pages

1. 将项目推送到 GitHub 仓库的 `main` 分支。
2. 在仓库 **Settings → Pages** 中选择 **GitHub Actions** 作为发布源。
3. 每次推送后，`.github/workflows/deploy.yml` 会构建并发布静态 `dist` 目录。

项目使用相对资源路径，因此适用于任意 GitHub Pages 仓库名称。

## 素材来源

地表采用 NASA Blue Marble Next Generation 5400×2700 全球贴图；“中国近景”会按需加载同源 NASA 500m 拼块裁出的东亚局部 4K 贴图。地球模式的远景星空从 HYG v4.1 中筛选约 2,000 颗亮星；恒星邻域使用 ESA Gaia DR3 的真实位置、视差、自行、径向速度、星等和颜色数据。月球、海陆掩膜和夜景纹理来自 Three.js 公开示例资源。

太阳、月球和八大行星的位置由 Astronomy Engine 在浏览器内计算。`npm run validate:horizons` 会在 1900、2000、2100 三个历元逐一调用 NASA/JPL Horizons，将九个天体的日心黄道 J2000 向量与页面算法比较，方向误差阈值为 1 角分。

## 数据维护与验证

```bash
# 从 ESA Gaia TAP 重建 25/50/100 pc 三层静态二进制快照
npm run data:gaia

# 从 JPL SBDB 更新代表性小行星与彗星轨道快照
npm run data:small-bodies

# 运行单元测试与构建
npm test
npm run build

# 在线对照 JPL Horizons（仅开发/验收时访问网络）
npm run validate:horizons
```

浏览器不会直接调用 Gaia、Horizons 或 JPL SBDB；天文数据库只在构建和验收阶段访问。Gaia 快照位于 `public/assets/stars/gaia/`，25 pc 内完整保留通过质量筛选的来源，25–100 pc 使用亮度 LOD。

## 边界与显示比例

太阳系天体的位置和轨道按 AU 比例显示，默认天体直径会视觉放大；“真实直径”开关可用于比例对照。地球模式仍使用独立近景比例，月球会沿真实时刻方向放到便于观察的展示距离。Gaia 恒星按 parsec 距离显示，自行会从 Gaia 2016.0 历元传播到所选年份；缺少径向速度的来源会明确标记为仅切向运动。

预报云层使用 Open-Meteo 的免费 API，数据按 [CC BY 4.0](https://open-meteo.com/en/license) 署名。桌面端使用 100 pc 全部 LOD；Quest 3 自动省略 50–100 pc 远层，并动态降低 DPR 以维持刷新率。
