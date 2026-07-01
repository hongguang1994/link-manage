package models

import "time"

// 申请状态常量。
const (
	ReqPending  = "pending"  // 待审批
	ReqApproved = "approved" // 已批准
	ReqRejected = "rejected" // 已拒绝
)

// 权限级别常量：view 仅查看，use 可发送短信。
const (
	LevelView = "view"
	LevelUse  = "use"
)

// SimAccessRequest 记录用户对某 SIM 卡的访问申请，审批流程通过状态流转管理。
type SimAccessRequest struct {
	ID             uint      `gorm:"primaryKey" json:"id"`
	UserID         uint      `gorm:"not null" json:"user_id"`
	ModemID        uint      `gorm:"not null" json:"modem_id"`
	Status         string    `gorm:"size:16;not null;default:pending" json:"status"`      // pending/approved/rejected
	RequestedLevel string    `gorm:"size:16;not null;default:use" json:"requested_level"` // view 或 use
	Reason         *string   `gorm:"type:text" json:"reason"`                             // 申请理由（可选）
	AdminNote      *string   `gorm:"type:text" json:"admin_note"`                         // 审批备注（可选）
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

func (SimAccessRequest) TableName() string { return "sim_access_requests" }

// SimGrant 记录用户对某 SIM 卡的实际授权，(UserID, ModemID) 唯一。
// ExpiresAt=nil 表示永久授权；审批员角色通过 GetUserModemGrants 自动获得授权，无需此记录。
type SimGrant struct {
	ID           uint       `gorm:"primaryKey" json:"id"`
	UserID       uint       `gorm:"not null;uniqueIndex:uq_sim_grants_user_modem" json:"user_id"`
	ModemID      uint       `gorm:"not null;uniqueIndex:uq_sim_grants_user_modem" json:"modem_id"`
	GrantedLevel string     `gorm:"size:16;not null" json:"granted_level"` // view 或 use
	ExpiresAt    *time.Time `json:"expires_at"`                            // nil 表示永久
	GrantedByID  *uint      `json:"granted_by_id"`                         // 授权操作人
	RequestID    *uint      `json:"request_id"`                            // 关联的申请记录（直接授权时为 nil）
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}

func (SimGrant) TableName() string { return "sim_grants" }
