package handlers

import (
	"io"
	"net/http"
	"strconv"

	"simnexus-go/config"
	"simnexus-go/database"
	"simnexus-go/models"
	"simnexus-go/security"
	"simnexus-go/services"

	"github.com/gin-gonic/gin"
)

// TelegramListMessages returns logged Telegram messages (admin).
func TelegramListMessages(c *gin.Context) {
	skip, _ := strconv.Atoi(c.DefaultQuery("skip", "0"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))
	var msgs []models.TelegramMessage
	database.DB.Order("created_at desc").Offset(skip).Limit(limit).Find(&msgs)
	c.JSON(http.StatusOK, msgs)
}

type telegramSend struct {
	Text   string `json:"text"`
	ChatID string `json:"chat_id"`
}

// TelegramSend sends a text message (admin).
func TelegramSend(c *gin.Context) {
	var body telegramSend
	c.ShouldBindJSON(&body)
	if body.Text == "" {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "消息不能为空"})
		return
	}
	if !services.TelegramSendMessage(body.Text, body.ChatID, false) {
		c.JSON(http.StatusBadGateway, gin.H{"detail": "发送失败，请检查 Bot Token 和 Chat ID"})
		return
	}
	chatID := body.ChatID
	if chatID == "" {
		chatID = config.C.TelegramChatID
	}
	un := "SimNexus"
	database.DB.Create(&models.TelegramMessage{
		ChatID: chatID, Username: &un, Direction: "out", Text: body.Text,
	})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// TelegramSendFile uploads a file to the configured chat (admin).
func TelegramSendFile(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "缺少文件"})
		return
	}
	caption := c.PostForm("caption")
	f, err := file.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": "读取失败"})
		return
	}
	defer f.Close()
	content, _ := io.ReadAll(f)
	ct := file.Header.Get("Content-Type")
	if ct == "" {
		ct = "application/octet-stream"
	}
	ok, fileType, fileID, errMsg := services.TelegramSendFile(file.Filename, content, ct, caption)
	if !ok {
		c.JSON(http.StatusBadGateway, gin.H{"detail": errMsg})
		return
	}
	label := caption
	if label == "" {
		label = file.Filename
	}
	un := "SimNexus"
	ftCopy := fileType
	fidCopy := fileID
	database.DB.Create(&models.TelegramMessage{
		ChatID: config.C.TelegramChatID, Username: &un, Direction: "out",
		Text: label, FileType: &ftCopy, FileID: &fidCopy,
	})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// TelegramClearMessages deletes all logged messages (admin).
func TelegramClearMessages(c *gin.Context) {
	database.DB.Where("1 = 1").Delete(&models.TelegramMessage{})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// TelegramProxyFile proxies a Telegram file download (JWT via ?token=, admin only).
func TelegramProxyFile(c *gin.Context) {
	token := c.Query("token")
	if token == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "Not authenticated"})
		return
	}
	username, err := security.ParseToken(token)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "Invalid token"})
		return
	}
	user, err := security.LoadUserByUsername(database.DB, username)
	if err != nil || !user.IsAdmin() {
		c.JSON(http.StatusForbidden, gin.H{"detail": "Forbidden"})
		return
	}
	if config.C.TelegramBotToken == "" {
		c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "Bot not configured"})
		return
	}
	fileID := c.Param("file_id")
	if len(fileID) > 0 && fileID[0] == '/' {
		fileID = fileID[1:]
	}
	content, ct, filename, err := services.TelegramProxyFile(fileID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "File not found"})
		return
	}
	c.Header("Content-Disposition", `inline; filename="`+filename+`"`)
	c.Data(http.StatusOK, ct, content)
}

// TelegramConfig returns bot configuration state (admin).
func TelegramConfig(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"bot_token_set": config.C.TelegramBotToken != "",
		"chat_id":       config.C.TelegramChatID,
		"polling":       config.C.TelegramBotToken != "",
	})
}
