#!/usr/bin/env ts-node
/**
 * Migrate stored media URLs → object keys only.
 *
 * Usage:
 *   npx ts-node scripts/migrate-media-keys.ts          # dry-run (default)
 *   npx ts-node scripts/migrate-media-keys.ts --commit # write changes
 *
 * Reads MONGODB_URI_BASE / MONGODB_DB_PREFIX / NODE_ENV from .env
 */

import * as fs from 'fs';
import * as path from 'path';
import { MongoClient, Db, Document } from 'mongodb';

function loadEnv() {
    const envPath = path.join(__dirname, '..', '.env');
    if (!fs.existsSync(envPath)) return;
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;
        const eq = trimmed.indexOf('=');
        if (eq < 0) continue;
        const key = trimmed.slice(0, eq).trim();
        let val = trimmed.slice(eq + 1).trim();
        if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
        ) {
            val = val.slice(1, -1);
        }
        if (!(key in process.env)) process.env[key] = val;
    }
}

function withDatabaseName(uri: string, dbName: string): string {
    const trimmed = uri.trim().replace(/^['"]|['"]$/g, '');
    const qIndex = trimmed.indexOf('?');
    const base = qIndex >= 0 ? trimmed.slice(0, qIndex) : trimmed;
    const query = qIndex >= 0 ? trimmed.slice(qIndex) : '';
    const schemeIdx = base.indexOf('://');
    if (schemeIdx < 0) return trimmed;
    const firstSlashAfterHost = base.indexOf('/', schemeIdx + 3);
    if (firstSlashAfterHost < 0) return `${base}/${dbName}${query}`;
    const authority = base.slice(0, firstSlashAfterHost);
    return `${authority}/${dbName}${query}`;
}

function resolveMongoUri(): string {
    const nodeEnv = (process.env.NODE_ENV || 'development').toLowerCase();
    const suffix = nodeEnv === 'production' ? 'prod' : 'dev';
    const dbPrefix = process.env.MONGODB_DB_PREFIX || 'priyincigold';
    const dbName = `${dbPrefix}-${suffix}`;
    const baseUri =
        process.env.MONGODB_URI_BASE || process.env.MONGODB_URI || 'mongodb://localhost:27017';
    return withDatabaseName(baseUri, dbName);
}

/** Strip full URL → key. Idempotent for bare keys. */
function toStorageKey(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (!/^https?:\/\//i.test(trimmed)) {
        const key = trimmed.replace(/^\//, '');
        return key === trimmed ? null : key; // already key → no change
    }
    try {
        return new URL(trimmed).pathname.replace(/^\//, '') || null;
    } catch {
        return null;
    }
}

function needsKeyMigration(value: unknown): boolean {
    return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

type Stats = { scanned: number; changed: number; fields: number };

function migrateStringField(
    doc: Document,
    field: string,
    patch: Document,
    stats: Stats,
): void {
    if (!needsKeyMigration(doc[field])) return;
    const key = toStorageKey(doc[field]);
    if (key === null || key === doc[field]) return;
    patch[field] = key;
    stats.fields++;
}

function migrateStringArray(
    doc: Document,
    field: string,
    patch: Document,
    stats: Stats,
): void {
    const arr = doc[field];
    if (!Array.isArray(arr) || arr.length === 0) return;
    if (!arr.some(needsKeyMigration)) return;
    const next = arr.map((v) => (needsKeyMigration(v) ? toStorageKey(v) || v : v));
    patch[field] = next;
    stats.fields++;
}

async function migrateCollection(
    db: Db,
    name: string,
    migrateDoc: (doc: Document) => Document | null,
    commit: boolean,
): Promise<Stats> {
    const stats: Stats = { scanned: 0, changed: 0, fields: 0 };
    const col = db.collection(name);
    const cursor = col.find({});

    while (await cursor.hasNext()) {
        const doc = await cursor.next();
        if (!doc) break;
        stats.scanned++;
        const patch = migrateDoc(doc);
        if (!patch || Object.keys(patch).length === 0) continue;
        stats.changed++;
        if (commit) {
            await col.updateOne({ _id: doc._id }, { $set: patch });
        } else if (stats.changed <= 5) {
            console.log(`  [dry-run] ${name} ${_idStr(doc)} →`, JSON.stringify(patch).slice(0, 200));
        }
    }

    return stats;
}

function _idStr(doc: Document): string {
    return doc._id?.toString?.() || '?';
}

function migrateProduct(doc: Document): Document | null {
    const patch: Document = {};
    const stats: Stats = { scanned: 0, changed: 0, fields: 0 };
    migrateStringArray(doc, 'images', patch, stats);
    migrateStringArray(doc, 'videos', patch, stats);

    if (doc.colorImages && typeof doc.colorImages === 'object') {
        const entries = Object.entries(doc.colorImages as Record<string, string[]>);
        let changed = false;
        const next: Record<string, string[]> = {};
        for (const [color, urls] of entries) {
            if (Array.isArray(urls) && urls.some(needsKeyMigration)) {
                next[color] = urls.map((u) => (needsKeyMigration(u) ? toStorageKey(u) || u : u));
                changed = true;
            } else {
                next[color] = urls;
            }
        }
        if (changed) {
            patch.colorImages = next;
            stats.fields++;
        }
    }

    if (Array.isArray(doc.variants)) {
        let changed = false;
        const variants = doc.variants.map((v: Document) => {
            if (!needsKeyMigration(v?.image)) return v;
            changed = true;
            return { ...v, image: toStorageKey(v.image) };
        });
        if (changed) {
            patch.variants = variants;
            stats.fields++;
        }
    }

    return Object.keys(patch).length ? patch : null;
}

function migrateStoreConfig(doc: Document): Document | null {
    const patch: Document = {};
    const stats: Stats = { scanned: 0, changed: 0, fields: 0 };
    migrateStringField(doc, 'logoUrl', patch, stats);
    migrateStringField(doc, 'faviconUrl', patch, stats);
    migrateStringArray(doc, 'heroBanners', patch, stats);

    if (Array.isArray(doc.categories)) {
        let changed = false;
        const categories = doc.categories.map((c: Document) => {
            if (!needsKeyMigration(c?.image)) return c;
            changed = true;
            return { ...c, image: toStorageKey(c.image) };
        });
        if (changed) {
            patch.categories = categories;
            stats.fields++;
        }
    }

    if (doc.aboutUs && typeof doc.aboutUs === 'object') {
        const about = { ...(doc.aboutUs as Document) };
        if (Array.isArray(about.images) && about.images.some(needsKeyMigration)) {
            about.images = about.images.map((u: string) =>
                needsKeyMigration(u) ? toStorageKey(u) || u : u,
            );
            patch.aboutUs = about;
            stats.fields++;
        }
    }

    return Object.keys(patch).length ? patch : null;
}

function migrateCartOrOrder(doc: Document): Document | null {
    if (!Array.isArray(doc.items)) return null;
    let changed = false;
    const items = doc.items.map((item: Document) => {
        if (!needsKeyMigration(item?.image)) return item;
        changed = true;
        return { ...item, image: toStorageKey(item.image) };
    });
    return changed ? { items } : null;
}

async function main() {
    loadEnv();
    const commit = process.argv.includes('--commit');
    const uri = resolveMongoUri();
    const dbName = uri.replace(/^.*\//, '').replace(/\?.*$/, '');

    console.log(`\nMedia key migration`);
    console.log(`  mode: ${commit ? 'COMMIT' : 'DRY-RUN (pass --commit to write)'}`);
    console.log(`  db:   ${dbName}\n`);

    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db();

    const jobs: Array<{ name: string; fn: (d: Document) => Document | null }> = [
        { name: 'products', fn: migrateProduct },
        { name: 'storeconfigs', fn: migrateStoreConfig },
        { name: 'carts', fn: migrateCartOrOrder },
        { name: 'orders', fn: migrateCartOrOrder },
    ];

    let totalChanged = 0;
    for (const job of jobs) {
        const stats = await migrateCollection(db, job.name, job.fn, commit);
        console.log(
            `  ${job.name}: scanned=${stats.scanned} documents_changed=${stats.changed}`,
        );
        totalChanged += stats.changed;
    }

    console.log(`\nDone. ${totalChanged} document(s) ${commit ? 'updated' : 'would change'}.\n`);
    await client.close();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
