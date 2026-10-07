import { getAllowedOrigins, getJwtSecret, isOriginAllowed } from './security-config';

describe('security-config', () => {
    const saved = { ...process.env };
    afterEach(() => {
        process.env = { ...saved };
    });

    describe('getJwtSecret', () => {
        it('refuses to start in production without a secret', () => {
            process.env.NODE_ENV = 'production';
            delete process.env.JWT_SECRET;
            expect(() => getJwtSecret()).toThrow(/JWT_SECRET/);
        });

        it('refuses the old public placeholder in production', () => {
            process.env.NODE_ENV = 'production';
            process.env.JWT_SECRET = 'your-super-secret-jwt-key-change-in-production';
            expect(() => getJwtSecret()).toThrow(/placeholder/);
        });

        it('uses the configured secret (short ones only warn, so prod keeps running)', () => {
            process.env.NODE_ENV = 'production';
            process.env.JWT_SECRET = 'short-but-real';
            expect(getJwtSecret()).toBe('short-but-real');
        });

        it('uses a random, non-default secret in development when unset', () => {
            process.env.NODE_ENV = 'development';
            delete process.env.JWT_SECRET;
            const s = getJwtSecret();
            expect(s).toHaveLength(64);
            expect(s).not.toContain('your-super-secret');
            expect(getJwtSecret()).toBe(s);
        });
    });

    describe('CORS origins', () => {
        it('allows the storefront and configured origins, blocks others', () => {
            process.env.NODE_ENV = 'production';
            process.env.FRONTEND_URL = 'https://www.priyancigold.com/';
            process.env.CORS_ORIGINS = 'https://admin.example.com, https://jewel-store-*.vercel.app';
            const allowed = getAllowedOrigins();
            expect(isOriginAllowed('https://www.priyancigold.com', allowed)).toBe(true);
            expect(isOriginAllowed('https://priyancigold.com', allowed)).toBe(true);
            expect(isOriginAllowed('https://admin.example.com', allowed)).toBe(true);
            expect(isOriginAllowed('https://jewel-store-abc123.vercel.app', allowed)).toBe(true);
            expect(isOriginAllowed('https://evil.com', allowed)).toBe(false);
            expect(isOriginAllowed('https://jewel-store-x.vercel.app.evil.com', allowed)).toBe(false);
            expect(isOriginAllowed('https://a.b.vercel.app', allowed)).toBe(false);
            expect(isOriginAllowed('http://localhost:3000', allowed)).toBe(false);
        });

        it('allows localhost outside production', () => {
            process.env.NODE_ENV = 'development';
            expect(isOriginAllowed('http://localhost:3000', getAllowedOrigins())).toBe(true);
        });
    });
});
