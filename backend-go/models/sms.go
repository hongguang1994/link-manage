package models

import "time"

// SMS direction / status / task status values.
const (
	SmsInbound  = "inbound"
	SmsOutbound = "outbound"

	SmsPending  = "pending"
	SmsSent     = "sent"
	SmsFailed   = "failed"
	SmsReceived = "received"

	TaskActive    = "active"
	TaskPaused    = "paused"
	TaskCompleted = "completed"
	TaskFailed    = "failed"
)

type SmsMessage struct {
	ID           uint       `gorm:"primaryKey" json:"id"`
	ModemID      uint       `gorm:"not null" json:"modem_id"`
	Direction    string     `gorm:"size:16;not null" json:"direction"`
	PhoneNumber  string     `gorm:"size:30;not null" json:"phone_number"`
	Content      string     `gorm:"type:text;not null" json:"content"`
	Status       string     `gorm:"size:16;default:pending" json:"status"`
	ErrorMessage *string    `gorm:"type:text" json:"error_message"`
	SentAt       *time.Time `json:"sent_at"`
	ReceivedAt   *time.Time `json:"received_at"`
	CreatedAt    time.Time  `json:"created_at"`

	MmSmsIndex      string `gorm:"column:mm_sms_index;size:20" json:"mm_sms_index"`
	ScheduledTaskID *uint  `json:"scheduled_task_id"`
	CreatedByID     *uint  `json:"created_by_id"`
}

func (SmsMessage) TableName() string { return "sms_messages" }

type SmsScheduledTask struct {
	ID             uint       `gorm:"primaryKey" json:"id"`
	Name           string     `gorm:"size:100;not null" json:"name"`
	ModemID        uint       `gorm:"not null" json:"modem_id"`
	Recipients     JSONList   `gorm:"type:json;not null" json:"recipients"`
	Content        string     `gorm:"type:text;not null" json:"content"`
	CronExpression *string    `gorm:"size:100" json:"cron_expression"`
	SendOnceAt     *time.Time `json:"send_once_at"`
	Status         string     `gorm:"size:16;default:active" json:"status"`
	LastRunAt      *time.Time `json:"last_run_at"`
	NextRunAt      *time.Time `json:"next_run_at"`
	RunCount       int        `gorm:"default:0" json:"run_count"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
	CreatedByID    *uint      `json:"created_by_id"`
}

func (SmsScheduledTask) TableName() string { return "sms_scheduled_tasks" }
