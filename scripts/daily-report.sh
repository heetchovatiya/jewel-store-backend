#!/bin/bash
# Daily Server Report Script
# Run via cron: 0 9 * * * /home/appuser/daily-report.sh

WEBHOOK_URL="${WEBHOOK_URL:-YOUR_DISCORD_WEBHOOK_URL}"

# Get server stats
UPTIME=$(uptime -p)
DISK=$(df -h / | awk 'NR==2 {print $5}')
MEMORY=$(free -m | awk 'NR==2{printf "%.1f%%", $3*100/$2}')
CPU=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
PM2_STATUS=$(pm2 jlist 2>/dev/null | jq -r '.[0].pm2_env.status // "unknown"')
CONNECTIONS=$(netstat -an 2>/dev/null | grep :3001 | grep ESTABLISHED | wc -l)

# Send report to Discord
curl -s -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d "{
    \"embeds\": [{
      \"title\": \"📊 Daily Server Report - Jewel Store API\",
      \"color\": 3447003,
      \"fields\": [
        {\"name\": \"🟢 Status\", \"value\": \"$PM2_STATUS\", \"inline\": true},
        {\"name\": \"⏱️ Uptime\", \"value\": \"$UPTIME\", \"inline\": true},
        {\"name\": \"💾 Disk\", \"value\": \"$DISK\", \"inline\": true},
        {\"name\": \"🧠 Memory\", \"value\": \"$MEMORY\", \"inline\": true},
        {\"name\": \"⚡ CPU\", \"value\": \"${CPU}%\", \"inline\": true},
        {\"name\": \"🔗 Connections\", \"value\": \"$CONNECTIONS\", \"inline\": true}
      ],
      \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
    }]
  }"

echo "Daily report sent at $(date)"
