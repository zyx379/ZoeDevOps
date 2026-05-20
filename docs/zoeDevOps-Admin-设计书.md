# ZoeDevOps Admin 后台管理系统

## 一、项目管理

将客户端本地 SQLite 中的项目配置迁移到管理端统一管理，客户端从管理端拉取配置。

### 1.1 项目信息管理

- 项目的增删改查（对应 `projects` 表：名称、描述、是否启用）
- 项目状态控制：启用/停用项目，停用后关联客户端不可见

### 1.2 项目级配置管理

每个项目下管理以下配置（对应 `project_configs` 表）：

- API 连接配置：apiBaseUrl、apiTokenPath、apiVersionPath、apiLogPath
- Redis 连接配置：host、port、password、db

### 1.3 数据源管理

每个项目下管理数据库连接（对应 `data_sources` 表）：

- 支持 Oracle / 达梦 两种类型
- 配置项：host、port、sid/serviceName、schema、用户名、密码

### 1.4 代码仓库管理

每个项目下管理代码仓库（对应 `code_repositories` 表）：

- 配置项：仓库名称、仓库地址、服务匹配模式、GitLab Token、默认分支

---

## 二、用户管理

### 2.1 用户账号

- 用户的增删改查（用户名、密码、状态）
- 登录认证

### 2.2 项目分发

- 为用户分配可访问的项目（一个用户可访问多个项目）
- 客户端使用用户凭证拉取被授权的项目配置

---

## 三、AI 模型管理

### 3.1 模型配置

管理 AI 模型连接信息（对应 `global_config` 表）：

- API Key、Base URL、模型名称
- 可配置多套模型，供不同项目/用户使用

### 3.2 模型分配

- 为项目或用户指定使用哪套 AI 模型配置

