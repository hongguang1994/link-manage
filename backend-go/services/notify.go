package services

import (
	"time"

	"simnexus-go/database"
	"simnexus-go/models"
)

// Push inserts a notification row. audience: "admin"|"support"|"all"|"user".
// For "user" audience pass a non-nil targetUserID.
func Push(nType, title, body, audience string, targetUserID *uint) {
	if audience == "" {
		audience = "admin"
	}
	n := models.Notification{
		Type:         nType,
		Title:        title,
		Body:         body,
		Audience:     audience,
		TargetUserID: targetUserID,
		CreatedAt:    time.Now(),
	}
	database.DB.Create(&n)
}
