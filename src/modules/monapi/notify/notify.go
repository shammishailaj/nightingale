package notify

import (
	"bytes"
	"encoding/json"
	"fmt"
	"github.com/didi/nightingale/src/dataobj"
	"github.com/didi/nightingale/src/modules/monapi/redisc"
	"html/template"
	"path"
	"strings"

	"github.com/toolkits/pkg/file"
	"github.com/toolkits/pkg/logger"

	"github.com/didi/nightingale/src/model"
	"github.com/didi/nightingale/src/modules/monapi/config"
)

func DoNotify(isUpgrade bool, events ...*model.Event) {
	cnt := len(events)
	if cnt == 0 {
		return
	}

	userIds, err := getUserIds(events[cnt-1].Users, events[cnt-1].Groups)
	if err != nil {
		logger.Errorf("notify failed, get users id failed, events: %+v, err: %v", events, err)
		return
	}

	prio := fmt.Sprintf("p%v", events[cnt-1].Priority)

	if isUpgrade {
		alertUpgradeString := events[cnt-1].AlertUpgrade
		var alertUpgrade model.EventAlertUpgrade
		if err = json.Unmarshal([]byte(alertUpgradeString), &alertUpgrade); err != nil {
			logger.Errorf("")
		}

		upgradeUserIds, err := getUserIds(alertUpgrade.Users, alertUpgrade.Groups)
		if err != nil {
			logger.Errorf("upgrade notify failed, get upgrade users id failed, events: %+v, err: %v", events, err)
		}

		if upgradeUserIds != nil {
			userIds = append(userIds, upgradeUserIds...)
		}
		prio = fmt.Sprintf("p%v", alertUpgrade.Level)
	}

	users, err := model.UserGetByIds(userIds)
	if err != nil {
		logger.Errorf("notify failed, get user by id failed, events: %+v, err: %v", events, err)
		return
	}

	endpoint := genEndpoint(events)
	metric := genMetric(events, cnt)

	smsContent, mailContent := genContent(isUpgrade, events, endpoint, metric)
	subject := genSubject(isUpgrade, events, endpoint)

	notifyTypes := config.Get().Notify[prio]

	for i := 0; i < len(notifyTypes); i++ {
		switch notifyTypes[i] {
		case "voice":
			if events[0].EventType == config.ALERT {
				var tos []string
				for j := 0; j < len(users); j++ {
					tos = append(tos, users[j].Phone)
				}

				logger.Debugf("--->>> send-voice begin, metric: %s, endpoint: %s", metric, endpoint)
				send(config.Set(tos), events[0].Sname, "", "voice")
				logger.Debugf("--->>> send-voice done, metric: %s, endpoint: %s", metric, endpoint)
			}
		case "sms":
			var tos []string
			for j := 0; j < len(users); j++ {
				tos = append(tos, users[j].Phone)
			}

			logger.Debugf("--->>> send-sms begin, metric: %s, endpoint: %s", metric, endpoint)
			send(config.Set(tos), smsContent, "", "sms")
			logger.Debugf("--->>> send-sms done, metric: %s, endpoint: %s", metric, endpoint)
		case "mail":
			var tos []string
			for j := 0; j < len(users); j++ {
				tos = append(tos, users[j].Email)
			}

			logger.Debugf("--->>> send-mail begin, metric: %s, endpoint: %s", metric, endpoint)
			send(config.Set(tos), mailContent, subject, "mail")
			logger.Debugf("--->>> send-mail done, metric: %s, endpoint: %s", metric, endpoint)
		case "im":
			var tos []string
			for j := 0; j < len(users); j++ {
				tos = append(tos, users[j].Im)
			}

			logger.Debugf("--->>> send-im begin, metric: %s, endpoint: %s", metric, endpoint)
			send(config.Set(tos), smsContent, "", "im")
			logger.Debugf("--->>> send-im done, metric: %s, endpoint: %s", metric, endpoint)
		default:
			logger.Errorf("not support %s to send notify, events: %+v", notifyTypes[i], events)
		}
	}
}

func genContent(isUpgrade bool, events []*model.Event, endpoint, metric string) (string, string) {
	cnt := len(events)
	if cnt == 0 {
		return "", ""
	}

	cfg := config.Get()

	status := genStatus(events)
	sname := events[cnt-1].Sname
	tags := genTags(events)
	value := events[cnt-1].Value
	info := events[cnt-1].Info
	etime := genEtime(events)
	slink := fmt.Sprintf(cfg.Link.Stra, events[cnt-1].Sid)
	elink := fmt.Sprintf(cfg.Link.Event, events[cnt-1].Id)
	clink := ""

	content := fmt.Sprintf(
		"级别状态：%s\n策略名称：%s\nendpoint：%s\nmetric：%s\ntags：%s\n当前值：%s\n报警说明：%s\n触发时间：%s\n报警详情：%s\n报警策略：%s",
		status,
		sname,
		endpoint,
		metric,
		tags,
		value,
		info,
		etime,
		elink,
		slink)

	if events[0].EventType == config.ALERT {
		clink = genClaimLink(events)
		if clink != "" {
			content += fmt.Sprintf("\n认领报警：%s", clink)
		}

	}

	mailContent := ""
	if isUpgrade {
		content = "[报警已升级]\n" + content
	}

	fp := path.Join(file.SelfDir(), "etc", "mail.tpl")
	t, err := template.ParseFiles(fp)
	if err != nil {
		logger.Errorf("InternalServerError: cannot parse %s %v", fp, err)
		mailContent = fmt.Sprintf("InternalServerError: cannot parse %s %v", fp, err)
	} else {
		isAlert := false
		hasClaim := false
		if events[0].EventType == config.ALERT {
			isAlert = true
		}

		if clink != "" {
			hasClaim = true
		}

		var body bytes.Buffer
		err = t.Execute(&body, map[string]interface{}{
			"IsAlert":   isAlert,
			"Status":    status,
			"Sname":     sname,
			"Endpoint":  endpoint,
			"Metric":    metric,
			"Tags":      tags,
			"Value":     value,
			"Info":      info,
			"Etime":     etime,
			"Elink":     elink,
			"Slink":     slink,
			"HasClaim":  hasClaim,
			"Clink":     clink,
			"IsUpgrade": isUpgrade,
			"Bindings":  model.EndpointBindingsForMail(endpoints(events)),
		})

		if err != nil {
			logger.Errorf("InternalServerError: %v", err)
			mailContent = fmt.Sprintf("InternalServerError: %v", err)
		} else {
			mailContent += body.String()
		}
	}

	return content, mailContent
}

func genMetric(events []*model.Event, cnt int) string {
	var metricList []string
	detail, err := events[cnt-1].GetEventDetail()
	if err != nil {
		logger.Errorf("[genMetric] get event detail failed, event: %+v, err: %v", events[cnt-1], err)
	} else {
		for i := 0; i < len(detail); i++ {
			metricList = append(metricList, detail[0].Metric)
		}
	}

	return strings.Join(metricList, ",")
}

func genClaimLink(events []*model.Event) string {
	for i := 0; i < len(events); i++ {
		eventCur, err := model.EventCurGet("hashid", events[i].HashId)
		if err != nil {
			logger.Errorf("get event_cur failed, err: %v, event: %+v", err, events[i])
			continue
		}

		if eventCur == nil {
			continue
		}

		return fmt.Sprintf(config.Get().Link.Claim, eventCur.Id)
	}
	return ""
}

func genSubject(isUpgrade bool, events []*model.Event, endpoint string) string {
	cnt := len(events)

	subject := ""
	if isUpgrade {
		subject = "[报警已升级]" + subject
	}

	if cnt > 1 {
		subject += fmt.Sprintf("[P%d 聚合%s]%s", events[cnt-1].Priority, config.EventTypeMap[events[cnt-1].EventType], events[cnt-1].Sname)
	} else {
		subject += fmt.Sprintf("[P%d %s]%s", events[cnt-1].Priority, config.EventTypeMap[events[cnt-1].EventType], events[cnt-1].Sname)
	}

	return subject + " - " + endpoint
}

func genStatus(events []*model.Event) string {
	cnt := len(events)
	status := fmt.Sprintf("P%d %s", events[cnt-1].Priority, config.EventTypeMap[events[cnt-1].EventType])

	if cnt > 1 {
		status += "（聚合）"
	}

	return status
}

func genEndpoint(events []*model.Event) string {
	var endpointList []string
	for i := 0; i < len(events); i++ {
		endpointList = append(endpointList, fmt.Sprintf("%s(%s)", events[i].Endpoint, events[i].EndpointAlias))
	}

	endpointList = config.Set(endpointList)

	if len(endpointList) == 1 {
		return endpointList[0]
	}

	return fmt.Sprintf("%s（%v）", strings.Join(endpointList, ","), len(endpointList))
}

func endpoints(events []*model.Event) []string {
	var list []string
	for i := 0; i < len(events); i++ {
		list = append(list, events[i].Endpoint)
	}
	return config.Set(list)
}

func genTags(events []*model.Event) string {
	tagsMap := make(map[string][]string)
	for i := 0; i < len(events); i++ {
		detail, err := events[i].GetEventDetail()
		if err != nil {
			continue
		}
		for k, v := range detail[0].Tags {
			if !config.InSlice(v, tagsMap[k]) {
				tagsMap[k] = append(tagsMap[k], v)
			}
		}
	}

	var tagsList []string
	for k, v := range tagsMap {
		valueString := strings.Join(v, ",")
		if len(v) > 1 {
			valueString = "[" + valueString + "]"
		}
		tagsList = append(tagsList, fmt.Sprintf("%s=%s", k, valueString))
	}

	return strings.Join(tagsList, ",")
}

func genEtime(events []*model.Event) string {
	if len(events) == 1 {
		return model.ParseEtime(events[0].Etime)
	}

	stime := events[0].Etime
	etime := events[0].Etime

	for i := 1; i < len(events); i++ {
		if events[i].Etime < stime {
			stime = events[i].Etime
		}

		if events[i].Etime > etime {
			etime = events[i].Etime
		}
	}

	if stime == etime {
		return model.ParseEtime(stime)
	}

	return model.ParseEtime(stime) + "~" + model.ParseEtime(etime)
}

func send(tos []string, content, subject, notifyType string) {
	message := dataobj.NotifyMessage{
		Tos:     tos,
		Subject: subject,
		Content: content,
		Type:    notifyType,
	}

	bs, err := json.Marshal(message)
	if err != nil {
		logger.Error("json.marshal notifyMessage fail: ", err)
		return
	}

	payload := string(bs)
	logger.Debug(payload)

	rc := redisc.RedisConnPool.Get()
	defer rc.Close()

	if _, err := rc.Do("LPUSH", config.NotifyQueue+notifyType, payload); err != nil {
		logger.Errorf("LPUSH %s error: %v", payload, err)
	}
}

func getUserIds(users, groups string) ([]int64, error) {
	var userIds []int64

	if err := json.Unmarshal([]byte(users), &userIds); err != nil {
		logger.Errorf("unmarshal users failed, users: %s, err: %v", users, err)
		return nil, err
	}

	var groupIds []int64
	if err := json.Unmarshal([]byte(groups), &groupIds); err != nil {
		logger.Errorf("unmarshal groups failed, groups: %s, err: %v", groups, err)
		return nil, err
	}

	teamUsers, err := model.UserIdGetByTeamIds(groupIds)
	if err != nil {
		logger.Errorf("get user id by team id failed, err: %v", err)
		return nil, err
	}

	userIds = append(userIds, teamUsers...)

	return userIds, nil
}
