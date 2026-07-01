package models

import "time"

// Role 是 RBAC 角色，可赋予用户特定权限，支持设备范围限制。
// IsSystem=true 的角色为系统预置角色，不可删除。
type Role struct {
	ID          uint   `gorm:"primaryKey" json:"id"`
	Name        string `gorm:"size:64;uniqueIndex;not null" json:"name"`
	Description string `gorm:"type:text" json:"description"`
	IsSystem    bool   `gorm:"default:false" json:"is_system"` // 系统预置角色，不允许删除

	CanViewSim         bool `gorm:"default:false" json:"can_view_sim"`         // 可查看 SIM 卡列表
	CanApproveRequests bool `gorm:"default:false" json:"can_approve_requests"` // 可审批 SIM 卡申请
	CanViewHistory     bool `gorm:"default:false" json:"can_view_history"`     // 可查看短信记录
	ReadOnly           bool `gorm:"default:false" json:"read_only"`            // 只读（不可发送短信/创建任务）
	CanSupport         bool `gorm:"default:false" json:"can_support"`          // 可访问客服功能

	// ModemScope 限制角色可管理的设备范围；空列表表示无限制（仅对审批员有自动授权效果）。
	ModemScope []Modem `gorm:"many2many:role_modem_scope;" json:"-"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (Role) TableName() string { return "roles" }

// AllowedModemIDs 返回角色管辖的设备 ID 列表；若范围为空则返回 nil（表示无限制）。
func (r *Role) AllowedModemIDs() []uint {
	if len(r.ModemScope) == 0 {
		return nil
	}
	ids := make([]uint, 0, len(r.ModemScope))
	for _, m := range r.ModemScope {
		ids = append(ids, m.ID)
	}
	return ids
}

// toOut 将 Role 序列化为 API 响应 map，包含计算字段 allowed_modem_ids。
func (r Role) toOut() map[string]interface{} {
	var ids []uint
	for _, m := range r.ModemScope {
		ids = append(ids, m.ID)
	}
	var out interface{}
	if len(ids) == 0 {
		out = nil
	} else {
		out = ids
	}
	return map[string]interface{}{
		"id":                   r.ID,
		"name":                 r.Name,
		"description":          r.Description,
		"is_system":            r.IsSystem,
		"can_view_sim":         r.CanViewSim,
		"can_approve_requests": r.CanApproveRequests,
		"can_view_history":     r.CanViewHistory,
		"read_only":            r.ReadOnly,
		"can_support":          r.CanSupport,
		"allowed_modem_ids":    out,
		"created_at":           r.CreatedAt,
		"updated_at":           r.UpdatedAt,
	}
}

// RoleOut serializes a role for API responses.
func RoleOut(r Role) map[string]interface{} { return r.toOut() }
