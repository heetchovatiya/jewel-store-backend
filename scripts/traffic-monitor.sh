#!/bin/bash
# Traffic Surge Monitor Script
# Run via cron: */5 * * * * /home/appuser/traffic-monitor.sh

WEBHOOK_URL="${WEBHOOK_URL:-YOUR_DISCORD_WEBHOOK_URL}"
THRESHOLD=${THRESHOLD:-100}

# Count active connections to API port
CONNECTIONS=$(netstat -an 2>/dev/null | grep :3001 | grep ESTABLISHED | wc -l)

# Alert if connections exceed threshold
if [ "$CONNECTIONS" -gt "$THRESHOLD" ]; then
  curl -s -X POST "$WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -d "{
      \"embeds\": [{
        \"title\": \"🚨 Traffic Surge Alert!\",
        \"color\": 15158332,
        \"description\": \"Unusual traffic detected on your API server.\",
        \"fields\": [
          {\"name\": \"Current Connections\", \"value\": \"$CONNECTIONS\", \"inline\": true},
          {\"name\": \"Threshold\", \"value\": \"$THRESHOLD\", \"inline\": true},
          {\"name\": \"Server\", \"value\": \"$(hostname)\", \"inline\": true}
        ],
        \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
      }]
    }"
  echo "Traffic surge alert sent at $(date)"
fi
