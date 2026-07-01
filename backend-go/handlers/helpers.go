package handlers

import (
	"encoding/json"
	"regexp"
)

// reModem 从 D-Bus 路径（如 /org/freedesktop/ModemManager1/Modem/3）提取数字索引。
var reModem = regexp.MustCompile(`/Modem/(\d+)$`)

// derefBool 安全解引用 *bool，nil 视为 false。
func derefBool(b *bool) bool {
	return b != nil && *b
}

// remarshal 将任意值经 JSON 编解码转换为目标类型，常用于 map→struct 的宽松绑定。
func remarshal(src interface{}, dst interface{}) {
	b, _ := json.Marshal(src)
	json.Unmarshal(b, dst)
}
