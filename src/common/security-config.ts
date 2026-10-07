import { Logger } from '@nestjs/common';

const logger = new Logger('Security');

/** Old hard-coded fallback: anyone reading the source could forge logins with it. */
const KNOWN_INSECURE_SECRETS = new Set([
    'your-super-secret-jwt-key-change-in-production',
    'your-super-secret-jwt-key-minimum-32-characters-long',
]);

const isProduction = () => (process.env.NODE_ENV || '').toLowerCase() === 'production';

let cachedDevSecret: string | null = null;

/**
 * JWT signing secret. Never falls back to a public default.
 * - Production: refuses to start if missing or a known placeholder; warns if short.
 * - Development: uses a random per-process secret when unset (logins reset on restart).
 */
export function getJwtSecret(): string {
    const secret = (process.env.JWT_SECRET || '').trim();

    if (!secret || KNOWN_INSECURE_SECRETS.has(secret)) {
        if (isProduction()) {
            throw new Error(
                '[Security] JWT_SECRET is missing or is a placeholder. Set a random value of 32+ characters ' +
                '(e.g. `openssl rand -hex 32`) in the backend .env before starting.',
            );
        }
        if (!cachedDevSecret) {
            cachedDevSecret = require('crypto').randomBytes(32).toString('hex');
            logger.warn('JWT_SECRET not set: using a random development secret (logins reset on restart).');
        }
        return cachedDevSecret!;
    }

    if (secret.length < 32) {
        logger.warn(
            `JWT_SECRET is only ${secret.length} characters. Use 32+ random characters ` +
            '(changing it logs everyone out once).',
        );
    }
    return secret;
}

/** Turn a pattern like https://*.vercel.app into a safe RegExp. */
function patternToRegExp(pattern: string): RegExp {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[a-z0-9-]+');
    return new RegExp(`^${escaped}$`, 'i');
}

/**
 * Browser origins allowed to call the API.
 * From FRONTEND_URL + CORS_ORIGINS (comma-separated, `*` wildcard allowed for one
 * sub-domain label, e.g. https://jewel-store-*.vercel.app). Always includes the
 * live storefront; localhost is added outside production.
 */
export function getAllowedOrigins(): (string | RegExp)[] {
    const fromEnv = [process.env.FRONTEND_URL, ...(process.env.CORS_ORIGINS || '').split(',')]
        .map((o) => (o || '').trim().replace(/\/$/, ''))
        .filter(Boolean);

    const defaults = ['https://www.priyancigold.com', 'https://priyancigold.com'];
    const dev = isProduction() ? [] : ['http://localhost:3000', 'http://127.0.0.1:3000'];

    const unique = Array.from(new Set([...defaults, ...fromEnv, ...dev]));
    return unique.map((o) => (o.includes('*') ? patternToRegExp(o) : o));
}

export function isOriginAllowed(origin: string, allowed: (string | RegExp)[]): boolean {
    const o = origin.replace(/\/$/, '');
    return allowed.some((a) => (typeof a === 'string' ? a.toLowerCase() === o.toLowerCase() : a.test(o)));
}
