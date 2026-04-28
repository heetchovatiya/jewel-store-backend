import { Body, Controller, Headers, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PaymentsService } from './payments.service';
import { InitiatePaymentDto, VerifyPaymentDto } from './dto/payment.dto';

@Controller('payments')
export class PaymentsController {
    constructor(private readonly paymentsService: PaymentsService) { }

    @Post('initiate')
    @UseGuards(JwtAuthGuard)
    initiatePayment(@Req() req: Request, @Body() dto: InitiatePaymentDto) {
        return this.paymentsService.initiatePayment(
            req.tenantId!,
            (req as any).user.userId,
            dto.shippingAddress,
        );
    }

    @Post('verify')
    @UseGuards(JwtAuthGuard)
    verifyPayment(@Req() req: Request, @Body() dto: VerifyPaymentDto) {
        return this.paymentsService.verifyCheckoutSignature(
            req.tenantId!,
            dto.razorpayOrderId,
            dto.razorpayPaymentId,
            dto.razorpaySignature,
        );
    }

    @Post('webhook')
    webhook(
        @Req() req: Request & { rawBody?: Buffer },
        @Headers('x-razorpay-signature') signature?: string,
    ) {
        return this.paymentsService.verifyWebhook(req.tenantId!, req.rawBody || Buffer.from(''), signature);
    }
}
