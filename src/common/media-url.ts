/**
 * Media storage: MongoDB holds object keys only.
 * Full CDN URLs are built at read time from CDN_BASE_URL / R2_PUBLIC_DOMAIN.
 */

export function getCdnBaseUrl(): string {
    const raw =
        process.env.CDN_BASE_URL ||
        process.env.R2_PUBLIC_DOMAIN ||
        process.env.S3_CUSTOM_DOMAIN ||
        '';
    return raw.replace(/\/$/, '');
}

/** Strip CDN / Spaces / R2 URL down to the object key. Idempotent for bare keys. */
export function toStorageKey(value: string | null | undefined): string {
    if (!value || typeof value !== 'string') return '';
    const trimmed = value.trim();
    if (!trimmed) return '';

    if (!/^https?:\/\//i.test(trimmed)) {
        return trimmed.replace(/^\//, '');
    }

    try {
        const url = new URL(trimmed);
        return url.pathname.replace(/^\//, '');
    } catch {
        return trimmed.replace(/^\//, '');
    }
}

/** Build public CDN URL from a key (or pass-through if already a full URL after key extract). */
export function getPublicUrl(keyOrUrl: string | null | undefined): string {
    if (!keyOrUrl || typeof keyOrUrl !== 'string') return '';
    const key = toStorageKey(keyOrUrl);
    if (!key) return '';

    const base = getCdnBaseUrl();
    if (!base) return key;
    return `${base}/${key}`;
}

export function mapKeys(arr?: string[] | null): string[] {
    if (!Array.isArray(arr)) return [];
    return arr.map(toStorageKey).filter(Boolean);
}

export function mapPublicUrls(arr?: string[] | null): string[] {
    if (!Array.isArray(arr)) return [];
    return arr.map(getPublicUrl).filter(Boolean);
}

function mapColorImagesToKeys(
    colorImages?: Record<string, string[]> | Map<string, string[]> | null,
): Record<string, string[]> | undefined {
    if (!colorImages) return colorImages as undefined;
    const entries =
        colorImages instanceof Map
            ? Array.from(colorImages.entries())
            : Object.entries(colorImages);
    const out: Record<string, string[]> = {};
    for (const [color, urls] of entries) {
        out[color] = mapKeys(urls);
    }
    return out;
}

function mapColorImagesToPublic(
    colorImages?: Record<string, string[]> | Map<string, string[]> | null,
): Record<string, string[]> | undefined {
    if (!colorImages) return colorImages as undefined;
    const entries =
        colorImages instanceof Map
            ? Array.from(colorImages.entries())
            : Object.entries(colorImages);
    const out: Record<string, string[]> = {};
    for (const [color, urls] of entries) {
        out[color] = mapPublicUrls(urls);
    }
    return out;
}

/** Normalize product media fields to storage keys before Mongo write. */
export function normalizeProductMedia<T extends Record<string, unknown>>(data: T): T {
    const out = { ...data } as Record<string, unknown>;
    if (out.images !== undefined) out.images = mapKeys(out.images as string[]);
    if (out.videos !== undefined) out.videos = mapKeys(out.videos as string[]);
    if (out.colorImages !== undefined) {
        out.colorImages = mapColorImagesToKeys(
            out.colorImages as Record<string, string[]>,
        );
    }
    if (Array.isArray(out.variants)) {
        out.variants = (out.variants as Array<Record<string, unknown>>).map((v) => ({
            ...v,
            image: v.image ? toStorageKey(v.image as string) : v.image,
        }));
    }
    return out as T;
}

/** Expand product media keys to public CDN URLs for API responses. */
export function expandProductMedia<T extends Record<string, unknown>>(product: T): T {
    if (!product) return product;
    const out = { ...product } as Record<string, unknown>;
    if (out.images !== undefined) out.images = mapPublicUrls(out.images as string[]);
    if (out.videos !== undefined) out.videos = mapPublicUrls(out.videos as string[]);
    if (out.colorImages !== undefined) {
        out.colorImages = mapColorImagesToPublic(
            out.colorImages as Record<string, string[]>,
        );
    }
    if (Array.isArray(out.variants)) {
        out.variants = (out.variants as Array<Record<string, unknown>>).map((v) => ({
            ...v,
            image: v.image ? getPublicUrl(v.image as string) : v.image,
        }));
    }
    return out as T;
}

export function normalizeStoreConfigMedia<T extends Record<string, unknown>>(data: T): T {
    const out = { ...data } as Record<string, unknown>;
    if (out.logoUrl !== undefined) out.logoUrl = toStorageKey(out.logoUrl as string);
    if (out.faviconUrl !== undefined) out.faviconUrl = toStorageKey(out.faviconUrl as string);
    if (Array.isArray(out.heroBanners)) {
        out.heroBanners = (out.heroBanners as string[]).map(toStorageKey).filter(Boolean);
    }
    if (Array.isArray(out.categories)) {
        out.categories = (out.categories as Array<Record<string, unknown>>).map((c) => ({
            ...c,
            image: c.image ? toStorageKey(c.image as string) : c.image,
        }));
    }
    if (out.aboutUs && typeof out.aboutUs === 'object') {
        const about = { ...(out.aboutUs as Record<string, unknown>) };
        if (Array.isArray(about.images)) {
            about.images = mapKeys(about.images as string[]);
        }
        out.aboutUs = about;
    }
    return out as T;
}

export function expandStoreConfigMedia<T extends Record<string, unknown>>(config: T): T {
    if (!config) return config;
    const out = { ...config } as Record<string, unknown>;
    if (out.logoUrl) out.logoUrl = getPublicUrl(out.logoUrl as string);
    if (out.faviconUrl) out.faviconUrl = getPublicUrl(out.faviconUrl as string);
    if (Array.isArray(out.heroBanners)) {
        out.heroBanners = mapPublicUrls(out.heroBanners as string[]);
    }
    if (Array.isArray(out.categories)) {
        out.categories = (out.categories as Array<Record<string, unknown>>).map((c) => ({
            ...c,
            image: c.image ? getPublicUrl(c.image as string) : c.image,
        }));
    }
    if (out.aboutUs && typeof out.aboutUs === 'object') {
        const about = { ...(out.aboutUs as Record<string, unknown>) };
        if (Array.isArray(about.images)) {
            about.images = mapPublicUrls(about.images as string[]);
        }
        out.aboutUs = about;
    }
    return out as T;
}

export function expandOrderMedia<T extends Record<string, unknown>>(order: T): T {
    if (!order) return order;
    const out = { ...order } as Record<string, unknown>;
    if (Array.isArray(out.items)) {
        out.items = (out.items as Array<Record<string, unknown>>).map((item) => ({
            ...item,
            image: item.image ? getPublicUrl(item.image as string) : item.image,
        }));
    }
    return out as T;
}
