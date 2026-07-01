package services

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"simnexus-go/config"
	"simnexus-go/database"
	"simnexus-go/models"
)

var prevStatus = map[string]string{}

// StartPolling runs the modem poll loop until ctx is cancelled.
func StartPolling(ctx context.Context) {
	interval := time.Duration(config.C.ModemPollSeconds) * time.Second
	for {
		func() {
			defer func() {
				if r := recover(); r != nil {
					slog.Error("poller panic", "err", r)
				}
			}()
			poll()
		}()
		select {
		case <-ctx.Done():
			return
		case <-time.After(interval):
		}
	}
}

func poll() {
	detected := ListModems()
	if zte := ZteGetModemInfo(); zte != nil {
		detected = append(detected, *zte)
	}

	db := database.DB
	seen := map[string]bool{}
	for _, info := range detected {
		path := info.MmObjectPath
		seen[path] = true

		var modem models.Modem
		err := db.Where("mm_object_path = ?", path).First(&modem).Error
		if err != nil {
			// try match by IMEI to preserve history after D-Bus path change
			found := false
			if info.Imei != "" {
				if db.Where("imei = ?", info.Imei).First(&modem).Error == nil {
					modem.MmObjectPath = path
					found = true
				}
			}
			if !found {
				modem = models.Modem{MmObjectPath: path}
			}
		}

		modem.DevicePath = info.DevicePath
		modem.Manufacturer = info.Manufacturer
		modem.Model = info.Model
		if info.Imei != "" {
			modem.Imei = info.Imei
		}
		modem.Operator = info.Operator
		modem.SignalQuality = info.SignalQuality
		modem.Status = info.Status
		if info.PhoneNumber != "" {
			modem.PhoneNumber = info.PhoneNumber
		}
		modem.AccessTechnologies = info.AccessTechnologies
		modem.RegistrationState = info.RegistrationState
		modem.TxBytes = info.TxBytes
		modem.RxBytes = info.RxBytes
		modem.ConnectionDuration = info.ConnectionDuration
		if info.Imsi != "" {
			modem.Imsi = info.Imsi
		}
		if info.Iccid != "" {
			modem.Iccid = info.Iccid
		}
		if info.FirmwareRevision != "" {
			modem.FirmwareRevision = info.FirmwareRevision
		}
		if info.HardwareRevision != "" {
			modem.HardwareRevision = info.HardwareRevision
		}
		if info.CurrentBands != "" {
			modem.CurrentBands = info.CurrentBands
		}
		if info.SimOperatorName != "" {
			modem.SimOperatorName = info.SimOperatorName
		}
		if info.SimOperatorCode != "" {
			modem.SimOperatorCode = info.SimOperatorCode
		}
		if info.CurrentModes != "" {
			modem.CurrentModes = info.CurrentModes
		}
		if info.Ports != "" {
			modem.Ports = info.Ports
		}
		if info.Plugin != "" {
			modem.Plugin = info.Plugin
		}
		modem.LastSeen = time.Now()
		modem.IsActive = true
		db.Save(&modem)

		// auto-enable disabled modems
		if info.RawState == "disabled" && !strings.HasPrefix(path, "zte:") {
			slog.Info("auto-enabling disabled modem", "index", info.MmIndex)
			go EnableModem(info.MmIndex)
		}

		// status transitions
		label := info.Model
		if modem.Alias != "" {
			label = modem.Alias
		}
		if label == "" {
			label = path
		}
		old, had := prevStatus[path]
		if had && old != info.Status {
			if info.Status == "connected" {
				Push("modem_online", "设备上线", label+" 已连接", "admin", nil)
			} else if info.Status == "disconnected" || info.Status == "unknown" {
				Push("modem_offline", "设备离线", label+" 已断开连接", "admin", nil)
			}
		}
		prevStatus[path] = info.Status

		if info.Source == "zte" {
			ingestInbox(&modem, ZteListSMS())
		} else {
			ingestInbox(&modem, ListInbox(info.MmIndex))
		}
	}

	// mark gone modems disconnected
	var gone []models.Modem
	q := db.Where("is_active = ?", true)
	if len(seen) > 0 {
		paths := make([]string, 0, len(seen))
		for p := range seen {
			paths = append(paths, p)
		}
		q = q.Where("mm_object_path NOT IN ?", paths)
	}
	q.Find(&gone)
	for i := range gone {
		m := &gone[i]
		label := m.Alias
		if label == "" {
			label = m.Model
		}
		if label == "" {
			label = m.MmObjectPath
		}
		Push("modem_offline", "设备离线", label+" 已断开连接", "admin", nil)
		m.Status = models.ModemDisconnected
		m.IsActive = false
		db.Save(m)
	}
}

func ingestInbox(modem *models.Modem, messages []InboxMessage) {
	db := database.DB
	for _, msg := range messages {
		var existing models.SmsMessage
		err := db.Where("modem_id = ? AND mm_sms_index = ? AND direction = ?",
			modem.ID, msg.SmsIndex, models.SmsInbound).First(&existing).Error
		if err == nil {
			continue
		}
		now := time.Now()
		sms := models.SmsMessage{
			ModemID:     modem.ID,
			MmSmsIndex:  msg.SmsIndex,
			Direction:   models.SmsInbound,
			PhoneNumber: msg.PhoneNumber,
			Content:     msg.Content,
			Status:      models.SmsReceived,
			ReceivedAt:  &now,
		}
		db.Create(&sms)
		label := modem.Alias
		if label == "" {
			label = modem.Model
		}
		if label == "" {
			label = fmt.Sprintf("设备#%d", modem.ID)
		}
		go TelegramPushInboundSMS(label, msg.PhoneNumber, msg.Content)
	}
}
