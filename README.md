# 日地月观察舱 / Earth Observation

一个可直接部署到 GitHub Pages 的静态 WebXR 场景。电脑端可用鼠标探索；Quest 3 浏览器中点击“进入 VR”即可使用手柄观察。

## 本地运行

```bash
npm install
npm run dev
```

## 控制方式

- **电脑端**：左键拖拽环绕地球，滚轮拉近或拉远。
- **Quest 3**：左摇杆环绕观察，右摇杆调整距离；手柄射线可点击界面按钮。
- **场景按钮**：显示或隐藏中英双语解说，并可进入 VR。
- **预报云层**：使用 Open-Meteo 的全球总云量与高、中、低云量预报，控制三层卫星云纹理的区域显隐；约每 45 分钟刷新一次。它是天气模型预报，不是实时卫星实拍。

## 部署 GitHub Pages

1. 将项目推送到 GitHub 仓库的 `main` 分支。
2. 在仓库 **Settings → Pages** 中选择 **GitHub Actions** 作为发布源。
3. 每次推送后，`.github/workflows/deploy.yml` 会构建并发布静态 `dist` 目录。

项目使用相对资源路径，因此适用于任意 GitHub Pages 仓库名称。

## 素材来源

地表采用 NASA Blue Marble Next Generation 5400×2700 全球贴图；“中国近景”会按需加载同源 NASA 500m 拼块裁出的东亚局部 4K 贴图。云层采用公开卫星纹理资源；深空星点从 HYG v4.1（Hipparcos、Yale Bright Star、Gliese）真实星表中筛选约 2,000 颗，并按 CC BY-SA 4.0 署名；月球、海陆掩膜和夜景纹理来自 Three.js 公开示例资源。NASA Deep Star Maps 2020 是后续高动态范围银河背景的预留来源；当前版本保持低亮度纯深空，以免纹理背景掩盖真实亮星。正式公开展示前，请按项目用途复核并保留最终素材的来源与授权说明。

## 边界

本版本不模拟真实时刻的天体位置或实时卫星云图。太阳不作为可见天体渲染，但保留其方向性光照以形成地球与月球一致的明暗面；月球距离为便于观察的展示比例。预报云层使用 Open-Meteo 的免费非商业 API，数据按 [CC BY 4.0](https://open-meteo.com/en/license) 署名。桌面端使用更高球体分段、纹理过滤与星表密度；Quest 3 自动使用轻量档。
