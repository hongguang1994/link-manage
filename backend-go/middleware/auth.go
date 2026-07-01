package middleware

import (
	"net/http"
	"strings"

	"simnexus-go/database"
	"simnexus-go/models"
	"simnexus-go/security"

	"github.com/gin-gonic/gin"
)

const userCtxKey = "currentUser"

// CurrentUser extracts the authenticated user placed by AuthRequired.
func CurrentUser(c *gin.Context) *models.User {
	v, ok := c.Get(userCtxKey)
	if !ok {
		return nil
	}
	u, _ := v.(*models.User)
	return u
}

func extractToken(c *gin.Context) string {
	auth := c.GetHeader("Authorization")
	if strings.HasPrefix(auth, "Bearer ") {
		return strings.TrimPrefix(auth, "Bearer ")
	}
	return c.Query("token")
}

// AuthRequired validates the Bearer JWT and loads the user.
func AuthRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		token := extractToken(c)
		if token == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"detail": "无效的认证凭证"})
			return
		}
		username, err := security.ParseToken(token)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"detail": "无效的认证凭证"})
			return
		}
		user, err := security.LoadUserByUsername(database.DB, username)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"detail": "无效的认证凭证"})
			return
		}
		c.Set(userCtxKey, user)
		c.Next()
	}
}

// RequireAdmin aborts unless the user is a system admin.
func RequireAdmin() gin.HandlerFunc {
	return func(c *gin.Context) {
		u := CurrentUser(c)
		if u == nil || u.Role != models.RoleAdmin {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"detail": "需要管理员权限"})
			return
		}
		c.Next()
	}
}

// RequireApproveRequests aborts unless admin or has can_approve_requests.
func RequireApproveRequests() gin.HandlerFunc {
	return func(c *gin.Context) {
		u := CurrentUser(c)
		if u != nil && u.Role == models.RoleAdmin {
			c.Next()
			return
		}
		p := security.Perm(u)
		if p == nil || !p.CanApproveRequests {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"detail": "无审批权限"})
			return
		}
		c.Next()
	}
}

// RequireViewHistory aborts unless admin or has can_view_history.
func RequireViewHistory() gin.HandlerFunc {
	return func(c *gin.Context) {
		u := CurrentUser(c)
		if u != nil && u.Role == models.RoleAdmin {
			c.Next()
			return
		}
		p := security.Perm(u)
		if p == nil || !p.CanViewHistory {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"detail": "无短信记录查看权限"})
			return
		}
		c.Next()
	}
}

// RequireSupport aborts unless the user is support staff.
func RequireSupport() gin.HandlerFunc {
	return func(c *gin.Context) {
		u := CurrentUser(c)
		if !security.IsSupportStaff(u) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"detail": "无客服权限"})
			return
		}
		c.Next()
	}
}
