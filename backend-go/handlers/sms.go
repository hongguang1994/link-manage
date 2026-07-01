package handlers

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"simnexus-go/database"
	"simnexus-go/middleware"
	"simnexus-go/models"
	"simnexus-go/security"
	"simnexus-go/services"

	"github.com/gin-gonic/gin"
)

// userVisibleModemIDs returns (ids, unrestricted). unrestricted=true for admin.
func userVisibleModemIDs(u *models.User) ([]uint, bool) {
	if u.Role == models.RoleAdmin {
		return nil, true
	}
	return security.GetUserModemGrants(database.DB, u.ID, "", u), false
}

func requireUseGrant(u *models.User, modemID uint) bool {
	if u.Role == models.RoleAdmin {
		return true
	}
	useIDs := security.GetUserModemGrants(database.DB, u.ID, models.LevelUse, u)
	return security.ContainsUint(useIDs, modemID)
}

type smsSendRequest struct {
	ModemID     uint   `json:"modem_id"`
	PhoneNumber string `json:"phone_number"`
	Content     string `json:"content"`
}

// SendSMS sends a message immediately.
func SendSMS(c *gin.Context) {
	me := middleware.CurrentUser(c)
	var req smsSendRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "请求格式错误"})
		return
	}
	var modem models.Modem
	if database.DB.First(&modem, req.ModemID).Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Modem not found"})
		return
	}
	if !requireUseGrant(me, modem.ID) {
		c.JSON(http.StatusForbidden, gin.H{"detail": "无该SIM卡的使用权限，请先申请"})
		return
	}

	obj := modem.MmObjectPath
	var success bool
	var message string
	if strings.HasPrefix(obj, "zte:") {
		success = services.ZteSendSMS(req.PhoneNumber, req.Content)
		if !success {
			message = "ZTE device returned failure"
		}
	} else {
		m := reModem.FindStringSubmatch(obj)
		if m == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "Modem not available"})
			return
		}
		success, message = services.SendSMS(m[1], req.PhoneNumber, req.Content)
	}

	now := time.Now()
	sms := models.SmsMessage{
		ModemID:     modem.ID,
		Direction:   models.SmsOutbound,
		PhoneNumber: req.PhoneNumber,
		Content:     req.Content,
		Status:      models.SmsSent,
		CreatedByID: &me.ID,
	}
	if success {
		sms.SentAt = &now
	} else {
		sms.Status = models.SmsFailed
		sms.ErrorMessage = &message
	}
	database.DB.Create(&sms)

	if !success {
		label := modemDisplayLabel(&modem)
		body := "发往 " + req.PhoneNumber + " 的短信发送失败：" + message
		if me.Role == models.RoleAdmin {
			services.Push("sms_failed", "短信发送失败", "["+label+"] "+body, "admin", nil)
		} else {
			services.Push("sms_failed", "短信发送失败", "["+label+"] "+body, "user", &me.ID)
		}
		c.JSON(http.StatusBadGateway, gin.H{"detail": "SMS send failed: " + message})
		return
	}
	c.JSON(http.StatusOK, sms)
}

func modemDisplayLabel(m *models.Modem) string {
	if m.Alias != "" {
		return m.Alias
	}
	if m.Model != "" {
		return m.Model
	}
	return "设备#" + strconv.Itoa(int(m.ID))
}

// ListMessages returns SMS history filtered by visibility.
func ListMessages(c *gin.Context) {
	me := middleware.CurrentUser(c)
	q := database.DB.Model(&models.SmsMessage{})
	ids, unrestricted := userVisibleModemIDs(me)
	if !unrestricted {
		if len(ids) == 0 {
			c.JSON(http.StatusOK, []models.SmsMessage{})
			return
		}
		q = q.Where("modem_id IN ?", ids)
	}
	if v := c.Query("modem_id"); v != "" {
		q = q.Where("modem_id = ?", v)
	}
	if v := c.Query("direction"); v != "" {
		q = q.Where("direction = ?", v)
	}
	skip, _ := strconv.Atoi(c.DefaultQuery("skip", "0"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	var msgs []models.SmsMessage
	q.Order("created_at desc").Offset(skip).Limit(limit).Find(&msgs)
	c.JSON(http.StatusOK, msgs)
}

func deleteFromModem(msg *models.SmsMessage) {
	if msg.Direction != models.SmsInbound || msg.MmSmsIndex == "" {
		return
	}
	var modem models.Modem
	if database.DB.First(&modem, msg.ModemID).Error == nil {
		services.DeleteSmsFromModem(modem.MmObjectPath, msg.MmSmsIndex)
	}
}

// DeleteMessage removes one SMS record.
func DeleteMessage(c *gin.Context) {
	me := middleware.CurrentUser(c)
	id, _ := strconv.Atoi(c.Param("id"))
	var msg models.SmsMessage
	if database.DB.First(&msg, id).Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "记录不存在"})
		return
	}
	ids, unrestricted := userVisibleModemIDs(me)
	if !unrestricted && !security.ContainsUint(ids, msg.ModemID) {
		c.JSON(http.StatusForbidden, gin.H{"detail": "无权限"})
		return
	}
	deleteFromModem(&msg)
	database.DB.Delete(&msg)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

type batchDeleteBody struct {
	IDs []uint `json:"ids"`
}

// BatchDeleteMessages deletes multiple SMS records.
func BatchDeleteMessages(c *gin.Context) {
	me := middleware.CurrentUser(c)
	var body batchDeleteBody
	c.ShouldBindJSON(&body)
	if len(body.IDs) == 0 {
		c.JSON(http.StatusOK, gin.H{"deleted": 0})
		return
	}
	q := database.DB.Where("id IN ?", body.IDs)
	ids, unrestricted := userVisibleModemIDs(me)
	if !unrestricted {
		q = q.Where("modem_id IN ?", ids)
	}
	var msgs []models.SmsMessage
	q.Find(&msgs)
	for i := range msgs {
		deleteFromModem(&msgs[i])
		database.DB.Delete(&msgs[i])
	}
	c.JSON(http.StatusOK, gin.H{"deleted": len(msgs)})
}

// Templates

// ListTemplates returns all SMS templates.
func ListTemplates(c *gin.Context) {
	var tpls []models.SmsTemplate
	database.DB.Find(&tpls)
	c.JSON(http.StatusOK, tpls)
}

// CreateTemplate creates an SMS template.
func CreateTemplate(c *gin.Context) {
	var tpl models.SmsTemplate
	if err := c.ShouldBindJSON(&tpl); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "请求格式错误"})
		return
	}
	database.DB.Create(&tpl)
	c.JSON(http.StatusOK, tpl)
}

// DeleteTemplate removes a template.
func DeleteTemplate(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var tpl models.SmsTemplate
	if database.DB.First(&tpl, id).Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Template not found"})
		return
	}
	database.DB.Delete(&tpl)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// Scheduled tasks

func taskToOut(t *models.SmsScheduledTask) gin.H {
	out := gin.H{}
	remarshal(t, &out)
	if t.CreatedByID != nil {
		var u models.User
		if database.DB.First(&u, *t.CreatedByID).Error == nil {
			out["created_by_username"] = u.Username
		}
	}
	return out
}

// ListTasks returns scheduled tasks for the user.
func ListTasks(c *gin.Context) {
	me := middleware.CurrentUser(c)
	q := database.DB.Model(&models.SmsScheduledTask{})
	if me.Role != models.RoleAdmin {
		ids, unrestricted := userVisibleModemIDs(me)
		if !unrestricted {
			q = q.Where("modem_id IN ?", ids)
		}
		q = q.Where("created_by_id = ?", me.ID)
	}
	var tasks []models.SmsScheduledTask
	q.Order("id desc").Find(&tasks)
	out := make([]gin.H, 0, len(tasks))
	for i := range tasks {
		out = append(out, taskToOut(&tasks[i]))
	}
	c.JSON(http.StatusOK, out)
}

type taskCreate struct {
	Name           string     `json:"name"`
	ModemID        uint       `json:"modem_id"`
	Recipients     []string   `json:"recipients"`
	Content        string     `json:"content"`
	CronExpression *string    `json:"cron_expression"`
	SendOnceAt     *time.Time `json:"send_once_at"`
}

// CreateTask creates a scheduled task.
func CreateTask(c *gin.Context) {
	me := middleware.CurrentUser(c)
	var data taskCreate
	if err := c.ShouldBindJSON(&data); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "请求格式错误"})
		return
	}
	if !requireUseGrant(me, data.ModemID) {
		c.JSON(http.StatusForbidden, gin.H{"detail": "无该SIM卡的使用权限，请先申请"})
		return
	}
	var cron *string
	if data.CronExpression != nil {
		t := strings.TrimSpace(*data.CronExpression)
		if t != "" {
			cron = &t
		}
	}
	if cron == nil && data.SendOnceAt == nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Provide cron_expression or send_once_at"})
		return
	}
	task := models.SmsScheduledTask{
		Name:           data.Name,
		ModemID:        data.ModemID,
		Recipients:     models.JSONList(data.Recipients),
		Content:        data.Content,
		CronExpression: cron,
		SendOnceAt:     data.SendOnceAt,
		Status:         models.TaskActive,
		CreatedByID:    &me.ID,
	}
	database.DB.Create(&task)
	services.ScheduleTask(task)
	c.JSON(http.StatusOK, task)
}

type taskUpdate struct {
	Name           *string    `json:"name"`
	Recipients     *[]string  `json:"recipients"`
	Content        *string    `json:"content"`
	CronExpression *string    `json:"cron_expression"`
	SendOnceAt     *time.Time `json:"send_once_at"`
	Status         *string    `json:"status"`
}

// UpdateTask patches a scheduled task.
func UpdateTask(c *gin.Context) {
	me := middleware.CurrentUser(c)
	id, _ := strconv.Atoi(c.Param("id"))
	var task models.SmsScheduledTask
	if database.DB.First(&task, id).Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Task not found"})
		return
	}
	if me.Role != models.RoleAdmin && (task.CreatedByID == nil || *task.CreatedByID != me.ID) {
		c.JSON(http.StatusForbidden, gin.H{"detail": "无权修改此任务"})
		return
	}
	var data taskUpdate
	c.ShouldBindJSON(&data)
	if data.Name != nil {
		task.Name = *data.Name
	}
	if data.Recipients != nil {
		task.Recipients = models.JSONList(*data.Recipients)
	}
	if data.Content != nil {
		task.Content = *data.Content
	}
	if data.CronExpression != nil {
		task.CronExpression = data.CronExpression
	}
	if data.SendOnceAt != nil {
		task.SendOnceAt = data.SendOnceAt
	}
	if data.Status != nil {
		task.Status = *data.Status
	}
	database.DB.Save(&task)
	services.RemoveTask(task.ID)
	if task.Status == models.TaskActive {
		services.ScheduleTask(task)
	}
	c.JSON(http.StatusOK, task)
}

// DeleteTask removes a scheduled task.
func DeleteTask(c *gin.Context) {
	me := middleware.CurrentUser(c)
	id, _ := strconv.Atoi(c.Param("id"))
	var task models.SmsScheduledTask
	if database.DB.First(&task, id).Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Task not found"})
		return
	}
	if me.Role != models.RoleAdmin && (task.CreatedByID == nil || *task.CreatedByID != me.ID) {
		c.JSON(http.StatusForbidden, gin.H{"detail": "无权删除此任务"})
		return
	}
	services.RemoveTask(task.ID)
	database.DB.Delete(&task)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// RunTaskNow fires a task immediately.
func RunTaskNow(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var task models.SmsScheduledTask
	if database.DB.First(&task, id).Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Task not found"})
		return
	}
	services.ExecuteTask(uint(id))
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// AdminListTasks returns tasks for monitoring.
func AdminListTasks(c *gin.Context) {
	me := middleware.CurrentUser(c)
	q := database.DB.Model(&models.SmsScheduledTask{})
	if me.Role != models.RoleAdmin {
		q = q.Where("created_by_id = ?", me.ID)
	} else if uid := c.Query("user_id"); uid != "" {
		q = q.Where("created_by_id = ?", uid)
	}
	if st := c.Query("status"); st != "" {
		q = q.Where("status = ?", st)
	}
	var tasks []models.SmsScheduledTask
	q.Order("id desc").Find(&tasks)
	out := make([]gin.H, 0, len(tasks))
	for i := range tasks {
		out = append(out, taskToOut(&tasks[i]))
	}
	c.JSON(http.StatusOK, out)
}

// AdminTaskStats returns aggregate task counts.
func AdminTaskStats(c *gin.Context) {
	me := middleware.CurrentUser(c)
	q := database.DB.Model(&models.SmsScheduledTask{})
	if me.Role != models.RoleAdmin {
		q = q.Where("created_by_id = ?", me.ID)
	}
	var tasks []models.SmsScheduledTask
	q.Find(&tasks)
	stats := gin.H{"total": len(tasks), "active": 0, "paused": 0, "completed": 0, "failed": 0}
	for _, t := range tasks {
		switch t.Status {
		case models.TaskActive:
			stats["active"] = stats["active"].(int) + 1
		case models.TaskPaused:
			stats["paused"] = stats["paused"].(int) + 1
		case models.TaskCompleted:
			stats["completed"] = stats["completed"].(int) + 1
		case models.TaskFailed:
			stats["failed"] = stats["failed"].(int) + 1
		}
	}
	c.JSON(http.StatusOK, stats)
}

// AdminTaskHistory returns SMS sent by a task.
func AdminTaskHistory(c *gin.Context) {
	me := middleware.CurrentUser(c)
	id, _ := strconv.Atoi(c.Param("id"))
	var task models.SmsScheduledTask
	if database.DB.First(&task, id).Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "任务不存在"})
		return
	}
	if me.Role != models.RoleAdmin && (task.CreatedByID == nil || *task.CreatedByID != me.ID) {
		c.JSON(http.StatusForbidden, gin.H{"detail": "无权查看该任务"})
		return
	}
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	var msgs []models.SmsMessage
	database.DB.Where("scheduled_task_id = ?", id).Order("created_at desc").Limit(limit).Find(&msgs)
	c.JSON(http.StatusOK, msgs)
}
