package services

import (
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const zteGateway = "192.168.0.1"

var (
	goformGet = "http://" + zteGateway + "/goform/goform_get_cmd_process"
	goformSet = "http://" + zteGateway + "/goform/goform_set_cmd_process"
)

var zteStatusCmds = strings.Join([]string{
	"modem_main_state", "signalbar", "network_type", "network_provider",
	"ppp_status", "rssi", "rsrp", "rsrq", "sinr",
	"realtime_tx_bytes", "realtime_rx_bytes", "realtime_time",
	"monthly_tx_bytes", "monthly_rx_bytes",
	"sim_imsi", "spn_name_data", "plmn_name",
}, ",")

var zteInfoCmds = strings.Join([]string{
	"imei", "sim_imsi", "sim_iccid", "phone_num", "msisdn",
	"device_model", "hardware_version", "software_version",
}, ",")

var zteMccMnc = map[string]string{
	"46000": "中国移动", "46002": "中国移动", "46004": "中国移动", "46007": "中国移动",
	"46001": "中国联通", "46006": "中国联通", "46009": "中国联通",
	"46003": "中国电信", "46005": "中国电信", "46008": "中国电信", "46011": "中国电信",
}

func zteHTTPClient(timeout time.Duration) *http.Client { return &http.Client{Timeout: timeout} }

func zteGet(cmd string, timeout time.Duration) map[string]interface{} {
	u := goformGet + "?multi_data=1&cmd=" + url.QueryEscape(cmd)
	req, err := http.NewRequest(http.MethodGet, u, nil)
	if err != nil {
		return nil
	}
	req.Header.Set("Referer", "http://"+zteGateway+"/index.html")
	resp, err := zteHTTPClient(timeout).Do(req)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	var out map[string]interface{}
	if json.Unmarshal(body, &out) != nil {
		return nil
	}
	return out
}

func ztePost(data map[string]string, timeout time.Duration) map[string]interface{} {
	form := url.Values{}
	for k, v := range data {
		form.Set(k, v)
	}
	req, err := http.NewRequest(http.MethodPost, goformSet, strings.NewReader(form.Encode()))
	if err != nil {
		return nil
	}
	req.Header.Set("Referer", "http://"+zteGateway+"/index.html")
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := zteHTTPClient(timeout).Do(req)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	var out map[string]interface{}
	if json.Unmarshal(body, &out) != nil {
		return nil
	}
	return out
}

func zteStr(m map[string]interface{}, key string) string {
	if m == nil {
		return ""
	}
	if v, ok := m[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

// ZteIsAvailable checks for a reachable ZTE device.
func ZteIsAvailable() bool {
	r := zteGet("modem_main_state", 3*time.Second)
	if r == nil {
		return false
	}
	_, ok := r["modem_main_state"]
	return ok
}

func signalbarToQuality(bar string) int {
	n, err := strconv.Atoi(bar)
	if err != nil {
		return 0
	}
	q := n * 20
	if q > 100 {
		q = 100
	}
	return q
}

func imsiToOperator(imsi string) string {
	if len(imsi) < 6 {
		return ""
	}
	if v, ok := zteMccMnc[imsi[:5]]; ok {
		return v
	}
	if v, ok := zteMccMnc[imsi[:6]]; ok {
		return v
	}
	return ""
}

func networkTypeToTech(nt string) string {
	switch nt {
	case "LTE", "4G":
		return "lte"
	case "WCDMA", "3G":
		return "umts"
	case "EDGE":
		return "edge"
	case "2G", "GPRS":
		return "gsm"
	case "No Service":
		return ""
	}
	return strings.ToLower(nt)
}

func pppToStatus(ppp, modemState string) string {
	if modemState != "modem_init_complete" {
		return "unknown"
	}
	if ppp == "ppp_connected" {
		return "connected"
	}
	return "disconnected"
}

// ZteGetModemInfo returns a ModemInfo compatible record, or nil if unreachable.
func ZteGetModemInfo() *ModemInfo {
	status := zteGet(zteStatusCmds, 5*time.Second)
	if status == nil {
		return nil
	}
	info := zteGet(zteInfoCmds, 5*time.Second)
	if info == nil {
		info = map[string]interface{}{}
	}

	operator := firstNonEmpty(
		zteStr(status, "spn_name_data"),
		zteStr(status, "plmn_name"),
		zteStr(status, "network_provider"),
		imsiToOperator(firstNonEmpty(zteStr(status, "sim_imsi"), zteStr(info, "sim_imsi"))),
	)
	regState := ""
	if operator != "" {
		regState = "home"
	}

	return &ModemInfo{
		MmObjectPath:       "zte:" + zteGateway,
		DevicePath:         "net/zte-usb",
		Imei:               zteStr(info, "imei"),
		Manufacturer:       "ZTE",
		Model:              firstNonEmpty(zteStr(info, "device_model"), "ZTE MiFi"),
		PhoneNumber:        firstNonEmpty(zteStr(info, "phone_num"), zteStr(info, "msisdn")),
		Operator:           operator,
		SignalQuality:      signalbarToQuality(firstNonEmpty(zteStr(status, "signalbar"), "0")),
		Status:             pppToStatus(zteStr(status, "ppp_status"), zteStr(status, "modem_main_state")),
		AccessTechnologies: networkTypeToTech(zteStr(status, "network_type")),
		RegistrationState:  regState,
		TxBytes:            atoi64(zteStr(status, "realtime_tx_bytes")),
		RxBytes:            atoi64(zteStr(status, "realtime_rx_bytes")),
		ConnectionDuration: atoi64(zteStr(status, "realtime_time")),
		Source:             "zte",
	}
}

// ZteListSMS returns inbox messages in the same shape as ListInbox.
func ZteListSMS() []InboxMessage {
	data := ztePost(map[string]string{
		"isTest":        "false",
		"cmd":           "sms_data_total",
		"page":          "0",
		"data_per_page": "50",
		"mem_store":     "1",
		"tags":          "1",
		"order_by":      "order by id desc",
	}, 5*time.Second)
	if data == nil {
		return nil
	}
	rawMsgs, ok := data["messages"]
	if !ok {
		return nil
	}
	var msgs []map[string]interface{}
	switch t := rawMsgs.(type) {
	case string:
		if json.Unmarshal([]byte(t), &msgs) != nil {
			return nil
		}
	case []interface{}:
		for _, it := range t {
			if m, ok := it.(map[string]interface{}); ok {
				msgs = append(msgs, m)
			}
		}
	}
	var out []InboxMessage
	for _, m := range msgs {
		out = append(out, InboxMessage{
			SmsIndex:    anyToStr(m["id"]),
			PhoneNumber: anyToStr(m["number"]),
			Content:     anyToStr(m["content"]),
			Timestamp:   anyToStr(m["date"]),
		})
	}
	return out
}

// ZteSendSMS sends an SMS via the ZTE goform API.
func ZteSendSMS(number, text string) bool {
	now := time.Now()
	smsTime := now.Format("06;01;02;15;04;05") + ";0"
	encodeType := "GSM7_default"
	for _, r := range text {
		if r > 127 {
			encodeType = "UNICODE"
			break
		}
	}
	result := ztePost(map[string]string{
		"goformId":    "SEND_SMS",
		"Number":      number,
		"sms_time":    smsTime,
		"MessageBody": text,
		"ID":          "-1",
		"encode_type": encodeType,
	}, 5*time.Second)
	return result != nil && zteStr(result, "result") == "success"
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}

func anyToStr(v interface{}) string {
	switch t := v.(type) {
	case string:
		return t
	case float64:
		return strconv.FormatInt(int64(t), 10)
	case nil:
		return ""
	}
	return ""
}
