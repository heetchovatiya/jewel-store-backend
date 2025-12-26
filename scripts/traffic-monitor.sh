#!/bin/bash
# Traffic Surge Monitor Script - Email Version
# Run via cron: */5 * * * * /home/appuser/traffic-monitor.sh

# Email Configuration
SMTP_SERVER="smtp.gmail.com"
SMTP_PORT="587"
EMAIL_FROM="${EMAIL_FROM:-your-email@gmail.com}"
EMAIL_TO="${EMAIL_TO:-your-email@gmail.com}"
EMAIL_PASSWORD="${EMAIL_PASSWORD:-your-app-password}"

THRESHOLD=${THRESHOLD:-100}

# Count active connections to API port
CONNECTIONS=$(netstat -an 2>/dev/null | grep :3001 | grep ESTABLISHED | wc -l)
DATE=$(date '+%Y-%m-%d %H:%M:%S')

# Alert if connections exceed threshold
if [ "$CONNECTIONS" -gt "$THRESHOLD" ]; then
  EMAIL_BODY="
🚨 TRAFFIC SURGE ALERT - Jewel Store API
==========================================
Time: $DATE

⚠️ Unusual traffic detected!

🔗 Current Connections: $CONNECTIONS
📊 Threshold: $THRESHOLD
🖥️ Server: $(hostname)

Please check your server immediately.
==========================================
"

  echo -e "Subject: 🚨 Traffic Surge Alert - $CONNECTIONS connections!\nFrom: $EMAIL_FROM\nTo: $EMAIL_TO\n\n$EMAIL_BODY" | \
    msmtp --host=$SMTP_SERVER --port=$SMTP_PORT --auth=on --user=$EMAIL_FROM --passwordeval="echo $EMAIL_PASSWORD" --tls=on $EMAIL_TO
  
  echo "Traffic surge alert sent at $(date)"
fi
