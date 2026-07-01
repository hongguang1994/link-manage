# ── 阶段1：编译 ──────────────────────────────────────────────────────────────
FROM golang:1.23-bookworm AS builder

WORKDIR /build

# 先复制依赖文件，利用 Docker 层缓存（代码变动时不重新下载依赖）
COPY go.mod go.sum ./
RUN go mod download

# 复制源码并编译（CGO 需要开启，因为 gorm/sqlite 依赖 cgo）
COPY . .
RUN CGO_ENABLED=1 GOOS=linux go build -o simnexus .

# ── 阶段2：运行时镜像 ────────────────────────────────────────────────────────
FROM debian:bookworm-slim

# 安装运行时依赖：
#   modemmanager / mmcli — 与宿主机 ModemManager 通信
#   ca-certificates      — HTTPS 请求（Telegram API）
RUN apt-get update && apt-get install -y \
    modemmanager \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /build/simnexus .

# 上传文件存储目录
RUN mkdir -p /opt/simnexus/uploads

EXPOSE 8000

CMD ["./simnexus"]
