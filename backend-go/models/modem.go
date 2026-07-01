package models

import "time"

// Modem status values.
const (
	ModemConnected    = "connected"
	ModemDisconnected = "disconnected"
	ModemError        = "error"
	ModemUnknown      = "unknown"
)

type Modem struct {
	ID           uint   `gorm:"primaryKey" json:"id"`
	DevicePath   string `gorm:"size:100" json:"device_path"`
	MmObjectPath string `gorm:"column:mm_object_path;size:200;uniqueIndex;not null" json:"mm_object_path"`
	Imei         string `gorm:"size:20;uniqueIndex" json:"imei"`
	Manufacturer string `gorm:"size:100" json:"manufacturer"`
	Model        string `gorm:"size:100" json:"model"`
	PhoneNumber  string `gorm:"size:30" json:"phone_number"`
	Operator     string `gorm:"size:100" json:"operator"`

	SignalQuality int       `gorm:"default:0" json:"signal_quality"`
	Status        string    `gorm:"size:20;default:unknown" json:"status"`
	Alias         string    `gorm:"size:100" json:"alias"`
	IsActive      bool      `gorm:"default:true" json:"is_active"`
	LastSeen      time.Time `json:"last_seen"`
	CreatedAt     time.Time `json:"created_at"`

	AccessTechnologies string `gorm:"size:100" json:"access_technologies"`
	RegistrationState  string `gorm:"size:50" json:"registration_state"`
	TxBytes            int64  `gorm:"default:0" json:"tx_bytes"`
	RxBytes            int64  `gorm:"default:0" json:"rx_bytes"`
	ConnectionDuration int64  `gorm:"default:0" json:"connection_duration"`

	Imsi             string `gorm:"size:20" json:"imsi"`
	Iccid            string `gorm:"size:30" json:"iccid"`
	FirmwareRevision string `gorm:"size:100" json:"firmware_revision"`
	HardwareRevision string `gorm:"size:50" json:"hardware_revision"`
	CurrentBands     string `gorm:"size:500" json:"current_bands"`
	SimOperatorName  string `gorm:"size:100" json:"sim_operator_name"`
	SimOperatorCode  string `gorm:"size:20" json:"sim_operator_code"`
	CurrentModes     string `gorm:"size:200" json:"current_modes"`
	Ports            string `gorm:"size:300" json:"ports"`
	Plugin           string `gorm:"size:50" json:"plugin"`
}

func (Modem) TableName() string { return "modems" }
