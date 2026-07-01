package handlers

import (
	"net/http"
	"strconv"
	"time"

	"simnexus-go/database"
	"simnexus-go/middleware"
	"simnexus-go/models"
	"simnexus-go/security"
	"simnexus-go/services"

	"github.com/gin-gonic/gin"
)

// visibleModemIDs returns (ids, unrestricted, permitted).
// unrestricted=true means admin/no filter. permitted=false means 403.
func visibleModemIDs(u *models.User) ([]uint, bool, bool) {
	if u.Role == models.RoleAdmin {
		return nil, true, true
	}
	p := security.Perm(u)
	if p == nil || !p.CanViewSim {
		return nil, false, false
	}
	granted := security.GetUserModemGrants(database.DB, u.ID, "", u)
	// intersect with restricted role scope (non-approver roles only)
	if !p.CanApproveRequests && p.AllowedModemIDs != nil {
		filtered := granted[:0]
		for _, id := range granted {
			if security.ContainsUint(p.AllowedModemIDs, id) {
				filtered = append(filtered, id)
			}
		}
		granted = filtered
	}
	return granted, false, true
}

// ListAvailableModems returns all active modems for browsing.
func ListAvailableModems(c *gin.Context) {
	u := middleware.CurrentUser(c)
	if u.Role != models.RoleAdmin {
		p := security.Perm(u)
		if p == nil || !p.CanViewSim {
			c.JSON(http.StatusForbidden, gin.H{"detail": "无SIM卡查看权限"})
			return
		}
	}
	var modems []models.Modem
	database.DB.Where("is_active = ?", true).Order("id").Find(&modems)
	c.JSON(http.StatusOK, modems)
}

// ListModems returns modems visible to the user.
func ListModems(c *gin.Context) {
	u := middleware.CurrentUser(c)
	if u.Role == models.RoleAdmin {
		var modems []models.Modem
		database.DB.Where("is_active = ?", true).Order("id").Find(&modems)
		c.JSON(http.StatusOK, modems)
		return
	}
	ids, _, ok := visibleModemIDs(u)
	if !ok {
		c.JSON(http.StatusForbidden, gin.H{"detail": "无SIM卡查看权限"})
		return
	}
	if len(ids) == 0 {
		c.JSON(http.StatusOK, []models.Modem{})
		return
	}
	var modems []models.Modem
	database.DB.Where("id IN ? AND is_active = ?", ids, true).Order("id").Find(&modems)
	c.JSON(http.StatusOK, modems)
}

func canAccessModem(u *models.User, modemID uint) bool {
	if u.Role == models.RoleAdmin {
		return true
	}
	ids, _, ok := visibleModemIDs(u)
	if !ok {
		return false
	}
	return security.ContainsUint(ids, modemID)
}

// GetModem returns a single modem.
func GetModem(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	u := middleware.CurrentUser(c)
	if u.Role != models.RoleAdmin && !canAccessModem(u, uint(id)) {
		c.JSON(http.StatusForbidden, gin.H{"detail": "无权访问该设备"})
		return
	}
	var modem models.Modem
	if database.DB.First(&modem, id).Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Modem not found"})
		return
	}
	c.JSON(http.StatusOK, modem)
}

type modemUpdate struct {
	Alias *string `json:"alias"`
}

// UpdateModem sets the modem alias.
func UpdateModem(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var modem models.Modem
	if database.DB.First(&modem, id).Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Modem not found"})
		return
	}
	var data modemUpdate
	c.ShouldBindJSON(&data)
	if data.Alias != nil {
		modem.Alias = *data.Alias
	}
	database.DB.Save(&modem)
	c.JSON(http.StatusOK, modem)
}

// GetModemDetail returns a modem plus SMS stats.
func GetModemDetail(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	u := middleware.CurrentUser(c)
	if u.Role != models.RoleAdmin && !canAccessModem(u, uint(id)) {
		c.JSON(http.StatusForbidden, gin.H{"detail": "无权访问该设备"})
		return
	}
	var modem models.Modem
	if database.DB.First(&modem, id).Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Modem not found"})
		return
	}
	var sent, received, today int64
	database.DB.Model(&models.SmsMessage{}).Where("modem_id = ? AND direction = ?", id, models.SmsOutbound).Count(&sent)
	database.DB.Model(&models.SmsMessage{}).Where("modem_id = ? AND direction = ?", id, models.SmsInbound).Count(&received)
	todayStart := time.Now().Truncate(24 * time.Hour)
	database.DB.Model(&models.SmsMessage{}).Where("modem_id = ? AND created_at >= ?", id, todayStart).Count(&today)

	out := gin.H{}
	remarshal(modem, &out)
	out["sms_sent"] = sent
	out["sms_received"] = received
	out["sms_today"] = today
	c.JSON(http.StatusOK, out)
}

// RefreshModem re-reads modem info from the device.
func RefreshModem(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var modem models.Modem
	if database.DB.First(&modem, id).Error != nil || modem.MmObjectPath == "" {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Modem not found"})
		return
	}
	info := services.GetModemInfo(modem.MmObjectPath)
	if info == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "Could not reach modem"})
		return
	}
	modem.SignalQuality = info.SignalQuality
	modem.Operator = info.Operator
	modem.Status = info.Status
	database.DB.Save(&modem)
	c.JSON(http.StatusOK, modem)
}
