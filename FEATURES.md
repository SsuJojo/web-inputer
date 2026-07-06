# web-inputer 功能与亮点

## 基础功能

- 手机浏览器实时控制 Windows 键盘输入
- 手机浏览器实时控制鼠标移动、点击、滚轮
- 文本输入与发送
- 剪贴板同步
- 屏幕预览实时推送（MJPEG 流）
- 屏幕光标位置同步
- 虚拟按键区：Ctrl、Alt、Shift、Win、ESC、Tab、退格、方向键
- 桌面切换（左右虚拟桌面）
- 窗口切换
- 屏幕截图放大预览
- PWA 支持，可添加到手机桌面
- 按键气泡反馈
- 按键震动反馈
- 滚轮灵敏度可调
- 触控板灵敏度可调
- 触控板折叠/展开
- 多行文本输入
- 登录页“记住登录状态”

## 连接与网络

- WebSocket 实时双向通信
- Ping/Pong 心跳保活
- 局域网直连模式（手机和电脑同一网络）
- 公网隧道模式（配合 Cloudflare Tunnel / 反向代理）
- 直连自动探测与自动切换
- 公网连接断开后自动回退到直连
- 直连探测失败后自动回退到公网
- 客户端连接状态实时显示
- 延迟实时显示

## 安全与鉴权

- 登录密码保护
- HttpOnly Session Cookie
- JWT 会话令牌
- 可配置会话过期时间
- 可信设备延长会话
- 登录频率限制（防暴力破解）
- WebSocket 速率限制（防输入洪泛）
- CORS Origin 校验
- Tailscale 内网 IP 支持
- HTTPS 安全头：
  - HSTS
  - X-Frame-Options
  - X-Content-Type-Options
  - Referrer-Policy
  - Permissions-Policy

## 配置与部署

- `.env` 文件配置全部参数
- 首次运行自动生成 `.env`
- 自动生成随机 `SECRET_KEY`
- 自动生成随机 `ADMIN_PASSWORD`
- 公开域名配置化，前端由服务端注入，代码无硬编码
- 支持 Cloudflare Tunnel 部署
- 支持 Docker 部署（Dockerfile + docker-compose）
- 支持 systemd 服务部署
- 支持 Windows NSSM 服务部署
- 脱敏后开源，无敏感域名/密钥残留

## 打包与分发

- PyInstaller 单文件 exe 打包
- `build.bat` 一键重新构建
- `快速启动.bat` 一键启动开发环境
- exe 内置全部静态资源，双击即用
- GitHub Actions CI 自动构建 exe
- 打 tag 自动发布 GitHub Release 并附带 exe 下载

## 前端体验

- 响应式移动端 UI
- 暗色主题
- 触控板区域（单指移动 + 轻点左键）
- 滚轮区域（长按拖动）
- 文本框自动折叠/展开
- 屏幕预览可关闭
- 设置面板集成在页面内
- Service Worker 离线缓存

## 后端架构

- FastAPI + Uvicorn
- pynput 键鼠注入
- mss 屏幕截图
- Pillow 图像处理
- win32api / win32gui 窗口控制
- asyncio 非阻塞事件循环
- 输入控制器与截图器独立线程
- 活跃控制器互斥（同一时间只允许一个客户端控制）
- 空闲超时自动释放控制权
- 结构化日志（控制台 + 文件）

## 项目亮点

- 手机即遥控器：无需安装手机 App，浏览器打开即可使用
- 既支持局域网，也支持公网隧道
- 直连与公网可自动探测、切换、回退
- 首次运行自动生成安全配置，降低部署门槛
- 前后端域名完全配置化，适合开源发布
- Windows exe 单文件分发，非技术用户也能直接运行
- CI 自动构建和 Release 发布，方便持续分发
