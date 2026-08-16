# 地球与太阳系观察 / Live Earth & Solar System

一个可直接部署到 GitHub Pages 的静态 WebXR 天文场景。从近地轨道开始，在同一个页面中观察 NASA 近实时地球影像，并以自由飞行或自动巡航方式进入真实位置驱动的太阳系。

## 本地运行

```bash
npm install
npm run dev
```

## 操作方式

- 默认模式：左键拖拽环绕地球，滚轮拉近或拉远，可使用预设机位。
- 自由飞行：`WASD` 平移，`Q/E` 升降，鼠标转向，`Shift` 加速，滚轮调节基础速度，`Esc` 释放鼠标。
- 自动巡航：搜索太阳、月球或八大行星，页面会平滑飞到目标附近；任何手动输入都可中断。
- Quest 3：左摇杆平移，右摇杆转向和升降，扳机加速，握把减速；射线可操作界面。
- 时间轴：支持 1900–2100、暂停、正反向倍速与回到当前时间。

## 地球观测数据

当前日期使用 NASA GIBS 的 VIIRS/Suomi NPP Corrected Reflectance True Color。页面会探测当天及之前三天，选择最新覆盖较完整的全球影像；桌面加载 4096×2048，Quest/移动端加载 2048×1024。

这是近实时卫星真彩影像，不是实时直播。极轨产品通常在获取后约 3 小时可用；当天全球覆盖尚未完成时，页面会选择最近的完整日期。2012 年后的历史日期使用 VIIRS，2000–2011 使用 MODIS Terra；更早、未来、无有效覆盖或网络失败时会明确回退到 NASA Blue Marble。

- [NASA GIBS API](https://nasa-gibs.github.io/gibs-api-docs/access-basics/)
- [NASA Worldview / GIBS imagery](https://worldview.earthdata.nasa.gov/)

## 天文与视觉数据

- 太阳、月球和八大行星的位置由 Astronomy Engine 在浏览器计算，参考系为日心黄道 J2000。
- 三维轨道由 Astronomy Engine 在所选日期附近按各行星公转周期采样，不使用共面圆环近似。
- 行星近景使用 NASA/JPL 公开纹理和 NASA 3D Resources 模型；远景尺寸会视觉放大，界面会明确提示。
- 地球背景星空使用轻量 HYG 亮星表；本版本不包含 Gaia 恒星邻域功能。
- `npm run validate:horizons` 会对 1900、2000、2100 的天体向量进行 NASA/JPL Horizons 回归比较，方向误差阈值为 1 角分。

## 数据维护与验证

```bash
# 更新筛选后的小天体静态快照
npm run data:small-bodies

# 单元测试、生产构建和在线 JPL 验证
npm test
npm run build
npm run validate:horizons
```

NASA GIBS 是唯一的运行时外部影像服务；失败时不影响静态地球和太阳系运行。行星素材、HYG 星表和小天体数据均随 GitHub Pages 静态部署，不需要后端或密钥。

## 部署 GitHub Pages

1. 将分支推送到 GitHub。
2. 在仓库 **Settings → Pages** 选择 **GitHub Actions**。
3. `.github/workflows/deploy.yml` 会构建并发布 `dist`。

资源使用相对路径，可部署在任意 GitHub Pages 仓库路径下。
