package models

import (
	"database/sql/driver"
	"encoding/json"
	"errors"
	"time"
)

// JSONList is a []string persisted as a JSON column.
type JSONList []string

func (j JSONList) Value() (driver.Value, error) {
	if j == nil {
		return "[]", nil
	}
	b, err := json.Marshal(j)
	return string(b), err
}

func (j *JSONList) Scan(v interface{}) error {
	if v == nil {
		*j = JSONList{}
		return nil
	}
	var b []byte
	switch t := v.(type) {
	case []byte:
		b = t
	case string:
		b = []byte(t)
	default:
		return errors.New("JSONList: unsupported scan type")
	}
	if len(b) == 0 {
		*j = JSONList{}
		return nil
	}
	return json.Unmarshal(b, j)
}

type SmsTemplate struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Name      string    `gorm:"size:100;not null" json:"name"`
	Content   string    `gorm:"type:text;not null" json:"content"`
	Variables JSONList  `gorm:"type:json" json:"variables"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (SmsTemplate) TableName() string { return "sms_templates" }
