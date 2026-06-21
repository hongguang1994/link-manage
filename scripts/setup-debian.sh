#!/bin/bash
# Debian 环境初始化脚本
# 运行: sudo bash scripts/setup-debian.sh

set -e

echo "=== 安装系统依赖 ==="
apt-get update
apt-get install -y \
    modemmanager \
    libdbus-1-dev \
    libglib2.0-dev \
    python3 python3-pip python3-venv \
    nodejs npm \
    udev

echo "=== 启动 ModemManager 服务 ==="
systemctl enable ModemManager
systemctl start ModemManager

echo "=== 添加当前用户到 dialout 组（允许访问串口）==="
usermod -aG dialout "$SUDO_USER"

echo "=== 配置 udev 规则（USB 4G 模块热插拔）==="
cat > /etc/udev/rules.d/99-usb-modem.rules << 'EOF'
# USB 4G modem - reload ModemManager on plug/unplug
SUBSYSTEM=="tty", ATTRS{idVendor}=="*", ENV{ID_MM_CANDIDATE}="1", TAG+="systemd", ENV{SYSTEMD_WANTS}="ModemManager.service"
EOF
udevadm control --reload-rules

echo "=== 后端 Python 环境 ==="
cd "$(dirname "$0")/.."
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt

echo "=== 前端依赖 ==="
cd frontend
npm install
cd ..

echo ""
echo "✅ 安装完成！"
echo ""
echo "启动后端:  cd backend && .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000"
echo "启动前端:  cd frontend && npm run dev"
echo ""
echo "⚠️  请重新登录以使 dialout 组权限生效"
