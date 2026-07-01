package models

import "time"

// SupportMessage 记录客服会话中的一条消息。
// UserID 是会话归属用户（即普通用户），SenderID 是实际发送者（可能是客服）。
// IsFromUser=true 表示用户发送，false 表示客服回复。
type SupportMessage struct {
	ID             uint      `gorm:"primaryKey" json:"id"`
	UserID         uint      `gorm:"not null" json:"user_id"`   // 会话归属用户
	SenderID       uint      `gorm:"not null" json:"sender_id"` // 实际发送者
	Content        string    `gorm:"type:text;not null;default:''" json:"content"`
	IsFromUser     bool      `gorm:"not null" json:"is_from_user"` // true=用户，false=客服
	IsRead         bool      `gorm:"not null;default:false" json:"is_read"`
	CreatedAt      time.Time `gorm:"not null" json:"created_at"`
	AttachmentURL  *string   `gorm:"column:attachment_url;type:text" json:"attachment_url"`
	AttachmentName *string   `gorm:"type:text" json:"attachment_name"`
	AttachmentType *string   `gorm:"type:text" json:"attachment_type"` // "image" 或 "file"
}

func (SupportMessage) TableName() string { return "support_messages" }
