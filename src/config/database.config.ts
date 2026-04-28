function withDatabaseName(uri: string, dbName: string): string {
    const trimmed = uri.trim().replace(/^['"]|['"]$/g, '');
    const qIndex = trimmed.indexOf('?');
    const base = qIndex >= 0 ? trimmed.slice(0, qIndex) : trimmed;
    const query = qIndex >= 0 ? trimmed.slice(qIndex) : '';

    const schemeIdx = base.indexOf('://');
    if (schemeIdx < 0) return trimmed;

    const firstSlashAfterHost = base.indexOf('/', schemeIdx + 3);
    if (firstSlashAfterHost < 0) {
        return `${base}/${dbName}${query}`;
    }

    const authority = base.slice(0, firstSlashAfterHost);
    return `${authority}/${dbName}${query}`;
}

export function resolveMongoUri(): string {
    const nodeEnv = (process.env.NODE_ENV || 'development').toLowerCase();
    const suffix = nodeEnv === 'production' ? 'prod' : 'dev';
    const dbPrefix = process.env.MONGODB_DB_PREFIX || 'priyincigold';
    const dbName = `${dbPrefix}-${suffix}`;

    const baseUri = process.env.MONGODB_URI_BASE || process.env.MONGODB_URI || 'mongodb://localhost:27017';
    return withDatabaseName(baseUri, dbName);
}
