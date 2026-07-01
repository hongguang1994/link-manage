package models

import "time"

type SupportMessage struct {
	ID             uint      `gorm:"primaryKey" json:"id"`
	UserID         uint      `gorm:"not null" json:"user_id"`
	SenderID       uint      `gorm:"not null" json:"sender_id"`
	Content        string    `gorm:"type:text;not null;default:''" json:"content"`
	IsFromUser     bool      `gorm:"not null" json:"is_from_user"`
	IsRead         bool      `gorm:"not null;default:false" json:"is_read"`
	CreatedAt      time.Time `gorm:"not null" json:"created_at"`
	AttachmentURL  *string   `gorm:"column:attachment_url;type:text" json:"attachment_url"`
	AttachmentName *string   `gorm:"type:text" json:"attachment_name"`
	AttachmentType *string   `gorm:"type:text" json:"attachment_type"`
}

func (SupportMessage) TableName() string { return "support_messages" }
