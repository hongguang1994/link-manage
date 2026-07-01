package main

import (
	"context"
	"log/slog"
	"os"

	"simnexus-go/config"
	"simnexus-go/database"
	"simnexus-go/handlers"
	"simnexus-go/middleware"
	"simnexus-go/services"

	"github.com/gin-gonic/gin"
)

func main() {
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})))

	cfg := config.Load()
	database.Init(cfg)

	// Background services
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	services.StartScheduler()
	go services.StartPolling(ctx)
	go services.StartTelegramPolling(ctx)

	r := gin.Default()
	r.Use(middleware.CORS(cfg.CorsOrigins))

	api := r.Group("/api")

	// health
	api.GET("/health", func(c *gin.Context) { c.JSON(200, gin.H{"status": "ok"}) })

	// auth + captcha (public)
	api.POST("/auth/login", handlers.Login)
	api.GET("/auth/captcha", handlers.GetCaptcha)

	// authenticated group
	auth := api.Group("")
	auth.Use(middleware.AuthRequired())

	auth.GET("/auth/me", handlers.GetMe)

	// users (admin)
	users := auth.Group("/users")
	{
		users.GET("/", middleware.RequireAdmin(), handlers.ListUsers)
		users.POST("/", middleware.RequireAdmin(), handlers.CreateUser)
		users.PATCH("/:id", middleware.RequireAdmin(), handlers.UpdateUser)
		users.DELETE("/:id", middleware.RequireAdmin(), handlers.DeleteUser)
		users.POST("/:id/reset-password", middleware.RequireAdmin(), handlers.ResetPassword)
		users.POST("/me/change-password", handlers.ChangePassword)
	}

	// roles (admin)
	roles := auth.Group("/roles")
	{
		roles.GET("/", middleware.RequireAdmin(), handlers.ListRoles)
		roles.POST("/", middleware.RequireAdmin(), handlers.CreateRole)
		roles.PATCH("/:id", middleware.RequireAdmin(), handlers.UpdateRole)
		roles.DELETE("/:id", middleware.RequireAdmin(), handlers.DeleteRole)
		roles.PUT("/users/:id/roles", middleware.RequireAdmin(), handlers.SetUserRoles)
	}

	// modems
	modems := auth.Group("/modems")
	{
		modems.GET("/available", handlers.ListAvailableModems)
		modems.GET("/", handlers.ListModems)
		modems.GET("/:id", handlers.GetModem)
		modems.PATCH("/:id", handlers.UpdateModem)
		modems.GET("/:id/detail", handlers.GetModemDetail)
		modems.POST("/:id/refresh", handlers.RefreshModem)
	}

	// sms
	sms := auth.Group("/sms")
	{
		sms.POST("/send", handlers.SendSMS)
		sms.GET("/messages", middleware.RequireViewHistory(), handlers.ListMessages)
		sms.DELETE("/messages/:id", handlers.DeleteMessage)
		sms.POST("/messages/batch-delete", handlers.BatchDeleteMessages)
		sms.GET("/templates", handlers.ListTemplates)
		sms.POST("/templates", handlers.CreateTemplate)
		sms.DELETE("/templates/:id", handlers.DeleteTemplate)
		sms.GET("/tasks", handlers.ListTasks)
		sms.POST("/tasks", handlers.CreateTask)
		sms.PATCH("/tasks/:id", handlers.UpdateTask)
		sms.DELETE("/tasks/:id", handlers.DeleteTask)
		sms.POST("/tasks/:id/run-now", handlers.RunTaskNow)
		sms.GET("/admin/tasks", handlers.AdminListTasks)
		sms.GET("/admin/tasks/stats", handlers.AdminTaskStats)
		sms.GET("/admin/tasks/:id/history", handlers.AdminTaskHistory)
	}

	// sim-requests
	sr := auth.Group("/sim-requests")
	{
		sr.POST("/", handlers.CreateSimRequest)
		sr.GET("/my", handlers.MyRequests)
		sr.GET("/my-grants", handlers.MyGrants)
		sr.GET("/", middleware.RequireApproveRequests(), handlers.ListRequests)
		sr.PUT("/:id/approve", middleware.RequireApproveRequests(), handlers.ApproveRequest)
		sr.PUT("/:id/reject", middleware.RequireApproveRequests(), handlers.RejectRequest)
		sr.POST("/batch-approve", middleware.RequireApproveRequests(), handlers.BatchApprove)
		sr.POST("/grant", middleware.RequireApproveRequests(), handlers.DirectGrant)
		sr.DELETE("/grants/:id", middleware.RequireApproveRequests(), handlers.RevokeGrant)
	}

	// notifications
	notif := auth.Group("/notifications")
	{
		notif.GET("", handlers.ListNotifications)
		notif.GET("/unread-count", handlers.UnreadCount)
		notif.POST("/read-all", handlers.MarkAllRead)
		notif.POST("/:id/read", handlers.MarkOneRead)
	}

	// support
	support := auth.Group("/support")
	{
		support.POST("/upload", handlers.SupportUpload)
		support.POST("/messages", handlers.SupportSendMessage)
		support.GET("/messages", handlers.SupportGetMessages)
		support.POST("/messages/read", handlers.SupportMarkRead)
		support.GET("/unread", handlers.SupportUnread)
		support.GET("/conversations", handlers.SupportConversations)
	}
	// serve uploaded files without auth (matches Python)
	api.GET("/support/files/:filename", handlers.SupportServeFile)

	// dashboard
	auth.GET("/dashboard/stats", handlers.DashboardStats)

	// telegram (admin)
	tg := auth.Group("/telegram")
	{
		tg.GET("/messages", middleware.RequireAdmin(), handlers.TelegramListMessages)
		tg.POST("/send", middleware.RequireAdmin(), handlers.TelegramSend)
		tg.POST("/send-file", middleware.RequireAdmin(), handlers.TelegramSendFile)
		tg.DELETE("/messages", middleware.RequireAdmin(), handlers.TelegramClearMessages)
		tg.GET("/config", middleware.RequireAdmin(), handlers.TelegramConfig)
	}
	// telegram file proxy (JWT via query, own auth)
	api.GET("/telegram/file/*file_id", handlers.TelegramProxyFile)

	// websocket (token via query)
	r.GET("/ws/modems", handlers.ModemStatusWS)

	slog.Info("backend starting", "app", cfg.AppName, "addr", ":8000")
	if err := r.Run("0.0.0.0:8000"); err != nil {
		slog.Error("server exited", "err", err)
		os.Exit(1)
	}
}
