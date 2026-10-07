import {
    BadRequestException,
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
    ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Order, OrderDocument, OrderStatus, PaymentMethod } from '../orders/order.schema';
import { BluedartApiError, BluedartClient } from './bluedart.client';
import { bluedartCapabilities } from './bluedart.config';
import { PincodeServiceability, TrackingResult, WaybillResult } from './bluedart.types';
import { CreateWaybillDto } from './dto/shipping.dto';

/** Orders in these states can be handed to Blue Dart. */
const SHIPPABLE = new Set<string>([OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PROCESSING, OrderStatus.SHIPPED]);

@Injectable()
export class ShippingService {
    private readonly logger = new Logger(ShippingService.name);
    private readonly pincodeCache = new Map<string, { value: PincodeServiceability; expiresAt: number }>();
    private readonly trackingCache = new Map<string, { value: TrackingResult; expiresAt: number }>();

    constructor(
        @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
        private readonly bluedart: BluedartClient,
    ) { }

    private get config() {
        return this.bluedart.config;
    }

    /** What is configured (shown on the admin orders page). */
    getStatus() {
        const caps = bluedartCapabilities(this.config);
        return { carrier: 'bluedart', mock: this.config.mock, ...caps };
    }

    // ================================================================ serviceability

    private unavailable(pincode: string, message: string): PincodeServiceability {
        // Blue Dart down / not configured: allow the order (decision: fail open, log a warning)
        return {
            pincode, checked: false, serviceable: true, prepaidAvailable: true, codAvailable: true,
            message, source: 'unavailable',
        };
    }

    private mockServiceability(pincode: string): PincodeServiceability {
        const list = (k: string) => (process.env[k] || '').split(',').map((p) => p.trim()).filter(Boolean);
        const blocked = list('BLUEDART_MOCK_UNSERVICEABLE').includes(pincode);
        const noCod = list('BLUEDART_MOCK_NO_COD').includes(pincode);
        const eta = new Date(Date.now() + 4 * 86_400_000).toISOString().slice(0, 10);
        return {
            pincode,
            checked: true,
            serviceable: !blocked,
            prepaidAvailable: !blocked,
            codAvailable: !blocked && !noCod,
            estimatedDeliveryDate: blocked ? undefined : eta,
            location: 'MOCK',
            message: blocked ? 'Delivery not available to this PIN code' : undefined,
            source: 'mock',
        };
    }

    async checkServiceability(pincode: string): Promise<PincodeServiceability> {
        const pin = (pincode || '').trim();
        if (!/^\d{6}$/.test(pin)) {
            throw new BadRequestException('Please enter a valid 6-digit PIN code');
        }
        if (this.config.mock) return this.mockServiceability(pin);
        if (!bluedartCapabilities(this.config).serviceability) {
            return this.unavailable(pin, 'Delivery check not configured');
        }

        const cached = this.pincodeCache.get(pin);
        if (cached && cached.expiresAt > Date.now()) {
            return { ...cached.value, source: 'cache' };
        }

        try {
            const result = await this.bluedart.getServicesForPincode(pin);
            if (result.serviceable) {
                try {
                    result.estimatedDeliveryDate = await this.bluedart.getExpectedDeliveryDate(pin, false);
                } catch (err: any) {
                    this.logger.debug(`Transit time lookup failed for ${pin}: ${err?.message}`);
                }
            }
            this.pincodeCache.set(pin, {
                value: result,
                expiresAt: Date.now() + this.config.serviceabilityCacheHours * 3_600_000,
            });
            if (this.pincodeCache.size > 5000) {
                const oldest = this.pincodeCache.keys().next().value;
                if (oldest) this.pincodeCache.delete(oldest);
            }
            return result;
        } catch (err: any) {
            this.logger.warn(`Blue Dart serviceability check failed for ${pin}; allowing order. ${err?.message || err}`);
            return this.unavailable(pin, 'Delivery check temporarily unavailable');
        }
    }

    /** Called before creating an order. Throws only when Blue Dart clearly says "no". */
    async assertDeliverable(pincode: string, paymentMode: 'prepaid' | 'cod'): Promise<PincodeServiceability> {
        const result = await this.checkServiceability(pincode);
        if (!result.checked) return result;
        if (!result.serviceable) {
            throw new BadRequestException(
                `Sorry, we can't deliver to PIN code ${result.pincode} yet. Please use a different address.`,
            );
        }
        if (paymentMode === 'cod' && !result.codAvailable) {
            throw new BadRequestException(
                `Cash on Delivery isn't available for PIN code ${result.pincode}. Please pay online.`,
            );
        }
        return result;
    }

    // ================================================================ waybill

    private async findOrder(tenantId: string, orderId: string, userId?: string, withLabel = false) {
        if (!Types.ObjectId.isValid(orderId)) throw new NotFoundException('Order not found');
        const filter: Record<string, unknown> = {
            _id: new Types.ObjectId(orderId),
            tenantId: new Types.ObjectId(tenantId),
        };
        if (userId) filter.userId = new Types.ObjectId(userId);
        const q = this.orderModel.findOne(filter);
        if (withLabel) q.select('+shipmentLabelPdf');
        const order = await q.exec();
        if (!order) throw new NotFoundException('Order not found');
        return order;
    }

    /** Today at noon IST, or the next day (skipping Sunday) when past the pickup cut-off. */
    private defaultPickupDate(): Date {
        const istOffsetMs = 330 * 60_000;
        const nowIst = new Date(Date.now() + istOffsetMs);
        const cutoff = Number(this.config.pickupTime.slice(0, 2)) * 60 + Number(this.config.pickupTime.slice(2, 4) || 0);
        const minutesNow = nowIst.getUTCHours() * 60 + nowIst.getUTCMinutes();
        const day = new Date(Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), nowIst.getUTCDate(), 12) - istOffsetMs);
        if (minutesNow >= cutoff) day.setUTCDate(day.getUTCDate() + 1);
        if (new Date(day.getTime() + istOffsetMs).getUTCDay() === 0) day.setUTCDate(day.getUTCDate() + 1);
        return day;
    }

    private mockWaybill(): WaybillResult {
        return {
            awbNo: `MOCK${Date.now().toString().slice(-9)}`,
            tokenNumber: 'MOCK-TOKEN',
            destinationArea: 'MCK',
            destinationLocation: 'MOCK',
        };
    }

    async createWaybill(tenantId: string, orderId: string, dto: CreateWaybillDto) {
        if (!bluedartCapabilities(this.config).waybill) {
            throw new ServiceUnavailableException(
                'Blue Dart shipping is not fully configured. Set the BLUEDART_* shipper settings in the backend .env.',
            );
        }

        const order = await this.findOrder(tenantId, orderId);
        if (!SHIPPABLE.has(order.status)) {
            throw new BadRequestException(`Orders with status "${order.status}" can't be shipped`);
        }
        if (order.shipment?.awbNo && order.shipment.status !== 'cancelled') {
            throw new ConflictException(`Waybill ${order.shipment.awbNo} already exists for this order`);
        }

        const isCod = order.paymentMethod === PaymentMethod.COD;
        const attempts = (order.shipment?.attempts || 0) + 1;
        const referenceNo = attempts > 1 ? `${order.orderNumber}-${attempts}` : order.orderNumber;
        const a = order.shippingAddress;
        const [address1, address2, address3] = BluedartClient.splitAddress(
            [a.addressLine1, a.addressLine2, a.city, a.state].filter(Boolean).join(', '),
            this.config.addressLineMax,
        );
        const pickupDate = dto.pickupDate ? new Date(`${dto.pickupDate}T12:00:00+05:30`) : this.defaultPickupDate();
        const weightKg = dto.weightKg ?? this.config.defaultWeightKg;
        const pieces = dto.pieces ?? 1;
        const registerPickup = dto.registerPickup ?? false;

        let result: WaybillResult;
        try {
            result = this.config.mock
                ? this.mockWaybill()
                : await this.bluedart.generateWaybill({
                    referenceNo,
                    invoiceNo: order.orderNumber,
                    isCod,
                    declaredValue: order.total,
                    collectableAmount: isCod ? order.total : 0,
                    weightKg,
                    pieces,
                    dimensionsCm: this.config.defaultDimensionsCm,
                    pickupDate,
                    registerPickup,
                    consignee: {
                        name: a.fullName,
                        address1,
                        address2,
                        address3,
                        pincode: a.pincode,
                        mobile: a.phone,
                    },
                });
        } catch (err: any) {
            this.logger.error(`Waybill failed for ${order.orderNumber}: ${err?.message}`);
            if (err instanceof BluedartApiError) throw new BadRequestException(err.message);
            throw err;
        }

        const shipment = {
            carrier: 'bluedart',
            awbNo: result.awbNo,
            status: 'created',
            tokenNumber: result.tokenNumber,
            destinationArea: result.destinationArea,
            destinationLocation: result.destinationLocation,
            productCode: this.config.productCode,
            subProductCode: isCod ? this.config.subProductCod : this.config.subProductPrepaid,
            referenceNo,
            weightKg,
            pieces,
            pickupDate,
            pickupRegistered: registerPickup,
            hasLabel: !!result.labelPdfBase64,
            createdAt: new Date(),
            attempts,
        };

        const update: Record<string, unknown> = { shipment };
        if (result.labelPdfBase64) update.shipmentLabelPdf = result.labelPdfBase64;
        // Waybill created = parcel is being prepared; admin still marks it "shipped" after pickup.
        if (order.status === OrderStatus.PENDING || order.status === OrderStatus.CONFIRMED) {
            update.status = OrderStatus.PROCESSING;
        }

        const updated = await this.orderModel
            .findByIdAndUpdate(order._id, { $set: update }, { new: true })
            .exec();
        return updated?.toObject();
    }

    async cancelWaybill(tenantId: string, orderId: string) {
        const order = await this.findOrder(tenantId, orderId);
        const s = order.shipment;
        if (!s?.awbNo || s.status === 'cancelled') {
            throw new BadRequestException('No active waybill on this order');
        }
        if (!this.config.mock) {
            try {
                await this.bluedart.cancelWaybill(s.awbNo);
            } catch (err: any) {
                if (err instanceof BluedartApiError) throw new BadRequestException(err.message);
                throw err;
            }
        }
        this.trackingCache.delete(s.awbNo);
        const updated = await this.orderModel
            .findByIdAndUpdate(
                order._id,
                { $set: { 'shipment.status': 'cancelled', 'shipment.cancelledAt': new Date() }, $unset: { shipmentLabelPdf: 1 } },
                { new: true },
            )
            .exec();
        return updated?.toObject();
    }

    async getLabel(tenantId: string, orderId: string): Promise<{ filename: string; pdf: Buffer }> {
        const order = await this.findOrder(tenantId, orderId, undefined, true);
        if (!order.shipmentLabelPdf || !order.shipment?.awbNo) {
            throw new NotFoundException('No shipping label stored for this order');
        }
        return { filename: `bluedart-${order.shipment.awbNo}.pdf`, pdf: Buffer.from(order.shipmentLabelPdf, 'base64') };
    }

    // ================================================================ tracking

    private mockTracking(awbNo: string): TrackingResult {
        const d = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
        return {
            awbNo,
            found: true,
            status: 'In Transit',
            statusType: 'IT',
            statusDate: d(0),
            expectedDeliveryDate: d(-2),
            origin: 'MOCK ORIGIN',
            destination: 'MOCK DEST',
            scans: [
                { scan: 'Shipment In Transit', scanType: 'UD', date: d(0), time: '09:10', location: 'HUB' },
                { scan: 'Shipment Picked Up', scanType: 'PU', date: d(1), time: '17:45', location: 'ORIGIN' },
            ],
            fetchedAt: new Date().toISOString(),
        };
    }

    /** Tracking for an order. Pass userId to restrict to the customer's own orders. */
    async getOrderTracking(tenantId: string, orderId: string, userId?: string) {
        const order = await this.findOrder(tenantId, orderId, userId);
        const s = order.shipment;
        if (!s?.awbNo || s.status === 'cancelled') {
            return { orderNumber: order.orderNumber, shipment: null, tracking: null };
        }

        const shipmentInfo = {
            carrier: s.carrier,
            awbNo: s.awbNo,
            trackingUrl: `https://www.bluedart.com/web/guest/trackdartresult?trackFor=0&trackNo=${encodeURIComponent(s.awbNo)}`,
        };

        if (!this.config.mock && !bluedartCapabilities(this.config).tracking) {
            return { orderNumber: order.orderNumber, shipment: shipmentInfo, tracking: null, message: 'Live tracking not configured' };
        }

        const cached = this.trackingCache.get(s.awbNo);
        let tracking: TrackingResult;
        if (cached && cached.expiresAt > Date.now()) {
            tracking = cached.value;
        } else {
            try {
                tracking = this.config.mock ? this.mockTracking(s.awbNo) : await this.bluedart.track(s.awbNo);
            } catch (err: any) {
                this.logger.warn(`Tracking failed for ${s.awbNo}: ${err?.message}`);
                return {
                    orderNumber: order.orderNumber,
                    shipment: shipmentInfo,
                    tracking: null,
                    message: 'Tracking is temporarily unavailable. Please try again later.',
                };
            }
            this.trackingCache.set(s.awbNo, {
                value: tracking,
                expiresAt: Date.now() + this.config.trackingCacheMinutes * 60_000,
            });
            if (this.trackingCache.size > 2000) {
                const oldest = this.trackingCache.keys().next().value;
                if (oldest) this.trackingCache.delete(oldest);
            }
            if (tracking.found) {
                await this.orderModel.updateOne(
                    { _id: order._id },
                    {
                        $set: {
                            'shipment.lastStatus': tracking.status,
                            'shipment.lastStatusType': tracking.statusType,
                            'shipment.expectedDeliveryDate': tracking.expectedDeliveryDate,
                            'shipment.lastTrackedAt': new Date(),
                        },
                    },
                ).exec();
            }
        }

        return { orderNumber: order.orderNumber, shipment: shipmentInfo, tracking };
    }
}
