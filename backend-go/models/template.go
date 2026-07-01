package models

import (
	"database/sql/driver"
	"encoding/json"
	"errors"
	"time"
)

// JSONList 是持久化为 JSON 列的字符串切片，实现 driver.Valuer 和 sql.Scanner 接口。
type JSONList []string

// Value 将 JSONList 序列化为 JSON 字符串存入数据库。
func (j JSONList) Value() (driver.Value, error) {
	if j == nil {
		return "[]", nil
	}
	b, err := json.Marshal(j)
	return string(b), err
}

// Scan 将数据库中的 JSON 字符串反序列化为 JSONList。
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

// SmsTemplate 短信模板，支持 {变量名} 占位符替换。
// Variables 存储模板中的变量名列表（前端从 content 正则提取后写入）。
type SmsTemplate struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Name      string    `gorm:"size:100;not null" json:"name"`
	Content   string    `gorm:"type:text;not null" json:"content"`
	Variables JSONList  `gorm:"type:json" json:"variables"` // 变量名列表，如 ["姓名", "金额"]
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (SmsTemplate) TableName() string { return "sms_templates" }
