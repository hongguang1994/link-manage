package handlers

import (
	"net/http"
	"os"
	"path/filepath"
	"crypto/rand"
	"encoding/hex"
	"strings"
	"time"

	"simnexus-go/config"
	"simnexus-go/database"
	"simnexus-go/middleware"
	"simnexus-go/models"
	"simnexus-go/security"
	"simnexus-go/services"

	"github.com/gin-gonic/gin"
)

const maxSupportFileSize = 20 * 1024 * 1024

var supportImageTypes = map[string]bool{
	"image/jpeg": true, "image/png": true, "image/gif": true,
	"image/webp": true, "image/bmp": true,
}

func supportMsgOut(m *models.SupportMessage) gin.H {
	var sender models.User
	name := "?"
	if database.DB.First(&sender, m.SenderID).Error == nil {
		name = sender.Username
	}
	return gin.H{
		"id": m.ID, "user_id": m.UserID, "sender_id": m.SenderID,
		"sender_name": name, "content": m.Content, "is_from_user": m.IsFromUser,
		"is_read": m.IsRead, "created_at": m.CreatedAt,
		"attachment_url": m.AttachmentURL, "attachment_name": m.AttachmentName,
		"attachment_type": m.AttachmentType,
	}
}

// SupportUpload stores an uploaded file and returns its URL.
func SupportUpload(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "缺少文件"})
		return
	}
	if file.Size > maxSupportFileSize {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "文件大小超过 20MB 限制"})
		return
	}
	os.MkdirAll(config.C.UploadDir, 0o755)
	ext := strings.ToLower(filepath.Ext(file.Filename))
	buf := make([]byte, 16)
	rand.Read(buf)
	name := hex.EncodeToString(buf) + ext
	dst := filepath.Join(config.C.UploadDir, name)
	if err := c.SaveUploadedFile(file, dst); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": "保存失败"})
		return
	}
	ct := file.Header.Get("Content-Type")
	attType := "file"
	if supportImageTypes[ct] {
		attType = "image"
	}
	c.JSON(http.StatusOK, gin.H{"url": "/api/support/files/" + name, "name": file.Filename, "type": attType})
}

// SupportServeFile serves an uploaded file.
func SupportServeFile(c *gin.Context) {
	filename := c.Param("filename")
	if strings.Contains(filename, "/") || strings.Contains(filename, "..") {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "非法文件名"})
		return
	}
	path := filepath.Join(config.C.UploadDir, filename)
	if _, err := os.Stat(path); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "文件不存在"})
		return
	}
	c.File(path)
}

type messageIn struct {
	Content        string `json:"content"`
	UserID         *uint  `json:"user_id"`
	AttachmentURL  string `json:"attachment_url"`
	AttachmentName string `json:"attachment_name"`
	AttachmentType string `json:"attachment_type"`
}

func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// SupportSendMessage posts a support chat message.
func SupportSendMessage(c *gin.Context) {
	me := middleware.CurrentUser(c)
	var body messageIn
	c.ShouldBindJSON(&body)
	if strings.TrimSpace(body.Content) == "" && body.AttachmentURL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "消息或附件不能同时为空"})
		return
	}
	staff := security.IsSupportStaff(me)
	var msg models.SupportMessage
	if staff {
		if body.UserID == nil {
			c.JSON(http.StatusBadRequest, gin.H{"detail": "客服必须指定目标用户"})
			return
		}
		var target models.User
		if database.DB.First(&target, *body.UserID).Error != nil {
			c.JSON(http.StatusNotFound, gin.H{"detail": "用户不存在"})
			return
		}
		msg = models.SupportMessage{
			UserID: *body.UserID, SenderID: me.ID,
			Content: strings.TrimSpace(body.Content), IsFromUser: false,
		}
	} else {
		msg = models.SupportMessage{
			UserID: me.ID, SenderID: me.ID,
			Content: strings.TrimSpace(body.Content), IsFromUser: true,
		}
	}
	msg.AttachmentURL = strPtr(body.AttachmentURL)
	msg.AttachmentName = strPtr(body.AttachmentName)
	msg.AttachmentType = strPtr(body.AttachmentType)
	msg.CreatedAt = time.Now()
	database.DB.Create(&msg)

	preview := strings.TrimSpace(body.Content)
	if len(preview) > 40 {
		preview = preview[:40]
	}
	if preview == "" {
		if body.AttachmentName != "" {
			preview = "[" + body.AttachmentName + "]"
		} else {
			preview = "[附件]"
		}
	}
	if staff {
		services.Push("support_reply", "客服已回复您的咨询", preview, "user", body.UserID)
	} else {
		services.Push("support_msg", "用户咨询："+me.Username, preview, "support", nil)
	}
	c.JSON(http.StatusOK, supportMsgOut(&msg))
}

// SupportGetMessages returns a conversation's messages.
func SupportGetMessages(c *gin.Context) {
	me := middleware.CurrentUser(c)
	q := database.DB.Model(&models.SupportMessage{})
	if security.IsSupportStaff(me) {
		uid := c.Query("user_id")
		if uid == "" {
			c.JSON(http.StatusBadRequest, gin.H{"detail": "需要指定 user_id"})
			return
		}
		q = q.Where("user_id = ?", uid)
	} else {
		q = q.Where("user_id = ?", me.ID)
	}
	if since := c.Query("since_id"); since != "" {
		q = q.Where("id > ?", since)
	}
	var msgs []models.SupportMessage
	q.Order("created_at asc").Find(&msgs)
	out := make([]gin.H, 0, len(msgs))
	for i := range msgs {
		out = append(out, supportMsgOut(&msgs[i]))
	}
	c.JSON(http.StatusOK, out)
}

// SupportMarkRead marks a conversation read.
func SupportMarkRead(c *gin.Context) {
	me := middleware.CurrentUser(c)
	if security.IsSupportStaff(me) {
		uid := c.Query("user_id")
		if uid == "" {
			c.JSON(http.StatusBadRequest, gin.H{"detail": "需要 user_id"})
			return
		}
		database.DB.Model(&models.SupportMessage{}).
			Where("user_id = ? AND is_from_user = ? AND is_read = ?", uid, true, false).
			Update("is_read", true)
	} else {
		database.DB.Model(&models.SupportMessage{}).
			Where("user_id = ? AND is_from_user = ? AND is_read = ?", me.ID, false, false).
			Update("is_read", true)
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// SupportUnread returns unread count.
func SupportUnread(c *gin.Context) {
	me := middleware.CurrentUser(c)
	var count int64
	if security.IsSupportStaff(me) {
		database.DB.Model(&models.SupportMessage{}).
			Where("is_from_user = ? AND is_read = ?", true, false).Count(&count)
	} else {
		database.DB.Model(&models.SupportMessage{}).
			Where("user_id = ? AND is_from_user = ? AND is_read = ?", me.ID, false, false).Count(&count)
	}
	c.JSON(http.StatusOK, gin.H{"count": count})
}

// SupportConversations lists conversations (staff only).
func SupportConversations(c *gin.Context) {
	me := middleware.CurrentUser(c)
	if !security.IsSupportStaff(me) {
		c.JSON(http.StatusForbidden, gin.H{"detail": "无客服权限"})
		return
	}
	var userIDs []uint
	database.DB.Model(&models.SupportMessage{}).Distinct("user_id").Pluck("user_id", &userIDs)
	type conv struct {
		UserID      uint      `json:"user_id"`
		Username    string    `json:"username"`
		LastMessage string    `json:"last_message"`
		LastAt      time.Time `json:"last_at"`
		UnreadCount int64     `json:"unread_count"`
	}
	out := make([]conv, 0)
	for _, uid := range userIDs {
		var user models.User
		if database.DB.First(&user, uid).Error != nil {
			continue
		}
		var last models.SupportMessage
		database.DB.Where("user_id = ?", uid).Order("created_at desc").First(&last)
		var unread int64
		database.DB.Model(&models.SupportMessage{}).
			Where("user_id = ? AND is_from_user = ? AND is_read = ?", uid, true, false).Count(&unread)
		preview := last.Content
		if last.AttachmentName != nil && *last.AttachmentName != "" {
			preview = *last.AttachmentName
		}
		if len(preview) > 50 {
			preview = preview[:50]
		}
		if last.AttachmentURL != nil && *last.AttachmentURL != "" && last.Content == "" {
			preview = "[附件] " + preview
		}
		out = append(out, conv{
			UserID: uid, Username: user.Username, LastMessage: preview,
			LastAt: last.CreatedAt, UnreadCount: unread,
		})
	}
	// sort by last_at desc
	for i := 0; i < len(out); i++ {
		for j := i + 1; j < len(out); j++ {
			if out[j].LastAt.After(out[i].LastAt) {
				out[i], out[j] = out[j], out[i]
			}
		}
	}
	c.JSON(http.StatusOK, out)
}
