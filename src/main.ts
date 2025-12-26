import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);

    // Enable CORS for frontend (dev + production)
    const allowedOrigins = [
        'http://localhost:3000',
        'http://localhost:3001',
        process.env.FRONTEND_URL, // Production Vercel URL
    ].filter(Boolean);

    app.enableCors({
        origin: allowedOrigins,
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
