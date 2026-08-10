import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
    const app = await NestFactory.create(AppModule, {
        bodyParser: true,
        rawBody: true,
    });

    // ConfigModule.forRoot loads .env into process.env during AppModule init.
    // getPublicUrl() reads these at request time — if missing, APIs silently
    // return bare object keys and images 404 on the frontend.
    const cdnBase =
        (process.env.CDN_BASE_URL || process.env.R2_PUBLIC_DOMAIN || '').replace(/\/$/, '');
    if (!cdnBase) {
        const msg =
            'CDN_BASE_URL or R2_PUBLIC_DOMAIN must be set (e.g. https://cdn.priyancigold.com). ' +
            'Without it, product/config image fields are returned as bare storage keys.';
        if ((process.env.NODE_ENV || '').toLowerCase() === 'production') {
            throw new Error(`[CDN] ${msg}`);
        }
        Logger.warn(`[CDN] ${msg}`);
    } else {
        Logger.log(`[CDN] Public media base URL: ${cdnBase}`);
    }

    app.use(
        helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    scriptSrc: ["'self'"],
                    imgSrc: ["'self'", 'data:', 'https:'],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    connectSrc: ["'self'", 'https:'],
                },
            },
            hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
            crossOriginOpenerPolicy: false,
            frameguard: { action: 'deny' },
            // API is cross-origin from www; avoid COEP breaking browser fetches
            crossOriginResourcePolicy: { policy: 'cross-origin' },
        }),
    );

    // Increase body size limit to 50MB for file uploads
    app.use((req, res, next) => {
        if (req.headers['content-type']?.includes('multipart/form-data')) {
            // For multipart/form-data, the limit is handled by multer in upload controller
            next();
        } else {
            next();
        }
    });

    // Allow ALL origins (for debugging)
    app.enableCors({
        origin: true,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'x-tenant-id'],
    });

    app.useGlobalPipes(new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
    }));

    const port = process.env.PORT || 3001;
    await app.listen(port);
    console.log(`🚀 Jewel-Core API running on port ${port}`);
}
bootstrap();
