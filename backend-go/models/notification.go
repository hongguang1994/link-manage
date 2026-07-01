package models

import "time"

// Notification 系统通知记录。
// Audience 决定可见范围：admin / support / all / user（配合 TargetUserID）。
type Notification struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	Type         string    `gorm:"size:32;not null" json:"type"` // 通知类型，如 sms_failed
	Title        string    `gorm:"size:128;not null" json:"title"`
	Body         string    `gorm:"type:text;not null;default:''" json:"body"` // 通知正文
	IsRead       bool      `gorm:"not null;default:false" json:"is_read"`
	CreatedAt    time.Time `gorm:"not null" json:"created_at"`
	Audience     string    `gorm:"size:16;not null;default:admin" json:"audience"` // 受众：admin/support/all/user
	TargetUserID *uint     `json:"target_user_id,omitempty"`                       // audience=user 时指定目标用户
}

func (Notification) TableName() string { return "notifications" }
