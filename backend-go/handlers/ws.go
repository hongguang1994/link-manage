package handlers

import (
	"net/http"
	"time"

	"simnexus-go/database"
	"simnexus-go/models"
	"simnexus-go/security"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var wsUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// ModemStatusWS pushes modem state to the client every 5 seconds.
func ModemStatusWS(c *gin.Context) {
	token := c.Query("token")
	username, err := security.ParseToken(token)
	if err != nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	user, err := security.LoadUserByUsername(database.DB, username)
	if err != nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}

	var visibleIDs []uint
	unrestricted := user.IsAdmin()
	if !unrestricted {
		visibleIDs = security.GetUserModemGrants(database.DB, user.ID, "", user)
	}

	conn, err := wsUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	for {
		q := database.DB.Model(&models.Modem{}).Where("is_active = ?", true)
		if !unrestricted {
			if len(visibleIDs) == 0 {
				conn.WriteJSON([]interface{}{})
				time.Sleep(5 * time.Second)
				continue
			}
			q = q.Where("id IN ?", visibleIDs)
		}
		var modems []models.Modem
		q.Find(&modems)
		data := make([]gin.H, 0, len(modems))
		for _, m := range modems {
			status := m.Status
			if status == "" {
				status = models.ModemUnknown
			}
			data = append(data, gin.H{
				"id": m.ID, "alias": m.Alias, "device_path": m.DevicePath,
				"operator": m.Operator, "signal_quality": m.SignalQuality,
				"status": status, "phone_number": m.PhoneNumber,
			})
		}
		if err := conn.WriteJSON(data); err != nil {
			return
		}
		time.Sleep(5 * time.Second)
	}
}
