"""
ModemManager integration via mmcli CLI tool.
Supports multiple USB 4G modems simultaneously.
"""
import subprocess
import json
import re
import asyncio
import logging
from typing import List, Optional, Dict, Any
from datetime import datetime

logger = logging.getLogger(__name__)


def _run(cmd: List[str], timeout: int = 30) -> tuple[int, str, str]:
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    return result.returncode, result.stdout.strip(), result.stderr.strip()


def list_modems() -> List[Dict[str, Any]]:
    """Return all modems detected by ModemManager."""
    code, out, err = _run(["mmcli", "-L", "-J"])
    if code != 0:
        logger.error(f"mmcli -L failed: {err}")
        return []
    try:
        data = json.loads(out)
        paths = data.get("modem-list", [])
        modems = []
        for path in paths:
            info = get_modem_info(path)
            if info:
                modems.append(info)
        return modems
    except (json.JSONDecodeError, KeyError) as e:
        logger.error(f"Failed to parse modem list: {e}")
        return []


def get_modem_info(mm_path: str) -> Optional[Dict[str, Any]]:
    """Get detailed info for a single modem by its D-Bus object path."""
    # Extract modem index from path like /org/freedesktop/ModemManager1/Modem/0
    match = re.search(r"/Modem/(\d+)$", mm_path)
    if not match:
        return None
    idx = match.group(1)
    code, out, err = _run(["mmcli", "-m", idx, "-J"])
    if code != 0:
        logger.error(f"mmcli -m {idx} failed: {err}")
        return None
    try:
        data = json.loads(out)
        m = data["modem"]
        generic = m.get("generic", {})
        threegpp = m.get("3gpp", {})
        access_techs = generic.get("access-technologies", [])
        if isinstance(access_techs, list):
            access_technologies = ",".join(access_techs)
        else:
            access_technologies = str(access_techs)

        reg_state = threegpp.get("registration-state", "") or ""

        bearer_stats = _get_bearer_stats(idx)
        sim_info = _get_sim_info(generic.get("sim", ""))
        bands = generic.get("current-bands", [])
        current_bands = ",".join(bands) if isinstance(bands, list) else str(bands)
        ports = generic.get("ports", [])
        ports_str = ",".join(ports) if isinstance(ports, list) else str(ports)
        return {
            "mm_object_path": mm_path,
            "mm_index": idx,
            "device_path": generic.get("primary-port", ""),
            "manufacturer": generic.get("manufacturer", ""),
            "model": generic.get("model", ""),
            "imei": threegpp.get("imei", ""),
            "operator": threegpp.get("operator-name", ""),
            "signal_quality": int(generic.get("signal-quality", {}).get("value", 0)),
            "raw_state": generic.get("state", "unknown"),
            "status": _map_state(generic.get("state", "unknown")),
            "phone_number": _parse_own_number(generic) or _get_phone_number(idx),
            "access_technologies": access_technologies,
            "registration_state": reg_state,
            "tx_bytes": bearer_stats.get("tx_bytes", 0),
            "rx_bytes": bearer_stats.get("rx_bytes", 0),
            "connection_duration": bearer_stats.get("connection_duration", 0),
            "imsi": sim_info.get("imsi", ""),
            "iccid": sim_info.get("iccid", ""),
            "firmware_revision": generic.get("revision", ""),
            "hardware_revision": generic.get("hardware-revision", ""),
            "current_bands": current_bands,
            "sim_operator_name": sim_info.get("sim_operator_name", ""),
            "sim_operator_code": sim_info.get("sim_operator_code", ""),
            "current_modes": generic.get("current-modes", ""),
            "ports": ports_str,
            "plugin": generic.get("plugin", ""),
        }
    except (json.JSONDecodeError, KeyError) as e:
        logger.error(f"Failed to parse modem info: {e}")
        return None


def _get_bearer_stats(idx: str) -> dict:
    """Fetch TX/RX bytes and connection duration from the active bearer."""
    code, out, _ = _run(["mmcli", "-m", idx, "--list-bearers", "-J"])
    if code != 0:
        return {}
    try:
        data = json.loads(out)
        paths = data.get("modem.bearers.dbus-path", []) or data.get("bearer-list", [])
        if not paths:
            return {}
        bearer_path = paths[0]
        match = re.search(r"/Bearer/(\d+)$", bearer_path)
        if not match:
            return {}
        b_idx = match.group(1)
        code2, out2, _ = _run(["mmcli", "-b", b_idx, "-J"])
        if code2 != 0:
            return {}
        b = json.loads(out2).get("bearer", {})
        stats = b.get("stats", {})
        status = b.get("status", {})
        return {
            "tx_bytes": int(stats.get("tx-bytes", 0) or 0),
            "rx_bytes": int(stats.get("rx-bytes", 0) or 0),
            "connection_duration": int(status.get("connection-duration", 0) or 0),
        }
    except Exception:
        return {}


def _get_sim_info(sim_path: str) -> dict:
    """Fetch IMSI and ICCID from the SIM object."""
    if not sim_path:
        return {}
    match = re.search(r"/SIM/(\d+)$", sim_path)
    if not match:
        return {}
    sim_idx = match.group(1)
    code, out, _ = _run(["mmcli", "-i", sim_idx, "-J"])
    if code != 0:
        return {}
    try:
        props = json.loads(out).get("sim", {}).get("properties", {})
        return {
            "imsi": props.get("imsi", ""),
            "iccid": props.get("iccid", ""),
            "sim_operator_name": props.get("operator-name", ""),
            "sim_operator_code": props.get("operator-code", ""),
        }
    except Exception:
        return {}


def _parse_own_number(generic: dict) -> str:
    numbers = generic.get("own-numbers", [])
    if isinstance(numbers, list) and numbers:
        return numbers[0]
    return ""


def _get_phone_number(idx: str) -> str:
    # AT+CNUM 通过 mmcli 透传 AT 命令给调制解调器，部分 SIM 卡不支持此命令会返回空
    code, out, err = _run(["mmcli", "-m", idx, "--command=AT+CNUM", "-J"])
    if code != 0:
        return ""
    try:
        data = json.loads(out)
        response = data.get("modem", {}).get("command", {}).get("response", "")
        match = re.search(r'\+CNUM:.*?"(\+?\d+)"', response)
        return match.group(1) if match else ""
    except Exception:
        return ""


def _map_state(state: str) -> str:
    mapping = {
        "registered": "connected",
        "connected": "connected",
        "disabled": "disconnected",
        "disabling": "disconnected",
        "enabling": "disconnected",
        "searching": "disconnected",
        "failed": "error",
    }
    return mapping.get(state.lower(), "unknown")


def send_sms(mm_index: str, phone_number: str, text: str) -> tuple[bool, str]:
    """Send an SMS via a specific modem. Returns (success, message).

    mmcli 短信发送是三步对象操作（非单条命令）：
    1. --messaging-create-sms  → 创建 SMS 对象，得到 /SMS/<n> 路径
    2. -s <n> --send            → 实际发送
    3. -s <n> --delete          → 清理已发送对象（否则占用设备内存）

    --messaging-create-sms 的值按逗号解析，text 内若含逗号会被截断，
    故用 text="..." 引号形式将内容作为整体传入。
    """
    escaped = text.replace('"', '\\"')
    cmd = ["mmcli", "-m", mm_index, f'--messaging-create-sms=number={phone_number},text="{escaped}"']
    code, out, err = _run(cmd)
    if code != 0:
        return False, err

    # 从输出 "SMS /org/.../SMS/0 successfully created" 中提取短信对象索引
    match = re.search(r"/SMS/(\d+)", out)
    if not match:
        return False, "Could not find created SMS index"

    sms_idx = match.group(1)
    try:
        code2, out2, err2 = _run(["mmcli", "-m", mm_index, "-s", sms_idx, "--send"], timeout=20)
    except subprocess.TimeoutExpired:
        _run(["mmcli", "-m", mm_index, "-s", sms_idx, "--delete"])
        return False, "发送超时：设备已注册但网络拒绝短信，请确认SIM卡已开通短信服务或VoLTE功能"
    if code2 != 0:
        _run(["mmcli", "-m", mm_index, "-s", sms_idx, "--delete"])
        return False, err2

    _run(["mmcli", "-m", mm_index, "-s", sms_idx, "--delete"])
    return True, "sent"


def list_inbox(mm_index: str) -> List[Dict[str, Any]]:
    """List received SMS messages for a modem."""
    code, out, err = _run(["mmcli", "-m", mm_index, "--messaging-list-sms", "-J"])
    if code != 0:
        return []
    try:
        data = json.loads(out)
        paths = data.get("modem.messaging.sms", [])
        messages = []
        for path in paths:
            match = re.search(r"/SMS/(\d+)$", path)
            if not match:
                continue
            sms_idx = match.group(1)
            code2, out2, _ = _run(["mmcli", "-m", mm_index, "-s", sms_idx, "-J"])
            if code2 == 0:
                try:
                    sms_data = json.loads(out2)
                    sms = sms_data.get("sms", {}).get("content", {})
                    props = sms_data.get("sms", {}).get("properties", {})
                    # 只收录真正收到的短信（deliver），排除发出/待发的（submit）
                    if props.get("pdu-type", "") != "deliver":
                        continue
                    messages.append({
                        "sms_index": sms_idx,
                        "phone_number": sms.get("number", ""),
                        "content": sms.get("text", ""),
                        "timestamp": props.get("timestamp", ""),
                        "state": props.get("state", ""),
                    })
                except Exception:
                    pass
        return messages
    except Exception:
        return []


def delete_sms_from_modem(mm_object_path: str, mm_sms_index: str) -> bool:
    """Delete an SMS object from the modem (inbound cleanup)."""
    if mm_object_path.startswith("zte:"):
        return True  # ZTE SMS index不对应mmcli对象，跳过
    # mm_object_path 形如 /org/freedesktop/ModemManager1/Modem/0
    # SMS D-Bus 路径形如 /org/freedesktop/ModemManager1/SMS/<index>
    base = mm_object_path.rsplit("/Modem/", 1)[0]
    sms_path = f"{base}/SMS/{mm_sms_index}"
    match = re.search(r"/Modem/(\d+)$", mm_object_path)
    if not match:
        return False
    mm_index = match.group(1)
    code, _, _ = _run(["mmcli", "-m", mm_index, f"--messaging-delete-sms={sms_path}"])
    return code == 0


def enable_modem(mm_index: str) -> bool:
    """Enable a disabled modem so it can register to the network."""
    code, _out, err = _run(["mmcli", "-m", mm_index, "-e"])
    if code != 0:
        logger.error(f"mmcli enable modem {mm_index} failed: {err}")
    return code == 0
