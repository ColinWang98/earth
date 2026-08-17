# 地球与太阳系观察 / Live Earth & Solar System

一个可直接部署到 GitHub Pages 的静态 WebXR 天文场景。从近地轨道开始，在同一个页面中观察 NASA 近实时地球影像，并以自由飞行方式进入真实位置驱动的太阳系。

## 本地运行

```bash
npm install
npm run dev
```

## 操作方式

- 默认模式：左键拖拽环绕地球，滚轮拉近或拉远，可使用预设机位。
- 自由飞行：`WASD` 平移，`Q/E` 升降，鼠标转向，`Shift` 加速，滚轮调节基础速度，`Esc` 释放鼠标。
- 对象选择：直接点击太阳、月球、八大行星或重点小天体，显示对应详情，不会移动相机。
- Quest 3：先用射线点击腕部面板的“自由飞行”，再用左摇杆平移、右摇杆转向和升降、扳机加速、握把减速；面板可随时退出自由飞行。
- 时间轴：支持 1900–2100、暂停、正反向倍速与回到当前时间。

## 地球观测数据

首屏直接使用随站点发布的 `2026-08-15` NASA GIBS VIIRS/Suomi NPP 4K 真彩快照，不会自动请求远程影像。点击“更新卫星影像”后，页面才会探测当天及之前三天并选择最新覆盖较完整的全球影像；高性能桌面近景会在显卡、设备内存和帧时间允许时加载 8192×4096，普通桌面加载 4096×2048，Quest/移动端加载 2048×1024。8K 请求或性能不满足要求时自动退回 4K。

时间轴变化不会自动下载贴图；按钮始终请求点击时的最新近实时影像。云层只来自 VIIRS 真彩观测本身，不再叠加人工漂移云壳；状态栏会持续显示实际分辨率、观测日期、延迟、数据源和是否使用预存快照。

这是近实时卫星真彩影像，不是实时直播。极轨产品通常在获取后约 3 小时可用；当天全球覆盖尚未完成时，页面会选择最近的完整日期。网络失败时继续显示带日期标识的预存 NASA 快照；Blue Marble 仅用于填补极区卫星观测缺口。

- [NASA GIBS API](https://nasa-gibs.github.io/gibs-api-docs/access-basics/)
- [NASA Worldview / GIBS imagery](https://worldview.earthdata.nasa.gov/)

中国国家卫星气象中心也提供免费、无访问限制且允许跨域调用的[风云卫星 WMS 影像接口](https://www.nsmc.org.cn/nsmc/cn/image/wms.html)。其中 `FY3F_MERSI` 为每日全球影像，`GEOS_IRX` 为每小时红外拼图；实测 FY-3F 区域请求有效，但全球单图请求可能为空，稳定接入需要分块拼接，因此当前版本暂不作为运行时数据源。

## 天文与视觉数据

- 太阳、月球和八大行星的位置由 Astronomy Engine 在浏览器计算，参考系为日心黄道 J2000。
- 地球实体按 Astronomy Engine 格林尼治恒星时逐帧自转，自转轴采用 J2000 平均黄赤交角 `23.4392911°`；相机和 HYG 星空保持惯性。暂停、倒放和倍速会同步驱动地球与昼夜线，不会重复计算太阳旋转。
- 三维轨道由 Astronomy Engine 在所选日期附近按各行星公转周期采样，不使用共面圆环近似。
- 近地观察可拉远查看月球真实倾角轨道和太阳方向；进入行星际尺度后显示太阳、地球绕日轨道及其他行星轨道。
- 默认开启七颗重点小天体：谷神星、灶神星、爱神星、贝努、阿波菲斯、哈雷彗星和恩克彗星；位置和非共面轨道来自随项目发布的 NASA/JPL SBDB 根数快照。
- 小天体公转位置在渲染帧之间连续插值；自转周期与可用极轴来自 JPL SBDB。缺少完整极轴的目标使用界面明确标识的示意轴。
- NASA VTAD small-body shapes：选中谷神星、灶神星、爱神星或贝努时按需加载本地化的 NASA 真实形状模型；其他目标使用确定性程序岩石。来源：[Ceres](https://science.nasa.gov/resource/ceres-3d-model/)、[Vesta](https://science.nasa.gov/resource/vesta-3d-model/)、[Eros](https://science.nasa.gov/resource/eros-3d-model/)、[Bennu](https://science.nasa.gov/resource/bennu-3d-model/)。
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

NASA GIBS 是唯一的运行时外部影像服务，并且只在用户点击更新按钮后访问；失败时不影响预存 NASA 地球和太阳系运行。行星素材、HYG 星表和小天体数据均随 GitHub Pages 静态部署，不需要后端或密钥。

## 部署 GitHub Pages

1. 将分支推送到 GitHub。
2. 在仓库 **Settings → Pages** 选择 **GitHub Actions**。
3. `.github/workflows/deploy.yml` 会构建并发布 `dist`。

资源使用相对路径，可部署在任意 GitHub Pages 仓库路径下。
