# Phone Remote Input

手机浏览器访问 `https://your-domain.example.com`，登录后通过 WebSocket 把键盘、文本、剪贴板、鼠标事件实时发送到 Windows 主机，由 Python 服务注入为真实输入事件。

## 目录结构

```text
web-inputer/
  app/
    __init__.py
    auth.py                 # 登录、JWT session、限流、来源校验
    config.py               # 环境变量配置
    input_controller.py     # pywin32/pynput 键盘鼠标剪贴板注入
    main.py                 # FastAPI + WebSocket + 静态前端
    static/
      index.html
      styles.css
      app.js
      manifest.webmanifest
      sw.js
  deploy/
    cloudflared-aiapi.yml
    remote-input.service
    cloudflared-aiapi.service
  scripts/
    start-dev.ps1
    install-nssm-service.ps1
    uninstall-nssm-service.ps1
    install-cloudflared-windows.ps1
  requirements.txt
  .env.example
  Dockerfile
  docker-compose.yml
  run.py
```

## 功能

- FastAPI + WebSocket 实时通信
- 手机端深色移动 UI，支持 iPhone Safari
- 字母、数字、Enter、Ctrl、Alt、Shift、Win、Backspace、方向键
- 组合键：先点 Ctrl/Alt/Shift/Win 锁定，再点其他键，再点一次释放
- 长按：按住字母/数字按钮会发送 key down/up
- 文本输入：通过剪贴板粘贴，适合中文和长文本
- 心跳检测和延迟显示
- 自动断线重连
- 多客户端控制锁
- 登录密码 + JWT session cookie
- WebSocket 鉴权和 Origin 校验
- 登录限流、输入事件限流、日志记录 IP
- 可用 NSSM 注册 Windows Service，开机自启、后台运行、崩溃恢复
- Cloudflare Tunnel 反向代理到本地服务，支持 HTTPS/WSS

## 前端开发

本项目的页面源码在 `frontend/`，使用 Vue 3 + Vite + pnpm + Naive UI。生产仍由 FastAPI 服务 `app/static/dist` 的构建产物。

```powershell
pnpm --dir frontend install
pnpm --dir frontend build
```

开发时先启动后端，再启动 Vite：

```powershell
.\.venv\Scripts\python.exe -X utf8 -m uvicorn app.main:app --host 127.0.0.1 --port 8790 --reload --proxy-headers --forwarded-allow-ips='*'
pnpm --dir frontend dev
```

## Windows 本地启动

1. 安装 Python 3.11+。
2. 复制环境变量：

```powershell
Copy-Item .env.example .env
```

3. 修改 `.env`：

```env
SECRET_KEY=至少32位随机字符串，建议64位
ADMIN_PASSWORD=你的强密码
PUBLIC_ORIGIN=https://your-domain.example.com
ALLOWED_ORIGINS=https://your-domain.example.com
SESSION_TTL_SECONDS=28800
TRUSTED_DEVICE_SESSION_TTL_SECONDS=2592000
```

4. 启动：

```powershell
.\scripts\start-dev.ps1
```

5. 本机测试：

```powershell
Invoke-WebRequest http://127.0.0.1:8790/health
```

> 注意：生产通过 Cloudflare 访问时 cookie 使用 `Secure`，必须走 HTTPS。直接用 `http://127.0.0.1:8790` 登录时浏览器可能不会保存 Secure Cookie。

## Cloudflare Tunnel

隧道名：`aiapi`

域名：`your-domain.example.com`

配置文件：`deploy/cloudflared-aiapi.yml`

```yaml
tunnel: aiapi
credentials-file: C:\Users\SsuJo_\.cloudflared\aiapi.json

originRequest:
  connectTimeout: 10s
  keepAliveConnections: 100
  keepAliveTimeout: 90s
  noTLSVerify: false

ingress:
  - hostname: your-domain.example.com
    service: http://127.0.0.1:8790
  - service: http_status:404
```

首次创建隧道和 DNS：

```powershell
cloudflared tunnel login
cloudflared tunnel create aiapi
cloudflared tunnel route dns aiapi your-domain.example.com
```

前台测试：

```powershell
cloudflared tunnel --config .\deploy\cloudflared-aiapi.yml run aiapi
```

Windows service 安装：

```powershell
.\scripts\install-cloudflared-windows.ps1
```

Cloudflare Tunnel 会自动重连，WebSocket 会通过 `wss://your-domain.example.com/ws` 工作。

## Windows Service（NSSM 推荐）

下载 NSSM 后确保 `nssm.exe` 在 PATH，或传入完整路径。

安装并启动：

```powershell
.\scripts\install-nssm-service.ps1 -ServiceName RemoteInput -NssmPath C:\tools\nssm\win64\nssm.exe
```

停止：

```powershell
nssm stop RemoteInput
```

启动：

```powershell
nssm start RemoteInput
```

卸载：

```powershell
.\scripts\uninstall-nssm-service.ps1 -ServiceName RemoteInput -NssmPath C:\tools\nssm\win64\nssm.exe
```

查看日志：

```powershell
Get-Content .\logs\remote-input.log -Tail 100
Get-Content .\logs\service-err.log -Tail 100
```

## Linux systemd 示例

如果后端部署在 Linux，可参考：

- `deploy/remote-input.service`
- `deploy/cloudflared-aiapi.service`

但键盘注入目标是 Windows 主机，因此实际控制 Windows 键盘时应在 Windows 上运行 Python 服务。

## API 与 WebSocket

- `POST /api/login`：提交 `{ "password": "...", "keepSignedIn": false }`，成功后写入 `remote_input_session` HttpOnly cookie；勾选记住登录状态时使用长期可信设备 session。
- `POST /api/logout`：清除 session。
- `GET /api/session`：检查登录状态。
- `GET /health`：健康检查。
- `WS /ws`：实时输入通道，必须携带 session cookie，且 Origin 必须匹配 `.env` 的 `PUBLIC_ORIGIN` 或 `ALLOWED_ORIGINS`。

WebSocket 输入消息示例：

```json
{ "type": "input", "action": "tap", "key": "enter" }
{ "type": "input", "action": "down", "key": "ctrl" }
{ "type": "input", "action": "tap", "key": "c" }
{ "type": "input", "action": "up", "key": "ctrl" }
{ "type": "input", "action": "text", "text": "hello" }
{ "type": "input", "action": "mouse_move", "x": 12, "y": -4 }
```

## 安全建议

1. `ADMIN_PASSWORD` 使用强密码，不要提交 `.env`。
2. `SECRET_KEY` 使用随机 64 位以上字符串。
3. Cloudflare Access 可额外套一层邮箱/OTP 鉴权。
4. Cloudflare WAF 可给 `/api/login` 添加速率规则。
5. 只监听 `127.0.0.1:8790`，不要直接暴露本机端口。
6. 保持 `PUBLIC_ORIGIN=https://your-domain.example.com`，避免其他 Origin 建立 WebSocket。
7. “记住登录状态”不会在前端保存明文密码，只会签发更长有效期的 HttpOnly session cookie；未勾选使用 `SESSION_TTL_SECONDS`，勾选使用 `TRUSTED_DEVICE_SESSION_TTL_SECONDS`。
8. 日志文件默认在 `logs/remote-input.log`，包含登录失败、限流和 WebSocket 连接 IP。

## 调试方法

后端语法检查：

```powershell
.\.venv\Scripts\python.exe -X utf8 -m compileall app
```

启动调试：

```powershell
.\.venv\Scripts\python.exe -X utf8 -m uvicorn app.main:app --host 127.0.0.1 --port 8790 --reload --proxy-headers --forwarded-allow-ips='*'
```

Cloudflare 调试：

```powershell
cloudflared tunnel --loglevel debug --config .\deploy\cloudflared-aiapi.yml run aiapi
```

浏览器调试：

- 打开 Safari/Chrome 开发者工具，查看 WebSocket `/ws` 是否 101 Switching Protocols。
- 登录成功但 WebSocket 断开时，检查 `.env` 的 `PUBLIC_ORIGIN` 是否精确等于 `https://your-domain.example.com`。

## 常见错误

### 登录成功但仍显示未登录

原因通常是直接用 HTTP 访问，本项目 cookie 开启 `Secure`。生产请使用 `https://your-domain.example.com`。

### WebSocket 1008 关闭

通常是 Origin 不匹配或 session cookie 缺失。检查：

```env
PUBLIC_ORIGIN=https://your-domain.example.com
ALLOWED_ORIGINS=https://your-domain.example.com
```

### Windows 无法注入键盘

- 确认服务运行在当前桌面用户会话中。Windows Service 在 Session 0 中可能无法控制当前交互桌面。
- 如果 NSSM 服务无法注入当前桌面，改用“任务计划程序：用户登录时运行”启动 `python run.py`。
- 以管理员启动服务通常无法控制非管理员窗口，目标程序权限需要一致。

### 中文输入不稳定

文本输入使用剪贴板 + Ctrl+V，这是 Windows 上最稳定的跨语言输入方式。单个按键事件主要适合英文、数字和控制键。

### Cloudflare Tunnel 502

- 确认 Python 服务在 `127.0.0.1:8790` 正常。
- 确认 `cloudflared-aiapi.yml` 的 credentials-file 路径正确。
- 前台运行 `cloudflared tunnel --loglevel debug ...` 查看错误。

## Docker

Docker 可用于开发或非 Windows 环境，但容器内无法直接注入 Windows 桌面键盘事件。

```powershell
docker compose up --build
```

