package config

import (
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

// Config holds runtime configuration loaded from environment / .env.
type Config struct {
	AppName          string
	DatabaseURL      string
	SecretKey        string
	ModemPollSeconds int
	CorsOrigins      []string
	TelegramBotToken string
	TelegramChatID   string
	UploadDir        string
}

// C is the global config instance.
var C *Config

// SecretKey / Algorithm mirror the Python security module constants.
var SecretKey string

const Algorithm = "HS256"

// Load reads configuration from .env (if present) and environment variables.
func Load() *Config {
	_ = godotenv.Load(".env")

	cfg := &Config{
		AppName:          getenv("APP_NAME", "SimNexus"),
		DatabaseURL:      getenv("DATABASE_URL", "sqlite:///./sim_manager.db"),
		SecretKey:        getenv("SECRET_KEY", "simnexus-secret-key-change-in-production"),
		ModemPollSeconds: getenvInt("MODEM_POLL_INTERVAL", 10),
		TelegramBotToken: getenv("TELEGRAM_BOT_TOKEN", ""),
		TelegramChatID:   getenv("TELEGRAM_CHAT_ID", ""),
		UploadDir:        getenv("UPLOAD_DIR", "/opt/simnexus/uploads"),
	}

	origins := getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:5173")
	for _, o := range strings.Split(origins, ",") {
		o = strings.TrimSpace(o)
		if o != "" {
			cfg.CorsOrigins = append(cfg.CorsOrigins, o)
		}
	}

	C = cfg
	SecretKey = cfg.SecretKey
	return cfg
}

// SQLitePath converts a SQLAlchemy-style URL to a plain file path.
func (c *Config) SQLitePath() string {
	u := c.DatabaseURL
	u = strings.TrimPrefix(u, "sqlite:///")
	u = strings.TrimPrefix(u, "sqlite://")
	if u == "" {
		return "sim_manager.db"
	}
	return u
}

func getenv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func getenvInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}
