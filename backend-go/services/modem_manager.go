package services

import (
	"encoding/json"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// ModemInfo mirrors the dict returned by the Python modem_manager.
type ModemInfo struct {
	MmObjectPath       string
	MmIndex            string
	DevicePath         string
	Manufacturer       string
	Model              string
	Imei               string
	Operator           string
	SignalQuality      int
	RawState           string
	Status             string
	PhoneNumber        string
	AccessTechnologies string
	RegistrationState  string
	TxBytes            int64
	RxBytes            int64
	ConnectionDuration int64
	Imsi               string
	Iccid              string
	FirmwareRevision   string
	HardwareRevision   string
	CurrentBands       string
	SimOperatorName    string
	SimOperatorCode    string
	CurrentModes       string
	Ports              string
	Plugin             string
	Source             string // "zte" for ZTE devices
}

// InboxMessage is a received SMS parsed from the modem.
type InboxMessage struct {
	SmsIndex    string
	PhoneNumber string
	Content     string
	Timestamp   string
	State       string
}

var (
	reModemIdx  = regexp.MustCompile(`/Modem/(\d+)$`)
	reBearerIdx = regexp.MustCompile(`/Bearer/(\d+)$`)
	reSimIdx    = regexp.MustCompile(`/SIM/(\d+)$`)
	reSmsIdx    = regexp.MustCompile(`/SMS/(\d+)`)
	reSmsIdxEnd = regexp.MustCompile(`/SMS/(\d+)$`)
	reCnum      = regexp.MustCompile(`\+CNUM:.*?"(\+?\d+)"`)
)

var errTimeout = &execErr{"command timed out"}

type execErr struct{ msg string }

func (e *execErr) Error() string { return e.msg }

func run(timeout time.Duration, args ...string) (string, string, error) {
	cmd := exec.Command(args[0], args[1:]...)
	var stdout, stderr strings.Builder
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Start(); err != nil {
		return "", "", err
	}
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	select {
	case err := <-done:
		return strings.TrimSpace(stdout.String()), strings.TrimSpace(stderr.String()), err
	case <-time.After(timeout):
		_ = cmd.Process.Kill()
		<-done
		return "", "timeout", errTimeout
	}
}

// ListModems returns all modems detected by ModemManager.
func ListModems() []ModemInfo {
	out, _, err := run(30*time.Second, "mmcli", "-L", "-J")
	if err != nil {
		return nil
	}
	var data struct {
		ModemList []string `json:"modem-list"`
	}
	if json.Unmarshal([]byte(out), &data) != nil {
		return nil
	}
	var modems []ModemInfo
	for _, p := range data.ModemList {
		if info := GetModemInfo(p); info != nil {
			modems = append(modems, *info)
		}
	}
	return modems
}

// GetModemInfo fetches detail for a single modem by D-Bus path.
func GetModemInfo(mmPath string) *ModemInfo {
	m := reModemIdx.FindStringSubmatch(mmPath)
	if m == nil {
		return nil
	}
	idx := m[1]
	out, _, err := run(30*time.Second, "mmcli", "-m", idx, "-J")
	if err != nil {
		return nil
	}
	var raw struct {
		Modem struct {
			Generic map[string]json.RawMessage `json:"generic"`
			Threegp map[string]json.RawMessage `json:"3gpp"`
		} `json:"modem"`
	}
	if json.Unmarshal([]byte(out), &raw) != nil {
		return nil
	}
	g := raw.Modem.Generic
	tg := raw.Modem.Threegp

	sig := 0
	if v, ok := g["signal-quality"]; ok {
		var sq struct {
			Value string `json:"value"`
		}
		if json.Unmarshal(v, &sq) == nil {
			sig, _ = strconv.Atoi(sq.Value)
		}
	}
	state := asString(g["state"])
	bearer := getBearerStats(idx)
	sim := getSimInfo(asString(g["sim"]))
	phone := parseOwnNumber(g)
	if phone == "" {
		phone = getPhoneNumber(idx)
	}

	return &ModemInfo{
		MmObjectPath:       mmPath,
		MmIndex:            idx,
		DevicePath:         asString(g["primary-port"]),
		Manufacturer:       asString(g["manufacturer"]),
		Model:              asString(g["model"]),
		Imei:               asString(tg["imei"]),
		Operator:           asString(tg["operator-name"]),
		SignalQuality:      sig,
		RawState:           state,
		Status:             mapState(state),
		PhoneNumber:        phone,
		AccessTechnologies: joinList(g["access-technologies"]),
		RegistrationState:  asString(tg["registration-state"]),
		TxBytes:            bearer.tx,
		RxBytes:            bearer.rx,
		ConnectionDuration: bearer.dur,
		Imsi:               sim.imsi,
		Iccid:              sim.iccid,
		FirmwareRevision:   asString(g["revision"]),
		HardwareRevision:   asString(g["hardware-revision"]),
		CurrentBands:       joinList(g["current-bands"]),
		SimOperatorName:    sim.opName,
		SimOperatorCode:    sim.opCode,
		CurrentModes:       asString(g["current-modes"]),
		Ports:              joinList(g["ports"]),
		Plugin:             asString(g["plugin"]),
	}
}

type bearerStats struct{ tx, rx, dur int64 }

func getBearerStats(idx string) bearerStats {
	out, _, err := run(30*time.Second, "mmcli", "-m", idx, "--list-bearers", "-J")
	if err != nil {
		return bearerStats{}
	}
	var data struct {
		DBusPath   []string `json:"modem.bearers.dbus-path"`
		BearerList []string `json:"bearer-list"`
	}
	if json.Unmarshal([]byte(out), &data) != nil {
		return bearerStats{}
	}
	paths := data.DBusPath
	if len(paths) == 0 {
		paths = data.BearerList
	}
	if len(paths) == 0 {
		return bearerStats{}
	}
	bm := reBearerIdx.FindStringSubmatch(paths[0])
	if bm == nil {
		return bearerStats{}
	}
	out2, _, err := run(30*time.Second, "mmcli", "-b", bm[1], "-J")
	if err != nil {
		return bearerStats{}
	}
	var b struct {
		Bearer struct {
			Stats  map[string]string `json:"stats"`
			Status map[string]string `json:"status"`
		} `json:"bearer"`
	}
	if json.Unmarshal([]byte(out2), &b) != nil {
		return bearerStats{}
	}
	return bearerStats{
		tx:  atoi64(b.Bearer.Stats["tx-bytes"]),
		rx:  atoi64(b.Bearer.Stats["rx-bytes"]),
		dur: atoi64(b.Bearer.Status["connection-duration"]),
	}
}

type simInfo struct{ imsi, iccid, opName, opCode string }

func getSimInfo(simPath string) simInfo {
	if simPath == "" {
		return simInfo{}
	}
	m := reSimIdx.FindStringSubmatch(simPath)
	if m == nil {
		return simInfo{}
	}
	out, _, err := run(30*time.Second, "mmcli", "-i", m[1], "-J")
	if err != nil {
		return simInfo{}
	}
	var data struct {
		Sim struct {
			Properties map[string]string `json:"properties"`
		} `json:"sim"`
	}
	if json.Unmarshal([]byte(out), &data) != nil {
		return simInfo{}
	}
	p := data.Sim.Properties
	return simInfo{p["imsi"], p["iccid"], p["operator-name"], p["operator-code"]}
}

func parseOwnNumber(g map[string]json.RawMessage) string {
	if v, ok := g["own-numbers"]; ok {
		var arr []string
		if json.Unmarshal(v, &arr) == nil && len(arr) > 0 {
			return arr[0]
		}
	}
	return ""
}

func getPhoneNumber(idx string) string {
	out, _, err := run(30*time.Second, "mmcli", "-m", idx, "--command=AT+CNUM", "-J")
	if err != nil {
		return ""
	}
	var data struct {
		Modem struct {
			Command struct {
				Response string `json:"response"`
			} `json:"command"`
		} `json:"modem"`
	}
	if json.Unmarshal([]byte(out), &data) != nil {
		return ""
	}
	if m := reCnum.FindStringSubmatch(data.Modem.Command.Response); m != nil {
		return m[1]
	}
	return ""
}

func mapState(state string) string {
	switch strings.ToLower(state) {
	case "registered", "connected":
		return "connected"
	case "disabled", "disabling", "enabling", "searching":
		return "disconnected"
	case "failed":
		return "error"
	}
	return "unknown"
}

// SendSMS creates, sends and deletes an SMS object. Returns (success, message).
func SendSMS(mmIndex, phoneNumber, text string) (bool, string) {
	escaped := strings.ReplaceAll(text, `"`, `\"`)
	createArg := "--messaging-create-sms=number=" + phoneNumber + `,text="` + escaped + `"`
	out, stderr, err := run(30*time.Second, "mmcli", "-m", mmIndex, createArg)
	if err != nil {
		return false, stderr
	}
	m := reSmsIdx.FindStringSubmatch(out)
	if m == nil {
		return false, "Could not find created SMS index"
	}
	smsIdx := m[1]
	_, stderr2, err2 := run(20*time.Second, "mmcli", "-m", mmIndex, "-s", smsIdx, "--send")
	if err2 == errTimeout {
		run(30*time.Second, "mmcli", "-m", mmIndex, "-s", smsIdx, "--delete")
		return false, "发送超时：设备已注册但网络拒绝短信，请确认SIM卡已开通短信服务或VoLTE功能"
	}
	if err2 != nil {
		run(30*time.Second, "mmcli", "-m", mmIndex, "-s", smsIdx, "--delete")
		return false, stderr2
	}
	run(30*time.Second, "mmcli", "-m", mmIndex, "-s", smsIdx, "--delete")
	return true, "sent"
}

// ListInbox returns received (deliver) SMS messages for a modem.
func ListInbox(mmIndex string) []InboxMessage {
	out, _, err := run(30*time.Second, "mmcli", "-m", mmIndex, "--messaging-list-sms", "-J")
	if err != nil {
		return nil
	}
	var data struct {
		Paths []string `json:"modem.messaging.sms"`
	}
	if json.Unmarshal([]byte(out), &data) != nil {
		return nil
	}
	var msgs []InboxMessage
	for _, p := range data.Paths {
		m := reSmsIdxEnd.FindStringSubmatch(p)
		if m == nil {
			continue
		}
		smsIdx := m[1]
		out2, _, e := run(30*time.Second, "mmcli", "-m", mmIndex, "-s", smsIdx, "-J")
		if e != nil {
			continue
		}
		var sd struct {
			Sms struct {
				Content    map[string]string `json:"content"`
				Properties map[string]string `json:"properties"`
			} `json:"sms"`
		}
		if json.Unmarshal([]byte(out2), &sd) != nil {
			continue
		}
		if sd.Sms.Properties["pdu-type"] != "deliver" {
			continue
		}
		msgs = append(msgs, InboxMessage{
			SmsIndex:    smsIdx,
			PhoneNumber: sd.Sms.Content["number"],
			Content:     sd.Sms.Content["text"],
			Timestamp:   sd.Sms.Properties["timestamp"],
			State:       sd.Sms.Properties["state"],
		})
	}
	return msgs
}

// DeleteSmsFromModem removes an inbound SMS object from the physical modem.
func DeleteSmsFromModem(mmObjectPath, mmSmsIndex string) bool {
	if strings.HasPrefix(mmObjectPath, "zte:") {
		return true
	}
	base := strings.SplitN(mmObjectPath, "/Modem/", 2)[0]
	smsPath := base + "/SMS/" + mmSmsIndex
	m := reModemIdx.FindStringSubmatch(mmObjectPath)
	if m == nil {
		return false
	}
	_, _, err := run(30*time.Second, "mmcli", "-m", m[1], "--messaging-delete-sms="+smsPath)
	return err == nil
}

// EnableModem enables a disabled modem.
func EnableModem(mmIndex string) bool {
	_, _, err := run(30*time.Second, "mmcli", "-m", mmIndex, "-e")
	return err == nil
}

func asString(r json.RawMessage) string {
	if r == nil {
		return ""
	}
	var s string
	if json.Unmarshal(r, &s) == nil {
		return s
	}
	return strings.Trim(string(r), `"`)
}

func joinList(r json.RawMessage) string {
	if r == nil {
		return ""
	}
	var arr []string
	if json.Unmarshal(r, &arr) == nil {
		return strings.Join(arr, ",")
	}
	return asString(r)
}

func atoi64(s string) int64 {
	n, _ := strconv.ParseInt(s, 10, 64)
	return n
}
