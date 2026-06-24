"""
ZTE 随身 WiFi HTTP 驱动

通过 goform HTTP API 管理 ZTE 随身 WiFi 设备（如 MF 系列），
作为 mmcli 的替代驱动，对外暴露与 modem_manager.py 相同的数据结构。

设备发现：扫描宿主机网络接口，找到响应 goform API 的 ZTE 设备。
"""

import subprocess
import ipaddress
import logging
import urllib.request
import urllib.parse
import json
import time
from typing import Optional

logger = logging.getLogger(__name__)

# ZTE 设备默认网关地址
ZTE_DEFAULT_GATEWAY = "192.168.0.1"
# ZTE USB 网卡 Vendor ID
ZTE_VENDOR_ID = "19d2"

GOFORM_GET = f"http://{ZTE_DEFAULT_GATEWAY}/goform/goform_get_cmd_process"
GOFORM_SET = f"http://{ZTE_DEFAULT_GATEWAY}/goform/goform_set_cmd_process"

STATUS_CMDS = ",".join([
    "modem_main_state", "signalbar", "network_type", "network_provider",
    "ppp_status", "rssi", "rsrp", "rsrq", "sinr",
    "realtime_tx_bytes", "realtime_rx_bytes", "realtime_time",
    "monthly_tx_bytes", "monthly_rx_bytes",
    "sim_imsi", "spn_name_data", "plmn_name",
])

INFO_CMDS = ",".join([
    "imei", "sim_imsi", "sim_iccid", "phone_num", "msisdn",
    "device_model", "hardware_version", "software_version",
])


def _get(cmd: str, timeout: int = 5) -> Optional[dict]:
    url = f"{GOFORM_GET}?multi_data=1&cmd={urllib.parse.quote(cmd)}"
    try:
        req = urllib.request.Request(url, headers={"Referer": f"http://{ZTE_DEFAULT_GATEWAY}/index.html"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read())
    except Exception as e:
        logger.debug(f"ZTE GET failed: {e}")
        return None


def _post(data: dict, timeout: int = 5) -> Optional[dict]:
    body = urllib.parse.urlencode(data).encode()
    try:
        req = urllib.request.Request(
            GOFORM_SET, data=body,
            headers={
                "Referer": f"http://{ZTE_DEFAULT_GATEWAY}/index.html",
                "Content-Type": "application/x-www-form-urlencoded",
            }
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read())
    except Exception as e:
        logger.debug(f"ZTE POST failed: {e}")
        return None


def _find_zte_interface() -> Optional[str]:
    """
    找到连接 ZTE 设备的网络接口名。

    策略（按优先级）：
    1. 扫描 USB 设备，匹配 ZTE Vendor ID (19d2)
    2. 若找不到（如 PVE USB 直通场景），找已有 192.168.0.x IP 的非主接口
    3. 找 MAC 前缀为 34:4b:50（ZTE 特征）的接口并尝试连通性
    """
    # 策略1：USB VID 匹配
    try:
        result = subprocess.run(
            ["find", "/sys/bus/usb/devices", "-name", "idVendor"],
            capture_output=True, text=True
        )
        for path in result.stdout.strip().split("\n"):
            if not path:
                continue
            try:
                vendor = open(path).read().strip()
                if vendor != ZTE_VENDOR_ID:
                    continue
                dev_path = path.replace("/idVendor", "")
                net_result = subprocess.run(
                    ["find", dev_path, "-name", "net", "-type", "d"],
                    capture_output=True, text=True
                )
                for net_path in net_result.stdout.strip().split("\n"):
                    if not net_path:
                        continue
                    ifaces = subprocess.run(
                        ["ls", net_path], capture_output=True, text=True
                    ).stdout.strip().split()
                    if ifaces:
                        return ifaces[0]
            except Exception:
                continue
    except Exception:
        pass

    # 策略2：找已有 192.168.0.x 段 IP 的接口（排除 lo）
    try:
        result = subprocess.run(["ip", "-o", "addr"], capture_output=True, text=True)
        for line in result.stdout.splitlines():
            parts = line.split()
            if len(parts) < 4:
                continue
            iface = parts[1]
            addr = parts[3].split("/")[0]
            if iface == "lo":
                continue
            if addr.startswith("192.168.0."):
                return iface
    except Exception:
        pass

    # 策略3：MAC 前缀匹配 34:4b:50（ZTE OUI）
    try:
        result = subprocess.run(["ip", "link"], capture_output=True, text=True)
        lines = result.stdout.splitlines()
        for i, line in enumerate(lines):
            if "link/ether" in line and "34:4b:50" in line:
                # 前一行包含接口名
                prev = lines[i - 1] if i > 0 else ""
                for part in prev.split():
                    if part.endswith(":"):
                        return part.rstrip(":")
    except Exception:
        pass

    return None


def _ensure_interface_up(iface: str) -> bool:
    """确保网络接口已拉起并有 IP"""
    try:
        # 检查当前 IP
        result = subprocess.run(
            ["ip", "addr", "show", iface], capture_output=True, text=True
        )
        if "192.168.0." in result.stdout:
            return True

        # 拉起接口
        subprocess.run(["ip", "link", "set", iface, "up"], check=True)
        time.sleep(1)

        # 分配固定 IP（避免依赖 DHCP 客户端）
        subprocess.run(
            ["ip", "addr", "add", "192.168.0.100/24", "dev", iface],
            capture_output=True
        )
        time.sleep(1)
        return True
    except Exception as e:
        logger.warning(f"Failed to bring up ZTE interface {iface}: {e}")
        return False


def is_available() -> bool:
    """检测是否有可用的 ZTE 设备（直接尝试 HTTP 连接）"""
    result = _get("modem_main_state", timeout=3)
    return result is not None and "modem_main_state" in result


def _signalbar_to_quality(bar: str) -> int:
    """将信号格数（0-5）转为百分比（0-100）"""
    try:
        return min(int(bar) * 20, 100)
    except (ValueError, TypeError):
        return 0


def _network_type_to_tech(nt: str) -> str:
    mapping = {
        "LTE": "lte", "4G": "lte",
        "WCDMA": "umts", "3G": "umts",
        "EDGE": "edge", "2G": "gsm", "GPRS": "gsm",
        "No Service": "",
    }
    return mapping.get(nt, nt.lower())


def _ppp_to_status(ppp: str, modem_state: str) -> str:
    if modem_state != "modem_init_complete":
        return "unknown"
    if ppp == "ppp_connected":
        return "connected"
    return "disconnected"


def get_modem_info() -> Optional[dict]:
    """
    返回与 modem_manager.list_modems() 单条记录兼容的字典。
    mm_object_path 使用合成路径 'zte:192.168.0.1'。
    """
    # 尝试直接连接（容器内通过路由可达宿主机 ZTE 接口）
    # 若无法连接，再尝试拉起接口
    status = _get(STATUS_CMDS)
    if status is None:
        iface = _find_zte_interface()
        if iface:
            _ensure_interface_up(iface)
            status = _get(STATUS_CMDS)
    if status is None:
        return None

    info = _get(INFO_CMDS)

    if not status:
        return None
    if not info:
        info = {}

    iface = _find_zte_interface() or "zte-usb"
    operator = (
        status.get("spn_name_data") or
        status.get("plmn_name") or
        status.get("network_provider") or ""
    )

    return {
        "mm_object_path": f"zte:{ZTE_DEFAULT_GATEWAY}",
        "device_path": f"net/{iface}",
        "imei": info.get("imei") or "",
        "manufacturer": "ZTE",
        "model": info.get("device_model") or "ZTE MiFi",
        "phone_number": info.get("phone_num") or info.get("msisdn") or "",
        "operator": operator,
        "signal_quality": _signalbar_to_quality(status.get("signalbar", "0")),
        "status": _ppp_to_status(
            status.get("ppp_status", ""),
            status.get("modem_main_state", "")
        ),
        "access_technologies": _network_type_to_tech(status.get("network_type", "")),
        "registration_state": "home" if operator else "",
        "tx_bytes": int(status.get("realtime_tx_bytes") or 0),
        "rx_bytes": int(status.get("realtime_rx_bytes") or 0),
        "connection_duration": int(status.get("realtime_time") or 0),
    }


def list_sms() -> list[dict]:
    """
    返回收件箱短信列表，格式与 modem_manager 兼容：
    [{"index": str, "number": str, "text": str, "timestamp": str}]
    """
    data = _post({
        "isTest": "false",
        "cmd": "sms_data_total",
        "page": "0",
        "data_per_page": "50",
        "mem_store": "1",
        "tags": "1",
        "order_by": "order by id desc",
    })
    if not data:
        return []

    messages = data.get("messages", [])
    if isinstance(messages, str):
        try:
            messages = json.loads(messages)
        except Exception:
            return []

    result = []
    for msg in messages:
        result.append({
            "index": str(msg.get("id", "")),
            "number": msg.get("number", ""),
            "text": msg.get("content", ""),
            "timestamp": msg.get("date", ""),
        })
    return result


def send_sms(number: str, text: str) -> bool:
    """发送短信，成功返回 True"""
    from datetime import datetime
    now = datetime.now()
    # ZTE 时间格式：YY;MM;DD;HH;MM;SS;TZ
    sms_time = now.strftime(f"%y;%m;%d;%H;%M;%S;0")

    # 判断编码方式
    try:
        text.encode("ascii")
        encode_type = "GSM7_default"
    except UnicodeEncodeError:
        encode_type = "UNICODE"

    result = _post({
        "goformId": "SEND_SMS",
        "Number": number,
        "sms_time": sms_time,
        "MessageBody": text,
        "ID": "-1",
        "encode_type": encode_type,
    })

    if result and result.get("result") == "success":
        return True

    logger.warning(f"ZTE SMS send failed: {result}")
    return False
