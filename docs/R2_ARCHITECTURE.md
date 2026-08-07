# Cloudflare R2 — free-tier friendly architecture

## Goals
- Stay within **1M Class A** / **10M Class B** / **10 GB** free monthly allowances
- Unlimited egress via public CDN
- No `ListObjects` against the bucket (metadata lives in MongoDB)

## Request flow
1. Admin UI asks Droplet for `POST /admin/upload/presigned-url`
2. Browser `PUT`s the file **directly to R2** (1 Class A) with `Cache-Control: public, max-age=31536000, immutable`
3. App stores the object **key** only in MongoDB (`products/…`, `banners/…`, etc.)
4. API responses expand keys → `CDN_BASE_URL` / `R2_PUBLIC_DOMAIN` full URLs
5. Shoppers load images from the CDN. Edge + browser cache → near-zero Class B after first hit

## Env (backend)
```bash
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
R2_BUCKET_NAME=app-production-bucket
CDN_BASE_URL=https://cdn.priyancigold.com
R2_PUBLIC_DOMAIN=https://cdn.priyancigold.com
R2_CACHE_CONTROL=public, max-age=31536000, immutable
```

## Env (frontend)
```bash
NEXT_PUBLIC_CDN_URL=https://cdn.priyancigold.com
```

## Migrate existing full URLs → keys
```bash
npm run migrate:media-keys          # dry-run
npm run migrate:media-keys:commit   # write
```

Collections: `products`, `storeconfigs`, `carts`, `orders`.
## R2 CORS (required for direct browser PUT)
In Cloudflare Dashboard → R2 → bucket → Settings → CORS:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:3000",
      "https://www.priyancigold.com",
      "https://priyancigold.com"
    ],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["Content-Type", "Cache-Control"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

If CORS is missing, the frontend falls back to `POST /admin/upload/file` (proxy). Prefer fixing CORS so uploads stay off the Droplet.

## Rules we follow in code
| Rule | Implementation |
|------|----------------|
| No ListObjects | Object **keys** stored in MongoDB; URLs built at read time |
| Single PutObject | Files capped at 20MB (≪ 200MB multipart threshold) |
| Cache-Control on write | Set on PutObject + required on signed PUT |
| Public reads via CNAME | `CDN_BASE_URL` / `NEXT_PUBLIC_CDN_URL` |
| Private reads | `POST /admin/upload/presigned-download` (15 min) only when needed |

## What NOT to do
- Do not call `ListObjects` / `listBuckets` on page load
- Do not proxy every image upload through the Droplet in production
- Do not serve shop images from raw `*.r2.cloudflarestorage.com` URLs
