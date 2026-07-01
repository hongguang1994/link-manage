from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, Enum
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from app.core.database import Base


class ModemStatus(str, enum.Enum):
    CONNECTED = "connected"
    DISCONNECTED = "disconnected"
    ERROR = "error"
    UNKNOWN = "unknown"


class Modem(Base):
    __tablename__ = "modems"

    id = Column(Integer, primary_key=True, index=True)
    device_path = Column(String(100))
    # mm_object_path 是设备唯一键，格式：
    #   标准 mmcli 设备：/org/freedesktop/ModemManager1/Modem/<n>
    #   ZTE 随身 WiFi：  zte:192.168.0.1（合成路径，非 D-Bus）
    # 不要用 device_path 或 imei 作唯一标识（可能为空或在设备重启后变更）
    mm_object_path = Column(String(200), unique=True, nullable=False)
    imei = Column(String(20), unique=True)
    manufacturer = Column(String(100))
    model = Column(String(100))
    phone_number = Column(String(30))
    operator = Column(String(100))
    signal_quality = Column(Integer, default=0)
    status = Column(Enum(ModemStatus), default=ModemStatus.UNKNOWN)
    alias = Column(String(100))
    is_active = Column(Boolean, default=True)
    last_seen = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Extended stats (populated by poller)
    access_technologies = Column(String(100))   # e.g. "lte", "umts"
    registration_state = Column(String(50))     # e.g. "home", "roaming"
    tx_bytes = Column(Integer, default=0)       # bytes sent via bearer
    rx_bytes = Column(Integer, default=0)       # bytes received via bearer
    connection_duration = Column(Integer, default=0)  # seconds

    # SIM card details
    imsi = Column(String(20))
    iccid = Column(String(30))
    firmware_revision = Column(String(100))
    hardware_revision = Column(String(50))
    current_bands = Column(String(500))         # comma-separated band list
    sim_operator_name = Column(String(100))     # SIM card operator name (e.g. giffgaff)
    sim_operator_code = Column(String(20))      # MCC+MNC (e.g. 23410)
    current_modes = Column(String(200))         # e.g. "allowed: 2g, 3g, 4g; preferred: 4g"
    ports = Column(String(300))                 # comma-separated port list
    plugin = Column(String(50))                 # MM plugin name (e.g. quectel)

    sms_messages = relationship("SmsMessage", back_populates="modem")
    scheduled_tasks = relationship("SmsScheduledTask", back_populates="modem")
