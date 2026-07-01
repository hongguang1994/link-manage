package handlers

import (
	"encoding/json"
	"regexp"
)

var reModem = regexp.MustCompile(`/Modem/(\d+)$`)

func derefBool(b *bool) bool {
	return b != nil && *b
}

// remarshal round-trips a map into a typed struct via JSON.
func remarshal(src interface{}, dst interface{}) {
	b, _ := json.Marshal(src)
	json.Unmarshal(b, dst)
}
