package models

import "time"

// TelegramMessage 记录 Bot 收发的每条 Telegram 消息（含媒体文件引用）。
// Direction: "in" 为收到，"out" 为发出。
type TelegramMessage struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	ChatID    string    `gorm:"size:64;not null;index" json:"chat_id"`
	Username  *string   `gorm:"size:128" json:"username"`         // 发送人用户名（收件时有效）
	Direction string    `gorm:"size:8;not null" json:"direction"` // in / out
	Text      string    `gorm:"type:text;not null" json:"text"`
	CreatedAt time.Time `json:"created_at"`
	IsCommand bool      `gorm:"default:false" json:"is_command"` // 是否为 Bot 命令
	FileID    *string   `gorm:"size:256" json:"file_id"`         // Telegram 文件 ID
	FileType  *string   `gorm:"size:32" json:"file_type"`        // photo/document/video 等
}

func (TelegramMessage) TableName() string { return "telegram_messages" }
