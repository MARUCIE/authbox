# Auth Box

## 概述
Auth Box 是接口授权管理平台的骨架工程，聚焦多平台账号创建、授权治理与 AI 助手接入。

## 本地启动（最小链路）

```
docker compose up -d
```

- 控制台：运行 `docker compose port console 3000` 获取宿主端口后访问
- API 健康检查：`http://localhost:8081/health`
- PostgreSQL：仅容器内访问（如需宿主访问请在 compose 中显式映射端口）
- Redis：仅容器内访问（如需宿主访问请在 compose 中显式映射端口）

## 开发说明

```
cd services/api
# Go 环境未安装时请先安装 Go 1.22+

go run ./cmd/api
```

```
cd apps/console
npm install
npm run dev
```

## 目录结构

```
apps/console        # Next.js console
services/api        # Go API service
cat doc/index.md    # documentation index
```
