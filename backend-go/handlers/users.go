package handlers

import (
	"net/http"
	"strconv"

	"simnexus-go/database"
	"simnexus-go/middleware"
	"simnexus-go/models"
	"simnexus-go/security"
	"simnexus-go/services"

	"github.com/gin-gonic/gin"
)

// ListUsers returns all users (admin).
func ListUsers(c *gin.Context) {
	var users []models.User
	database.DB.Preload("RbacRoles").Order("id").Find(&users)
	out := make([]gin.H, 0, len(users))
	for i := range users {
		out = append(out, userOut(&users[i]))
	}
	c.JSON(http.StatusOK, out)
}

type userCreate struct {
	Username string `json:"username"`
	Password string `json:"password"`
	Role     string `json:"role"`
}

// CreateUser creates a user (admin).
func CreateUser(c *gin.Context) {
	var data userCreate
	if err := c.ShouldBindJSON(&data); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "请求格式错误"})
		return
	}
	var existing models.User
	if database.DB.Where("username = ?", data.Username).First(&existing).Error == nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "用户名已存在"})
		return
	}
	if len(data.Password) < 6 {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "密码至少 6 位"})
		return
	}
	role := data.Role
	if role == "" {
		role = models.RoleUser
	}
	hash, _ := security.HashPassword(data.Password)
	user := models.User{Username: data.Username, PasswordHash: hash, Role: role, IsActive: true}
	database.DB.Create(&user)
	services.Push("new_user", "新用户注册", "新用户 "+user.Username+" 已创建（角色："+user.Role+"）", "admin", nil)
	c.JSON(http.StatusOK, userOut(&user))
}

type userUpdate struct {
	Role     *string `json:"role"`
	IsActive *bool   `json:"is_active"`
}

// UpdateUser patches a user's role/active state (admin).
func UpdateUser(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var user models.User
	if database.DB.Preload("RbacRoles").First(&user, id).Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "用户不存在"})
		return
	}
	var data userUpdate
	c.ShouldBindJSON(&data)
	if data.Role != nil {
		user.Role = *data.Role
	}
	if data.IsActive != nil {
		user.IsActive = *data.IsActive
	}
	database.DB.Save(&user)
	c.JSON(http.StatusOK, userOut(&user))
}

// DeleteUser removes a user (admin, not self).
func DeleteUser(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	me := middleware.CurrentUser(c)
	if uint(id) == me.ID {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "不能删除自己"})
		return
	}
	var user models.User
	if database.DB.First(&user, id).Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "用户不存在"})
		return
	}
	database.DB.Delete(&user)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

type passwordReset struct {
	NewPassword string `json:"new_password"`
}

// ResetPassword sets a new password for a user (admin).
func ResetPassword(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var user models.User
	if database.DB.Preload("RbacRoles").First(&user, id).Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "用户不存在"})
		return
	}
	var data passwordReset
	c.ShouldBindJSON(&data)
	if len(data.NewPassword) < 6 {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "密码至少 6 位"})
		return
	}
	user.PasswordHash, _ = security.HashPassword(data.NewPassword)
	database.DB.Save(&user)
	c.JSON(http.StatusOK, userOut(&user))
}

type passwordChange struct {
	OldPassword string `json:"old_password"`
	NewPassword string `json:"new_password"`
}

// ChangePassword updates the current user's password.
func ChangePassword(c *gin.Context) {
	me := middleware.CurrentUser(c)
	var data passwordChange
	c.ShouldBindJSON(&data)
	if !security.VerifyPassword(data.OldPassword, me.PasswordHash) {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "原密码错误"})
		return
	}
	if len(data.NewPassword) < 6 {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "密码至少 6 位"})
		return
	}
	me.PasswordHash, _ = security.HashPassword(data.NewPassword)
	database.DB.Save(me)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
