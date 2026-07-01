package models

import (
	"strings"
	"time"
)

// 系统级别角色常量（区别于 RBAC 角色）。
const (
	RoleAdmin = "admin" // 超级管理员，拥有全部权限
	RoleUser  = "user"  // 普通用户，权限由 RBAC 角色决定
)

// User 系统用户，通过 RbacRoles 关联 RBAC 权限角色。
// PasswordHash 不序列化到 JSON（json:"-"），RbacRoles 以 joined 模式加载。
type User struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	Username     string    `gorm:"size:50;uniqueIndex;not null" json:"username"`
	PasswordHash string    `gorm:"size:200;not null" json:"-"` // bcrypt 散列，不对外暴露
	Role         string    `gorm:"size:20;not null;default:user" json:"role"` // admin 或 user
	IsActive     bool      `gorm:"default:true" json:"is_active"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`

	// RbacRoles 多对多 RBAC 角色，加载后可通过 security.Perm() 计算合并权限。
	RbacRoles []Role `gorm:"many2many:user_roles;" json:"rbac_roles"`
}

func (User) TableName() string { return "users" }

// IsAdmin 兼容数据库中大写（ADMIN）和小写（admin）两种历史存储格式。
func (u *User) IsAdmin() bool {
	return strings.EqualFold(u.Role, RoleAdmin)
}
