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
- **场景按钮**：可切换太空舱 / 自由轨道模式，并显示或隐藏中英双语解说。

## 部署 GitHub Pages

1. 将项目推送到 GitHub 仓库的 `main` 分支。
2. 在仓库 **Settings → Pages** 中选择 **GitHub Actions** 作为发布源。
3. 每次推送后，`.github/workflows/deploy.yml` 会构建并发布静态 `dist` 目录。

项目使用相对资源路径，因此适用于任意 GitHub Pages 仓库名称。

## 素材来源

地球、云层、太阳和银河背景采用 Solar System Scope 的公开纹理资源；月球、法线、镜面反射和夜景纹理来自 Three.js 公开示例资源。正式公开展示前，请按项目用途复核并保留最终素材的来源与授权说明。

## 边界

本版本不模拟真实时刻的天体位置或实时云图。日地月比例为便于沉浸观察的展示比例，而非真实天文比例。
