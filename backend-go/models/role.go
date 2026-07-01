package models

import "time"

type Role struct {
	ID          uint   `gorm:"primaryKey" json:"id"`
	Name        string `gorm:"size:64;uniqueIndex;not null" json:"name"`
	Description string `gorm:"type:text" json:"description"`
	IsSystem    bool   `gorm:"default:false" json:"is_system"`

	CanViewSim         bool `gorm:"default:false" json:"can_view_sim"`
	CanApproveRequests bool `gorm:"default:false" json:"can_approve_requests"`
	CanViewHistory     bool `gorm:"default:false" json:"can_view_history"`
	ReadOnly           bool `gorm:"default:false" json:"read_only"`
	CanSupport         bool `gorm:"default:false" json:"can_support"`

	// Device scope: empty = unrestricted (approvers) / no auto-grant (regular)
	ModemScope []Modem `gorm:"many2many:role_modem_scope;" json:"-"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (Role) TableName() string { return "roles" }

// AllowedModemIDs returns nil if scope is empty, else the list of IDs.
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

// MarshalJSON augments the role with a computed allowed_modem_ids field.
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
