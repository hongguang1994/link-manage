package models

import "time"

type TelegramMessage struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	ChatID    string    `gorm:"size:64;not null;index" json:"chat_id"`
	Username  *string   `gorm:"size:128" json:"username"`
	Direction string    `gorm:"size:8;not null" json:"direction"`
	Text      string    `gorm:"type:text;not null" json:"text"`
	CreatedAt time.Time `json:"created_at"`
	IsCommand bool      `gorm:"default:false" json:"is_command"`
	FileID    *string   `gorm:"size:256" json:"file_id"`
	FileType  *string   `gorm:"size:32" json:"file_type"`
}

func (TelegramMessage) TableName() string { return "telegram_messages" }
