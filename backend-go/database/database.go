package database

import (
	"log/slog"
	"os"

	"simnexus-go/config"
	"simnexus-go/models"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	glogger "gorm.io/gorm/logger"
)

// DB 是全局 GORM 数据库句柄，由 Init 初始化后供所有包直接使用。
var DB *gorm.DB

// Init 打开 SQLite 数据库并对所有 model 执行 AutoMigrate。
// AutoMigrate 只新建表或增加列，不修改/删除已有列（与 Python create_all 行为一致）。
func Init(cfg *config.Config) {
	db, err := gorm.Open(sqlite.Open(cfg.SQLitePath()), &gorm.Config{
		Logger: glogger.Default.LogMode(glogger.Silent),
	})
	if err != nil {
		slog.Error("failed to open database", "err", err)
		os.Exit(1)
	}
	DB = db

	// AutoMigrate 只负责建新表 / 加新列，不修改已有列（与 Python create_all 行为一致）。
	// SQLite 不支持改列，GORM 尝试时会报错，忽略即可。
	_ = db.AutoMigrate(
		&models.User{},
		&models.Role{},
		&models.Modem{},
		&models.SimAccessRequest{},
		&models.SimGrant{},
		&models.SmsMessage{},
		&models.SmsScheduledTask{},
		&models.SmsTemplate{},
		&models.Notification{},
		&models.SupportMessage{},
		&models.TelegramMessage{},
	)
	slog.Info("database ready", "path", cfg.SQLitePath())
}
