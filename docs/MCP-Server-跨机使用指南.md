# MCP Server 跨机使用指南

## 方案概述

在另一台电脑的 Trae 中使用 ZoeDevOps MCP Server，有三种方案：

| 方案 | 复杂度 | 适用场景 |
|------|--------|----------|
| **A. 完整项目移植** | 中 | 需要完整开发环境 |
| **B. 仅 MCP Server 移植** | 低 | 只需要使用工具 |
| **C. 打包为可执行文件** | 低 | 给非技术人员使用 |

---

## 方案 A: 完整项目移植

### 步骤 1: 复制项目

将 `ZoeDevOps` 整个项目复制到另一台电脑

```bash
# 方式 1: 直接复制文件夹
# 复制 d:\code\ZoeDevOps_space\ZoeDevOps 到目标电脑

# 方式 2: 使用 Git
# 如果项目已提交到 Git，直接 clone
git clone <your-repo-url>
```

### 步骤 2: 安装依赖

```bash
cd ZoeDevOps/mcp-server
npm install
npm run build
```

### 步骤 3: 配置环境变量

创建 `.env` 文件：

```bash
# mcp-server/.env
ZOE_PROJECT_ID=your-project-id
ZOE_API_BASE_URL=http://your-log-api.com
ZOE_API_LOG_PATH=/api/log/query

# Redis 配置
ZOE_REDIS_HOST=localhost
ZOE_REDIS_PORT=6379

# 数据库配置
ZOE_DB_TYPE=oracle
ZOE_DB_HOST=your-db-host
ZOE_DB_PORT=1521
ZOE_DB_SERVICE_NAME=ORCL
ZOE_DB_USERNAME=your-username
ZOE_DB_PASSWORD=your-password
```

### 步骤 4: 在 Trae 中配置 MCP

编辑 Trae 的 MCP 配置文件：

**Windows**: `%APPDATA%\Trae\User\globalStorage\mcp.json`

```json
{
  "mcpServers": {
    "zoe-devops": {
      "command": "node",
      "args": ["C:\\path\\to\\ZoeDevOps\\mcp-server\\dist\\index.js"],
      "env": {
        "ZOE_PROJECT_ID": "your-project-id",
        "ZOE_API_BASE_URL": "http://your-log-api.com",
        "ZOE_DB_TYPE": "oracle",
        "ZOE_DB_HOST": "your-db-host",
        "ZOE_DB_PORT": "1521",
        "ZOE_DB_SERVICE_NAME": "ORCL",
        "ZOE_DB_USERNAME": "your-username",
        "ZOE_DB_PASSWORD": "your-password"
      }
    }
  }
}
```

---

## 方案 B: 仅 MCP Server 移植（推荐）

### 步骤 1: 提取 MCP Server

只复制 `mcp-server` 文件夹：

```
目标电脑任意位置/
└── zoe-devops-mcp/
    ├── dist/           # 编译后的文件
    ├── package.json
    └── ...
```

### 步骤 2: 安装依赖

```bash
cd zoe-devops-mcp
npm install --production
```

### 步骤 3: 配置 Trae

**Windows 路径**: `%APPDATA%\Trae\User\globalStorage\mcp.json`

```json
{
  "mcpServers": {
    "zoe-devops": {
      "command": "node",
      "args": ["C:\\tools\\zoe-devops-mcp\\dist\\index.js"],
      "env": {
        "ZOE_PROJECT_ID": "your-project-id",
        "ZOE_API_BASE_URL": "http://your-log-api.com",
        "ZOE_DB_TYPE": "oracle",
        "ZOE_DB_HOST": "your-db-host",
        "ZOE_DB_PORT": "1521",
        "ZOE_DB_SERVICE_NAME": "ORCL",
        "ZOE_DB_USERNAME": "your-username",
        "ZOE_DB_PASSWORD": "your-password"
      }
    }
  }
}
```

---

## 方案 C: 打包为可执行文件

### 步骤 1: 使用 pkg 打包

```bash
cd mcp-server

# 安装 pkg
npm install -g pkg

# 打包
pkg . --targets node18-win-x64 --output zoe-devops-mcp.exe
```

### 步骤 2: 分发

将生成的 `zoe-devops-mcp.exe` 复制到目标电脑

### 步骤 3: 配置 Trae

```json
{
  "mcpServers": {
    "zoe-devops": {
      "command": "C:\\tools\\zoe-devops-mcp.exe",
      "env": {
        "ZOE_PROJECT_ID": "your-project-id",
        "ZOE_API_BASE_URL": "http://your-log-api.com",
        "ZOE_DB_TYPE": "oracle",
        "ZOE_DB_HOST": "your-db-host",
        "ZOE_DB_PORT": "1521",
        "ZOE_DB_SERVICE_NAME": "ORCL",
        "ZOE_DB_USERNAME": "your-username",
        "ZOE_DB_PASSWORD": "your-password"
      }
    }
  }
}
```

---

## Trae 配置详解

### 找到 Trae 配置文件

**Windows**:
```
%APPDATA%\Trae\User\globalStorage\mcp.json
```

**macOS**:
```
~/Library/Application Support/Trae/User/globalStorage/mcp.json
```

**Linux**:
```
~/.config/Trae/User/globalStorage/mcp.json
```

### 完整配置示例

```json
{
  "mcpServers": {
    "zoe-devops": {
      "command": "node",
      "args": [
        "C:\\Users\\Username\\tools\\zoe-devops-mcp\\dist\\index.js"
      ],
      "env": {
        "ZOE_PROJECT_ID": "his-prod",
        "ZOE_PROJECT_NAME": "HIS Production",
        "ZOE_API_BASE_URL": "http://log-api.hospital.com",
        "ZOE_API_LOG_PATH": "/api/log/query",
        "ZOE_REDIS_HOST": "redis.hospital.com",
        "ZOE_REDIS_PORT": "6379",
        "ZOE_DB_TYPE": "oracle",
        "ZOE_DB_HOST": "db.hospital.com",
        "ZOE_DB_PORT": "1521",
        "ZOE_DB_SERVICE_NAME": "ORCL",
        "ZOE_DB_USERNAME": "query_user",
        "ZOE_DB_PASSWORD": "query_password"
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

### 验证配置

1. 重启 Trae
2. 打开一个新的 Chat 窗口
3. 查看工具栏是否出现 MCP 工具图标
4. 或者输入 `@` 查看是否有 zoe-devops 工具

---

## 常见问题

### Q1: Trae 找不到 MCP 配置文件

**解决**: 手动创建文件

```bash
# Windows
mkdir "%APPDATA%\Trae\User\globalStorage"
echo {} > "%APPDATA%\Trae\User\globalStorage\mcp.json"

# macOS
mkdir -p ~/Library/Application\ Support/Trae/User/globalStorage
echo '{}' > ~/Library/Application\ Support/Trae/User/globalStorage/mcp.json
```

### Q2: 提示 "command not found: node"

**解决**: 安装 Node.js

```bash
# 下载安装
https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi

# 验证
node --version
npm --version
```

### Q3: MCP Server 启动失败

**排查步骤**:

1. 手动测试 MCP Server
```bash
node dist/index.js
# 应该输出: zoe-devops-mcp is running on stdio
```

2. 检查环境变量
```bash
# Windows PowerShell
$env:ZOE_API_BASE_URL
$env:ZOE_DB_TYPE

# 如果为空，说明环境变量未正确传递
```

3. 查看 Trae 日志
```bash
# Windows
%APPDATA%\Trae\logs\
```

### Q4: 数据库连接失败

**检查清单**:
- [ ] 数据库主机网络可达
- [ ] 端口正确开放
- [ ] 用户名密码正确
- [ ] Oracle/达梦客户端驱动已安装

**Oracle 驱动安装**:
```bash
# Windows
npm install oracledb

# 需要 Oracle Instant Client
# 下载: https://www.oracle.com/database/technologies/instant-client.html
```

**达梦驱动安装**:
```bash
# 需要安装达梦 ODBC 驱动
# 参考达梦官方文档
```

---

## 快速部署脚本

### Windows 批处理脚本

```batch
@echo off
REM deploy-mcp.bat

echo 正在部署 ZoeDevOps MCP Server...

REM 1. 创建目录
mkdir C:\tools\zoe-devops-mcp
cd C:\tools\zoe-devops-mcp

REM 2. 复制文件（假设源码在当前目录的 mcp-server 文件夹）
xcopy /E /I "%~dp0mcp-server\*" .

REM 3. 安装依赖
call npm install --production

REM 4. 创建配置文件模板
echo {> config.template.json
echo   "ZOE_PROJECT_ID": "your-project-id",>> config.template.json
echo   "ZOE_API_BASE_URL": "http://your-api.com",>> config.template.json
echo   "ZOE_DB_TYPE": "oracle",>> config.template.json
echo   "ZOE_DB_HOST": "your-db-host",>> config.template.json
echo   "ZOE_DB_PORT": "1521",>> config.template.json
echo   "ZOE_DB_SERVICE_NAME": "ORCL",>> config.template.json
echo   "ZOE_DB_USERNAME": "username",>> config.template.json
echo   "ZOE_DB_PASSWORD": "password">> config.template.json
echo }>> config.template.json

echo.
echo 部署完成！
echo 请编辑 config.template.json 并配置到 Trae MCP 设置中
echo.
pause
```

### PowerShell 脚本

```powershell
# deploy-mcp.ps1

$targetDir = "C:\tools\zoe-devops-mcp"
$sourceDir = ".\mcp-server"

Write-Host "部署 ZoeDevOps MCP Server..." -ForegroundColor Green

# 创建目录
New-Item -ItemType Directory -Force -Path $targetDir | Out-Null

# 复制文件
Copy-Item -Path "$sourceDir\*" -Destination $targetDir -Recurse -Force

# 安装依赖
Set-Location $targetDir
npm install --production

# 生成配置文件
$config = @{
    mcpServers = @{
        "zoe-devops" = @{
            command = "node"
            args = @("$targetDir\dist\index.js")
            env = @{
                ZOE_PROJECT_ID = "your-project-id"
                ZOE_API_BASE_URL = "http://your-api.com"
                ZOE_DB_TYPE = "oracle"
                ZOE_DB_HOST = "your-db-host"
                ZOE_DB_PORT = "1521"
                ZOE_DB_SERVICE_NAME = "ORCL"
                ZOE_DB_USERNAME = "username"
                ZOE_DB_PASSWORD = "password"
            }
        }
    }
} | ConvertTo-Json -Depth 10

$config | Out-File -FilePath "$targetDir\mcp-config.json" -Encoding UTF8

Write-Host "`n部署完成！" -ForegroundColor Green
Write-Host "配置文件位置: $targetDir\mcp-config.json" -ForegroundColor Yellow
Write-Host "请将配置内容复制到 Trae 的 MCP 设置中" -ForegroundColor Yellow
```

---

## 验证 MCP 工作正常

### 测试 1: 手动运行

```bash
cd zoe-devops-mcp
node dist/index.js

# 预期输出:
# Starting zoe-devops-mcp v1.0.0...
# zoe-devops-mcp is running on stdio
```

### 测试 2: 在 Trae 中使用

在 Trae Chat 中输入：

```
使用 query_log 工具查询 traceId=abc123 的日志
```

如果 MCP 配置正确，Trae 会：
1. 识别到 `query_log` 工具
2. 询问是否执行
3. 返回查询结果

---

## 推荐方案总结

| 场景 | 推荐方案 | 原因 |
|------|----------|------|
| 开发团队使用 | 方案 A | 保留完整项目，便于修改 |
| 仅使用工具 | 方案 B | 轻量，仅需复制 mcp-server |
| 给运维人员 | 方案 C | 单文件，无需安装 Node.js |
| 临时使用 | 方案 B | 快速部署，配置简单 |
