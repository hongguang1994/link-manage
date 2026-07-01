package models

import "time"

type Notification struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	Type         string    `gorm:"size:32;not null" json:"type"`
	Title        string    `gorm:"size:128;not null" json:"title"`
	Body         string    `gorm:"type:text;not null;default:''" json:"body"`
	IsRead       bool      `gorm:"not null;default:false" json:"is_read"`
	CreatedAt    time.Time `gorm:"not null" json:"created_at"`
	Audience     string    `gorm:"size:16;not null;default:admin" json:"audience"`
	TargetUserID *uint     `json:"target_user_id,omitempty"`
}

func (Notification) TableName() string { return "notifications" }
