#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   BACKUP_MONGODB_URI=... BACKUP_SPACE_NAME=... BACKUP_S3_ENDPOINT=... ./scripts/db_backup.sh
#
# Optional:
#   BACKUP_TMP_DIR=./tmp_backups

BACKUP_MONGODB_URI="${BACKUP_MONGODB_URI:-}"
BACKUP_SPACE_NAME="${BACKUP_SPACE_NAME:-}"
BACKUP_S3_ENDPOINT="${BACKUP_S3_ENDPOINT:-}"
BACKUP_TMP_DIR="${BACKUP_TMP_DIR:-./tmp_backups}"

if [[ -z "$BACKUP_MONGODB_URI" || -z "$BACKUP_SPACE_NAME" || -z "$BACKUP_S3_ENDPOINT" ]]; then
  echo "Missing required env vars: BACKUP_MONGODB_URI, BACKUP_SPACE_NAME, BACKUP_S3_ENDPOINT"
  exit 1
fi

if ! command -v mongodump >/dev/null 2>&1; then
  echo "mongodump is not installed. Install mongodb-database-tools first."
  exit 1
fi

if ! command -v s3cmd >/dev/null 2>&1; then
  echo "s3cmd is not installed. Install and configure s3cmd first."
  exit 1
fi

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_NAME="backup_${TIMESTAMP}"
WORK_DIR="${BACKUP_TMP_DIR}/${BACKUP_NAME}"
ARCHIVE_PATH="${BACKUP_TMP_DIR}/${BACKUP_NAME}.tar.gz"

mkdir -p "$WORK_DIR"

echo "Creating MongoDB dump..."
mongodump --uri="$BACKUP_MONGODB_URI" --out="$WORK_DIR"

echo "Compressing backup..."
tar -czf "$ARCHIVE_PATH" -C "$BACKUP_TMP_DIR" "$BACKUP_NAME"

DAY_OF_WEEK="$(date +%u)" # 1-7 (7 = Sunday)
if [[ "$DAY_OF_WEEK" == "7" ]]; then
  PREFIX="weekly"
else
  PREFIX="daily"
fi

echo "Uploading to DigitalOcean Spaces (${PREFIX})..."
s3cmd put "$ARCHIVE_PATH" "s3://${BACKUP_SPACE_NAME}/${PREFIX}/" --host="${BACKUP_S3_ENDPOINT}" --host-bucket="%(bucket).${BACKUP_S3_ENDPOINT}"

echo "Cleaning up local files..."
rm -rf "$WORK_DIR"
rm -f "$ARCHIVE_PATH"

echo "Backup completed successfully."
