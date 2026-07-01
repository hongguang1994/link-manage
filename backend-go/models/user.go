package models

import "time"

// UserRole system-level role.
const (
	RoleAdmin = "admin"
	RoleUser  = "user"
)

type User struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	Username     string    `gorm:"size:50;uniqueIndex;not null" json:"username"`
	PasswordHash string    `gorm:"size:200;not null" json:"-"`
	Role         string    `gorm:"size:20;not null;default:user" json:"role"`
	IsActive     bool      `gorm:"default:true" json:"is_active"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`

	// Many-to-many RBAC roles
	RbacRoles []Role `gorm:"many2many:user_roles;" json:"rbac_roles"`
}

func (User) TableName() string { return "users" }
