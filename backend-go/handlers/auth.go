package handlers

import (
	"net/http"

	"simnexus-go/database"
	"simnexus-go/middleware"
	"simnexus-go/models"
	"simnexus-go/security"

	"github.com/gin-gonic/gin"
)

// loginRequest 登录请求体，captcha_token/captcha_code 可选（均传或均不传）。
type loginRequest struct {
	Username     string `json:"username"`
	Password     string `json:"password"`
	CaptchaToken string `json:"captcha_token"` // 验证码 JWT（与 captcha_code 配对）
	CaptchaCode  string `json:"captcha_code"`  // 用户输入的验证码答案
}

// userOut 将 User 模型转为 API 响应 map，包含 rbac_roles 列表。
func userOut(u *models.User) gin.H {
	roles := make([]map[string]interface{}, 0, len(u.RbacRoles))
	for _, r := range u.RbacRoles {
		roles = append(roles, models.RoleOut(r))
	}
	return gin.H{
		"id":         u.ID,
		"username":   u.Username,
		"role":       u.Role,
		"is_active":  u.IsActive,
		"created_at": u.CreatedAt,
		"updated_at": u.UpdatedAt,
		"rbac_roles": roles,
	}
}

// Login authenticates a user and returns a JWT.
func Login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "请求格式错误"})
		return
	}
	if req.CaptchaToken != "" && req.CaptchaCode != "" {
		if !verifyCaptcha(req.CaptchaToken, req.CaptchaCode) {
			c.JSON(http.StatusBadRequest, gin.H{"detail": "验证码错误"})
			return
		}
	} else if req.CaptchaToken != "" || req.CaptchaCode != "" {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "验证码错误"})
		return
	}

	user, err := security.LoadUserByUsername(database.DB, req.Username)
	if err != nil || !security.VerifyPassword(req.Password, user.PasswordHash) {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "用户名或密码错误"})
		return
	}
	token, err := security.CreateAccessToken(user.Username)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": "令牌生成失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"access_token": token,
		"token_type":   "bearer",
		"user":         userOut(user),
	})
}

// GetMe returns the current authenticated user.
func GetMe(c *gin.Context) {
	c.JSON(http.StatusOK, userOut(middleware.CurrentUser(c)))
}
