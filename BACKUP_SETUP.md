# Database Split and Backup Setup

## 1) Use Separate Databases in Same Cluster

Use one Atlas cluster with two databases:

- Development DB: `jewel_dev`
- Production DB: `jewel_prod`

Set env files:

- `.env.development` -> `MONGODB_URI=.../jewel_dev?...`
- `.env.production` -> `MONGODB_URI=.../jewel_prod?...`

The app is configured to load:

1. `.env.<NODE_ENV>`
2. `.env` (fallback)

## 2) Install Tools on Server

Install MongoDB tools and s3cmd:

```bash
sudo apt-get update
sudo apt-get install -y s3cmd
```

Install `mongodump` via MongoDB Database Tools (official package for your OS).

Configure `s3cmd`:

```bash
s3cmd --configure
```

When prompted:

- Access Key / Secret -> DigitalOcean Spaces Keys
- Endpoint -> e.g. `sgp1.digitaloceanspaces.com`

## 3) Required Backup Environment Variables

Set these on the server (or in a protected env file):

```bash
BACKUP_MONGODB_URI="mongodb+srv://user:pass@cluster.mongodb.net/jewel_prod?retryWrites=true&w=majority"
BACKUP_SPACE_NAME="your-space-name"
BACKUP_S3_ENDPOINT="sgp1.digitaloceanspaces.com"
BACKUP_TMP_DIR="./tmp_backups"
```

## 4) Run Backup Script Manually

```bash
cd backend
chmod +x scripts/db_backup.sh
./scripts/db_backup.sh
```

Upload behavior:

- Sunday -> `s3://<space>/weekly/`
- Other days -> `s3://<space>/daily/`

## 5) Retention via DigitalOcean Lifecycle Rules

In Space settings, add:

- Prefix `daily/` -> expire after **7 days**
- Prefix `weekly/` -> expire after **30 days**

## 6) Schedule with Cron

At 2:00 AM daily:

```bash
0 2 * * * /bin/bash /path/to/backend/scripts/db_backup.sh >> /var/log/db_backup.log 2>&1
```

Recommended: run during low-traffic window to reduce impact.

## One-Time DB Rename Migration (test -> priyincigold DBs)

If your current data is in `test` and you want full copy into both:

- `priyincigold-dev`
- `priyincigold-prod`

Use:

```bash
cd backend
chmod +x scripts/migrate_to_priyincigold_dbs.sh
MIGRATE_CONFIRM=yes npm run migrate:priyincigold-dbs
```

Defaults:

- source DB: `test`
- target dev DB: `priyincigold-dev`
- target prod DB: `priyincigold-prod`
- drops target collections before restore: `true`

Override any default:

```bash
MIGRATE_SOURCE_DB=test \
MIGRATE_TARGET_DEV_DB=priyincigold-dev \
MIGRATE_TARGET_PROD_DB=priyincigold-prod \
MIGRATE_DROP_TARGET=true \
MIGRATE_CONFIRM=yes \
npm run migrate:priyincigold-dbs
```
