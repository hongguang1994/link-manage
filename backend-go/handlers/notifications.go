package handlers

import (
	"net/http"
	"strconv"

	"simnexus-go/database"
	"simnexus-go/middleware"
	"simnexus-go/models"
	"simnexus-go/security"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// visibleNotificationFilter applies audience filtering for the user.
func visibleNotificationFilter(me *models.User, q *gorm.DB) *gorm.DB {
	// base: 'all' OR ('user' AND target=me)
	cond := "audience = 'all' OR (audience = 'user' AND target_user_id = ?)"
	args := []interface{}{me.ID}
	if me.Role == models.RoleAdmin {
		cond += " OR audience = 'admin' OR audience = 'support'"
	} else if security.IsSupportStaff(me) {
		cond += " OR audience = 'support'"
	}
	return q.Where(cond, args...)
}

// ListNotifications returns notifications visible to the user.
func ListNotifications(c *gin.Context) {
	me := middleware.CurrentUser(c)
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	if limit > 100 {
		limit = 100
	}
	var ns []models.Notification
	visibleNotificationFilter(me, database.DB.Model(&models.Notification{})).
		Order("id desc").Limit(limit).Find(&ns)
	c.JSON(http.StatusOK, ns)
}

// UnreadCount returns count of unread visible notifications.
func UnreadCount(c *gin.Context) {
	me := middleware.CurrentUser(c)
	var count int64
	visibleNotificationFilter(me, database.DB.Model(&models.Notification{})).
		Where("is_read = ?", false).Count(&count)
	c.JSON(http.StatusOK, gin.H{"count": count})
}

// MarkAllRead marks all visible notifications read.
func MarkAllRead(c *gin.Context) {
	me := middleware.CurrentUser(c)
	visibleNotificationFilter(me, database.DB.Model(&models.Notification{})).
		Where("is_read = ?", false).Update("is_read", true)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// MarkOneRead marks a single notification read.
func MarkOneRead(c *gin.Context) {
	me := middleware.CurrentUser(c)
	id, _ := strconv.Atoi(c.Param("id"))
	var n models.Notification
	if visibleNotificationFilter(me, database.DB.Model(&models.Notification{})).
		Where("id = ?", id).First(&n).Error == nil {
		n.IsRead = true
		database.DB.Save(&n)
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
