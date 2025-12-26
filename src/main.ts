import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);

    // Enable CORS for frontend (dev + production + Vercel previews)
    app.enableCors({
        origin: (origin, callback) => {
            const allowedOrigins = [
                'http://localhost:3000',
                'http://localhost:3001',
                'https://jewel-store-sand.vercel.app',
                'https://jewel-store-git-main-heets-projects-3796b335.vercel.app',
            ];
            // Allow requests with no origin (mobile apps, curl, etc)
            if (!origin) return callback(null, true);
            // Allow all Vercel preview URLs
            if (origin.endsWith('.vercel.app') || allowedOrigins.includes(origin)) {
                return callback(null, true);
            }
            callback(null, false);
        },
        credentials: true,
    });

    // Global validation pipe
    app.useGlobalPipes(new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
    }));

    const port = process.env.PORT || 3001;
    await app.listen(port);
    console.log(`🚀 Jewel-Core API running on http://localhost:${port}`);
}
bootstrap();
