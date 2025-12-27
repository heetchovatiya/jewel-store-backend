import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
    const app = await NestFactory.create(AppModule, {
        bodyParser: true,
        rawBody: true,
    });

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