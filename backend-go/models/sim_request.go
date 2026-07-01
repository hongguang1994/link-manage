package models

import "time"

// Request status & permission levels.
const (
	ReqPending  = "pending"
	ReqApproved = "approved"
	ReqRejected = "rejected"

	LevelView = "view"
	LevelUse  = "use"
)

type SimAccessRequest struct {
	ID             uint      `gorm:"primaryKey" json:"id"`
	UserID         uint      `gorm:"not null" json:"user_id"`
	ModemID        uint      `gorm:"not null" json:"modem_id"`
	Status         string    `gorm:"size:16;not null;default:pending" json:"status"`
	RequestedLevel string    `gorm:"size:16;not null;default:use" json:"requested_level"`
	Reason         *string   `gorm:"type:text" json:"reason"`
	AdminNote      *string   `gorm:"type:text" json:"admin_note"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

func (SimAccessRequest) TableName() string { return "sim_access_requests" }

type SimGrant struct {
	ID           uint       `gorm:"primaryKey" json:"id"`
	UserID       uint       `gorm:"not null;uniqueIndex:uq_sim_grants_user_modem" json:"user_id"`
	ModemID      uint       `gorm:"not null;uniqueIndex:uq_sim_grants_user_modem" json:"modem_id"`
	GrantedLevel string     `gorm:"size:16;not null" json:"granted_level"`
	ExpiresAt    *time.Time `json:"expires_at"`
	GrantedByID  *uint      `json:"granted_by_id"`
	RequestID    *uint      `json:"request_id"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}

func (SimGrant) TableName() string { return "sim_grants" }
