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


def _run(cmd: List[str]) -> tuple[int, str, str]:
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
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
        return {
            "mm_object_path": mm_path,
            "mm_index": idx,
            "device_path": generic.get("primary-port", ""),
            "manufacturer": generic.get("manufacturer", ""),
            "model": generic.get("model", ""),
            "imei": threegpp.get("imei", ""),
            "operator": threegpp.get("operator-name", ""),
            "signal_quality": int(generic.get("signal-quality", {}).get("value", 0)),
            "status": _map_state(generic.get("state", "unknown")),
            "phone_number": _get_phone_number(idx),
        }
    except (json.JSONDecodeError, KeyError) as e:
        logger.error(f"Failed to parse modem info: {e}")
        return None


def _get_phone_number(idx: str) -> str:
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
    """Send an SMS via a specific modem. Returns (success, message)."""
    cmd = [
        "mmcli", "-m", mm_index,
        f"--messaging-create-sms=number={phone_number},text={text}"
    ]
    code, out, err = _run(cmd)
    if code != 0:
        return False, err

    # Extract SMS index from output like "SMS /org/.../SMS/0 successfully created"
    match = re.search(r"/SMS/(\d+)", out)
    if not match:
        return False, "Could not find created SMS index"

    sms_idx = match.group(1)
    code2, out2, err2 = _run(["mmcli", "-m", mm_index, "-s", sms_idx, "--send"])
    if code2 != 0:
        return False, err2

    # Cleanup sent message
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
