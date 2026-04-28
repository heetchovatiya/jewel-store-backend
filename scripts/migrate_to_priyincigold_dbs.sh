#!/usr/bin/env bash
set -euo pipefail

# Migrates all collections from one source DB into:
# - priyincigold-dev
# - priyincigold-prod
#
# Default assumptions:
# - source database name is "test"
# - same cluster/credentials can access source and targets
#
# Optional env vars:
#   MIGRATE_SOURCE_URI
#   MIGRATE_SOURCE_DB
#   MIGRATE_TARGET_URI
#   MIGRATE_TARGET_DEV_DB
#   MIGRATE_TARGET_PROD_DB
#   MIGRATE_DROP_TARGET=true|false
#   MIGRATE_CONFIRM=yes
#   MIGRATE_TMP_DIR=./tmp_migrations

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

DOTENV_MONGODB_URI=""
if [[ -f "${PROJECT_ROOT}/.env" ]]; then
  DOTENV_MONGODB_URI="$(node -e "const dotenv=require('dotenv'); const path=require('path'); dotenv.config({path:path.join(process.argv[1],'.env'), quiet:true}); process.stdout.write((process.env.MONGODB_URI||'').trim());" "${PROJECT_ROOT}")"
fi

SOURCE_URI="${MIGRATE_SOURCE_URI:-${MONGODB_URI:-${DOTENV_MONGODB_URI:-}}}"
SOURCE_DB="${MIGRATE_SOURCE_DB:-test}"
TARGET_URI="${MIGRATE_TARGET_URI:-${MONGODB_URI:-${DOTENV_MONGODB_URI:-}}}"
TARGET_DEV_DB="${MIGRATE_TARGET_DEV_DB:-priyincigold-dev}"
TARGET_PROD_DB="${MIGRATE_TARGET_PROD_DB:-priyincigold-prod}"
DROP_TARGET="${MIGRATE_DROP_TARGET:-true}"
CONFIRM="${MIGRATE_CONFIRM:-}"
TMP_DIR="${MIGRATE_TMP_DIR:-${PROJECT_ROOT}/tmp_migrations}"

if [[ -z "${SOURCE_URI}" || -z "${TARGET_URI}" ]]; then
  echo "Missing URI. Set MONGODB_URI in .env or provide MIGRATE_SOURCE_URI/MIGRATE_TARGET_URI."
  exit 1
fi

# Normalize any accidental quotes/whitespace around URI values
SOURCE_URI="$(printf '%s' "${SOURCE_URI}" | tr -d '\r' | sed -E 's/^"(.*)"$/\1/' | sed -E "s/^'(.*)'$/\1/")"
TARGET_URI="$(printf '%s' "${TARGET_URI}" | tr -d '\r' | sed -E 's/^"(.*)"$/\1/' | sed -E "s/^'(.*)'$/\1/")"

if ! command -v mongodump >/dev/null 2>&1; then
  echo "mongodump is not installed. Install mongodb-database-tools."
  exit 1
fi

if ! command -v mongorestore >/dev/null 2>&1; then
  echo "mongorestore is not installed. Install mongodb-database-tools."
  exit 1
fi

echo "Source DB: ${SOURCE_DB}"
echo "Target Dev DB: ${TARGET_DEV_DB}"
echo "Target Prod DB: ${TARGET_PROD_DB}"
echo "Drop target DB collections before restore: ${DROP_TARGET}"

if [[ "${CONFIRM}" != "yes" ]]; then
  echo "Safety check: this will copy full data from '${SOURCE_DB}' to both target DBs."
  echo "Re-run with MIGRATE_CONFIRM=yes to continue."
  exit 1
fi

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
WORK_DIR="${TMP_DIR}/migration_${TIMESTAMP}"
ARCHIVE_PATH="${WORK_DIR}/source_${SOURCE_DB}.archive.gz"
mkdir -p "${WORK_DIR}"

cleanup() {
  rm -rf "${WORK_DIR}"
}
trap cleanup EXIT

echo "Dumping source database '${SOURCE_DB}'..."
mongodump \
  --uri="${SOURCE_URI}" \
  --db="${SOURCE_DB}" \
  --archive="${ARCHIVE_PATH}" \
  --gzip

RESTORE_COMMON_ARGS=(
  --uri="${TARGET_URI}"
  --archive="${ARCHIVE_PATH}"
  --gzip
  --nsFrom="${SOURCE_DB}.*"
)

if [[ "${DROP_TARGET}" == "true" ]]; then
  RESTORE_COMMON_ARGS+=(--drop)
fi

echo "Restoring into '${TARGET_DEV_DB}'..."
mongorestore "${RESTORE_COMMON_ARGS[@]}" --nsTo="${TARGET_DEV_DB}.*"

echo "Restoring into '${TARGET_PROD_DB}'..."
mongorestore "${RESTORE_COMMON_ARGS[@]}" --nsTo="${TARGET_PROD_DB}.*"

echo "Migration completed successfully."
echo "Migrated '${SOURCE_DB}' -> '${TARGET_DEV_DB}' and '${TARGET_PROD_DB}'."
