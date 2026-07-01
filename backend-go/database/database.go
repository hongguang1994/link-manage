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

// DB is the global GORM handle.
var DB *gorm.DB

// Init opens the SQLite database and runs AutoMigrate for all models.
func Init(cfg *config.Config) {
	db, err := gorm.Open(sqlite.Open(cfg.SQLitePath()), &gorm.Config{
		Logger: glogger.Default.LogMode(glogger.Silent),
	})
	if err != nil {
		slog.Error("failed to open database", "err", err)
		os.Exit(1)
	}
	DB = db

	if err := db.AutoMigrate(
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
	); err != nil {
		slog.Error("auto-migrate failed", "err", err)
		os.Exit(1)
	}
	slog.Info("database ready", "path", cfg.SQLitePath())
}
