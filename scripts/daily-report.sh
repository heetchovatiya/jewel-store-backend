#!/bin/bash
# Daily Server Report Script - Email Version
# Run via cron: 0 9 * * * /home/appuser/daily-report.sh

# Email Configuration
SMTP_SERVER="smtp.gmail.com"
SMTP_PORT="587"
EMAIL_FROM="${EMAIL_FROM:-your-email@gmail.com}"
EMAIL_TO="${EMAIL_TO:-your-email@gmail.com}"
EMAIL_PASSWORD="${EMAIL_PASSWORD:-your-app-password}"

# Get server stats
UPTIME=$(uptime -p)
DISK=$(df -h / | awk 'NR==2 {print $5}')
MEMORY=$(free -m | awk 'NR==2{printf "%.1f%%", $3*100/$2}')
CPU=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
PM2_STATUS=$(pm2 jlist 2>/dev/null | jq -r '.[0].pm2_env.status // "unknown"')
CONNECTIONS=$(netstat -an 2>/dev/null | grep :3001 | grep ESTABLISHED | wc -l)
DATE=$(date '+%Y-%m-%d %H:%M:%S')

# Create email content
EMAIL_BODY="
📊 DAILY SERVER REPORT - Jewel Store API
==========================================
Date: $DATE

🟢 Status: $PM2_STATUS
⏱️ Uptime: $UPTIME
💾 Disk Usage: $DISK
🧠 Memory Usage: $MEMORY
⚡ CPU Usage: ${CPU}%
🔗 Active Connections: $CONNECTIONS

==========================================
This is an automated report from your server.
"

# Send email using msmtp (install: apt install msmtp msmtp-mta)
echo -e "Subject: 📊 Daily Server Report - $(date '+%Y-%m-%d')\nFrom: $EMAIL_FROM\nTo: $EMAIL_TO\n\n$EMAIL_BODY" | \
  msmtp --host=$SMTP_SERVER --port=$SMTP_PORT --auth=on --user=$EMAIL_FROM --passwordeval="echo $EMAIL_PASSWORD" --tls=on $EMAIL_TO

echo "Daily report sent at $(date)"
