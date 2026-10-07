import { Injectable, Logger } from '@nestjs/common';
import { BluedartConfig, loadBluedartConfig } from './bluedart.config';
import { PincodeServiceability, TrackingResult, TrackingScan, WaybillInput, WaybillResult } from './bluedart.types';

/** Raised for problems talking to Blue Dart (network, auth, unexpected response). */
export class BluedartApiError extends Error {
    constructor(message: string, readonly httpStatus?: number, readonly body?: unknown) {
        super(message);
        this.name = 'BluedartApiError';
    }
}

/**
 * Low-level Blue Dart API Gateway client.
 * Docs: https://developer.dhl.com (Blue Dart APIs: Authenticator, Location Finder,
 * Transit Time, Waybill, Tracking of Shipment).
 */
@Injectable()
export class BluedartClient {
    private readonly logger = new Logger(BluedartClient.name);
    readonly config: BluedartConfig = loadBluedartConfig();
    private token: { value: string; expiresAt: number } | null = null;
    private tokenPromise: Promise<string> | null = null;

    // ---------------------------------------------------------------- auth

    private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
        try {
            return await fetch(url, { ...init, signal: controller.signal });
        } catch (err: any) {
            const reason = err?.name === 'AbortError' ? 'timed out' : err?.message || 'network error';
            throw new BluedartApiError(`Blue Dart request ${reason}`);
        } finally {
            clearTimeout(timer);
        }
    }

    private static jwtExpiry(jwt: string): number | null {
        try {
            const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
            return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
        } catch {
            return null;
        }
    }

    private async getToken(forceRefresh = false): Promise<string> {
        if (!forceRefresh && this.token && this.token.expiresAt - 60_000 > Date.now()) {
            return this.token.value;
        }
        if (this.tokenPromise) return this.tokenPromise;

        this.tokenPromise = (async () => {
            const url = `${this.config.baseUrl}${this.config.paths.token}`;
            const headers = { ClientID: this.config.clientId, clientSecret: this.config.clientSecret, Accept: 'application/json' };
            let res = await this.fetchWithTimeout(url, { method: 'GET', headers });
            if (res.status === 405) {
                res = await this.fetchWithTimeout(url, { method: 'POST', headers });
            }
            const body: any = await res.json().catch(() => null);
            const jwt: string | undefined = body?.JWTToken || body?.jwtToken || body?.token;
            if (!res.ok || !jwt) {
                throw new BluedartApiError(`Blue Dart login failed (HTTP ${res.status})`, res.status, body);
            }
            // Use the token's own expiry when present; otherwise refresh every 20 minutes.
            const expiresAt = BluedartClient.jwtExpiry(jwt) ?? Date.now() + 20 * 60_000;
            this.token = { value: jwt, expiresAt };
            return jwt;
        })();

        try {
            return await this.tokenPromise;
        } finally {
            this.tokenPromise = null;
        }
    }

    /** Authenticated call; refreshes the JWT once on 401. */
    private async call(path: string, init: { method: 'GET' | 'POST'; body?: unknown; query?: Record<string, string> }) {
        const qs = init.query ? `?${new URLSearchParams(init.query).toString()}` : '';
        const url = `${this.config.baseUrl}${path}${qs}`;

        const send = async (jwt: string) =>
            this.fetchWithTimeout(url, {
                method: init.method,
                headers: {
                    JWTToken: jwt,
                    'Content-Type': 'application/json',
                    Accept: 'application/json, text/xml, application/xml',
                },
                body: init.body ? JSON.stringify(init.body) : undefined,
            });

        let res = await send(await this.getToken());
        if (res.status === 401) {
            res = await send(await this.getToken(true));
        }
        const text = await res.text();
        let json: unknown = null;
        try {
            json = text ? JSON.parse(text) : null;
        } catch {
            /* XML or plain text */
        }
        return { status: res.status, ok: res.ok, text, json };
    }

    private profile(licenceKey: string) {
        return { Api_type: 'S', LicenceKey: licenceKey, LoginID: this.config.loginId };
    }

    /** Pull human-readable error text out of Blue Dart's various error shapes. */
    static errorText(body: any): string {
        if (!body) return '';
        const parts: string[] = [];
        const visit = (node: any) => {
            if (!node || typeof node !== 'object') return;
            if (Array.isArray(node)) return node.forEach(visit);
            for (const key of ['ErrorMessage', 'StatusInformation', 'Message', 'message', 'error_description']) {
                if (typeof node[key] === 'string' && node[key].trim()) parts.push(node[key].trim());
            }
            for (const v of Object.values(node)) if (typeof v === 'object') visit(v);
        };
        visit(body);
        return Array.from(new Set(parts)).join('; ');
    }

    static toBdDate(d: Date): string {
        return `/Date(${d.getTime()})/`;
    }

    /** Accepts "/Date(1700000000000)/", "2026-10-09", "09-Oct-2026" etc. Returns yyyy-mm-dd. */
    static parseBdDate(value: unknown): string | undefined {
        if (!value) return undefined;
        const s = String(value);
        const ms = /\/Date\((\d+)/.exec(s);
        const d = ms ? new Date(Number(ms[1])) : new Date(s);
        return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
    }

    // ---------------------------------------------------------------- location finder

    async getServicesForPincode(pincode: string): Promise<PincodeServiceability> {
        const { status, ok, json } = await this.call(this.config.paths.pincodeServices, {
            method: 'POST',
            body: { pinCode: pincode, profile: this.profile(this.config.shippingLicenceKey) },
        });
        const body: any = json;
        const r = body?.GetServicesforPincodeResult ?? body;

        if (!ok || !r || typeof r !== 'object') {
            throw new BluedartApiError(
                `Pincode lookup failed (HTTP ${status}) ${BluedartClient.errorText(body)}`.trim(),
                status,
                body,
            );
        }

        const msg = BluedartClient.errorText(r);
        if (r.IsError === true || r.IsError === 'true') {
            // Credential / profile problems must not block customers: report as "not checked".
            if (/licen|login|auth|token|profile|access|api ?key/i.test(msg)) {
                throw new BluedartApiError(`Blue Dart rejected credentials: ${msg}`, status, body);
            }
            return {
                pincode, checked: true, serviceable: false, prepaidAvailable: false, codAvailable: false,
                message: msg || 'Delivery not available to this PIN code', source: 'bluedart',
            };
        }

        const yes = (v: unknown) => typeof v === 'string' && v.trim().toLowerCase() === 'yes';
        const prepaidFields = ['eTailPrePaidAirInbound', 'eTailPrePaidGroundInbound', 'ApexInbound', 'SurfaceInbound', 'DomesticPriorityInbound'];
        const codFields = ['eTailCODAirInbound', 'eTailCODGroundInbound'];
        const known = [...prepaidFields, ...codFields].some((f) => f in r);
        if (!known) {
            // Response shape we don't recognise: never block orders because of it.
            this.logger.warn(`Unrecognised GetServicesforPincode response keys: ${Object.keys(r).join(', ')}`);
            throw new BluedartApiError('Unrecognised pincode response from Blue Dart', status, body);
        }

        const embargo = yes(r.Embargo) || yes(r.IsEmbargo);
        const codAvailable = !embargo && codFields.some((f) => yes(r[f]));
        const prepaidAvailable = !embargo && (prepaidFields.some((f) => yes(r[f])) || codAvailable);

        return {
            pincode,
            checked: true,
            serviceable: prepaidAvailable,
            prepaidAvailable,
            codAvailable,
            areaCode: r.AreaCode || undefined,
            location: r.PincodeDescription || undefined,
            message: embargo ? 'Deliveries to this PIN code are temporarily paused' : undefined,
            source: 'bluedart',
        };
    }

    // ---------------------------------------------------------------- transit time

    async getExpectedDeliveryDate(toPincode: string, isCod: boolean): Promise<string | undefined> {
        if (!this.config.shipper.pincode) return undefined;
        const { ok, json } = await this.call(this.config.paths.transitTime, {
            method: 'POST',
            body: {
                pPinCodeFrom: this.config.shipper.pincode,
                pPinCodeTo: toPincode,
                pProductCode: this.config.productCode,
                pSubProductCode: isCod ? this.config.subProductCod : this.config.subProductPrepaid,
                pPudate: BluedartClient.toBdDate(new Date()),
                pPickupTime: `${this.config.pickupTime.slice(0, 2)}:${this.config.pickupTime.slice(2, 4) || '00'}`,
                profile: this.profile(this.config.shippingLicenceKey),
            },
        });
        const r: any = (json as any)?.GetDomesticTransitTimeForPinCodeandProductResult ?? json;
        if (!ok || !r || r.IsError === true) return undefined;
        return BluedartClient.parseBdDate(r.ExpectedDateDelivery ?? r.ExpectedDeliveryDate);
    }

    // ---------------------------------------------------------------- waybill

    /** Split free text into up to 3 lines of `max` chars (Blue Dart address field limit). */
    static splitAddress(text: string, max: number, lines = 3): string[] {
        const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
        const out: string[] = [''];
        for (const word of words) {
            const cur = out[out.length - 1];
            const candidate = cur ? `${cur} ${word}` : word;
            if (candidate.length <= max) {
                out[out.length - 1] = candidate;
            } else if (out.length < lines) {
                out.push(word.slice(0, max));
            } else {
                out[out.length - 1] = candidate.slice(0, max);
                break;
            }
        }
        while (out.length < lines) out.push('');
        return out;
    }

    async generateWaybill(input: WaybillInput): Promise<WaybillResult> {
        const c = this.config;
        const max = c.addressLineMax;
        const mobile = (v: string) => (v || '').replace(/\D/g, '').slice(-10);
        const cut = (v: string | undefined, n = max) => (v || '').slice(0, n);

        const body = {
            Request: {
                Consignee: {
                    ConsigneeName: cut(input.consignee.name),
                    ConsigneeAddress1: cut(input.consignee.address1),
                    ConsigneeAddress2: cut(input.consignee.address2),
                    ConsigneeAddress3: cut(input.consignee.address3),
                    ConsigneeAddressType: 'R',
                    ConsigneeAttention: cut(input.consignee.name),
                    ConsigneeEmailID: input.consignee.email || '',
                    ConsigneeGSTNumber: '',
                    ConsigneeLatitude: '',
                    ConsigneeLongitude: '',
                    ConsigneeMaskedContactNumber: '',
                    ConsigneeMobile: mobile(input.consignee.mobile),
                    ConsigneePincode: input.consignee.pincode,
                    ConsigneeTelephone: '',
                },
                Shipper: {
                    CustomerAddress1: cut(c.shipper.address1),
                    CustomerAddress2: cut(c.shipper.address2),
                    CustomerAddress3: cut(c.shipper.address3),
                    CustomerCode: c.customerCode,
                    CustomerEmailID: c.shipper.email,
                    CustomerGSTNumber: c.shipper.gstin,
                    CustomerLatitude: '',
                    CustomerLongitude: '',
                    CustomerMaskedContactNumber: '',
                    CustomerMobile: mobile(c.shipper.mobile),
                    CustomerName: cut(c.shipper.name),
                    CustomerPincode: c.shipper.pincode,
                    CustomerTelephone: '',
                    IsToPayCustomer: false,
                    OriginArea: c.originArea,
                    Sender: cut(c.shipper.name),
                    VendorCode: '',
                },
                Services: {
                    AWBNo: '',
                    ActualWeight: input.weightKg.toFixed(2),
                    CollectableAmount: input.isCod ? Math.round(input.collectableAmount) : 0,
                    Commodity: { CommodityDetail1: cut(c.commodityDescription), CommodityDetail2: '', CommodityDetail3: '' },
                    CreditReferenceNo: input.referenceNo,
                    DeclaredValue: Math.round(input.declaredValue),
                    Dimensions: [{
                        Length: input.dimensionsCm.length,
                        Breadth: input.dimensionsCm.breadth,
                        Height: input.dimensionsCm.height,
                        Count: input.pieces,
                    }],
                    InvoiceNo: input.invoiceNo,
                    PDFOutputNotRequired: false,
                    PackType: '',
                    PickupDate: BluedartClient.toBdDate(input.pickupDate),
                    PickupTime: c.pickupTime,
                    PieceCount: String(input.pieces),
                    ProductCode: c.productCode,
                    ProductType: c.productType,
                    RegisterPickup: input.registerPickup,
                    SpecialInstruction: '',
                    SubProductCode: input.isCod ? c.subProductCod : c.subProductPrepaid,
                    itemdtl: [],
                    noOfDCGiven: 0,
                },
                Returnadds: {
                    ManifestNumber: '',
                    ReturnAddress1: cut(c.returnAddress.address1),
                    ReturnAddress2: cut(c.returnAddress.address2),
                    ReturnAddress3: cut(c.returnAddress.address3),
                    ReturnContact: cut(c.returnAddress.name),
                    ReturnEmailID: c.returnAddress.email,
                    ReturnLatitude: '',
                    ReturnLongitude: '',
                    ReturnMaskedContactNumber: '',
                    ReturnMobile: mobile(c.returnAddress.mobile),
                    ReturnPincode: c.returnAddress.pincode,
                    ReturnTelephone: '',
                },
            },
            Profile: this.profile(c.shippingLicenceKey),
        };

        const { status, ok, json } = await this.call(c.paths.generateWaybill, { method: 'POST', body });
        const r: any = (json as any)?.GenerateWayBillResult ?? json;
        const awb: string | undefined = r?.AWBNo ? String(r.AWBNo).trim() : undefined;

        if (!ok || !r || r.IsError === true || !awb) {
            const msg = BluedartClient.errorText(json) || `HTTP ${status}`;
            throw new BluedartApiError(`Blue Dart waybill failed: ${msg}`, status, json);
        }

        let labelPdfBase64: string | undefined;
        const content = r.AWBPrintContent;
        if (Array.isArray(content) && content.length) labelPdfBase64 = Buffer.from(content).toString('base64');
        else if (typeof content === 'string' && content.length > 100) labelPdfBase64 = content;

        return {
            awbNo: awb,
            tokenNumber: r.TokenNumber || undefined,
            destinationArea: r.DestinationArea || undefined,
            destinationLocation: r.DestinationLocation || undefined,
            labelPdfBase64,
        };
    }

    async cancelWaybill(awbNo: string): Promise<void> {
        const { status, ok, json } = await this.call(this.config.paths.cancelWaybill, {
            method: 'POST',
            body: { Request: { AWBNo: awbNo }, Profile: this.profile(this.config.shippingLicenceKey) },
        });
        const r: any = (json as any)?.CancelWaybillResult ?? json;
        if (!ok || r?.IsError === true) {
            const msg = BluedartClient.errorText(json) || `HTTP ${status}`;
            throw new BluedartApiError(`Blue Dart cancel failed: ${msg}`, status, json);
        }
    }

    // ---------------------------------------------------------------- tracking

    private static xmlDecode(s: string): string {
        return s
            .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
            .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim();
    }

    private static tag(xml: string, name: string): string | undefined {
        const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(xml);
        const v = m ? BluedartClient.xmlDecode(m[1]) : '';
        return v || undefined;
    }

    /** Parse Blue Dart's custawbquery XML (ShipmentData > Shipment > Scans > ScanDetail). */
    static parseTrackingXml(xml: string, awbNo: string): TrackingResult {
        const shipmentXml = /<Shipment[\s>][\s\S]*?<\/Shipment>/i.exec(xml)?.[0] ?? '';
        const header = shipmentXml.replace(/<Scans>[\s\S]*<\/Scans>/i, '');
        const scans: TrackingScan[] = [];
        const scanRe = /<ScanDetail>([\s\S]*?)<\/ScanDetail>/gi;
        let m: RegExpExecArray | null;
        while ((m = scanRe.exec(shipmentXml))) {
            const s = m[1];
            scans.push({
                scan: BluedartClient.tag(s, 'Scan') || '',
                scanCode: BluedartClient.tag(s, 'ScanCode'),
                scanType: BluedartClient.tag(s, 'ScanType'),
                date: BluedartClient.tag(s, 'ScanDate'),
                time: BluedartClient.tag(s, 'ScanTime'),
                location: BluedartClient.tag(s, 'ScannedLocation'),
            });
        }
        const statusType = BluedartClient.tag(header, 'StatusType');
        const status = BluedartClient.tag(header, 'Status');
        const found = !!shipmentXml && statusType !== 'NF' && !/incorrect waybill|no information/i.test(status || '');

        return {
            awbNo,
            found,
            status,
            statusType,
            statusDate: BluedartClient.tag(header, 'StatusDate'),
            statusTime: BluedartClient.tag(header, 'StatusTime'),
            expectedDeliveryDate: BluedartClient.tag(header, 'ExpectedDeliveryDate'),
            origin: BluedartClient.tag(header, 'Origin'),
            destination: BluedartClient.tag(header, 'Destination'),
            receivedBy: BluedartClient.tag(header, 'ReceivedBy'),
            scans,
            fetchedAt: new Date().toISOString(),
        };
    }

    async track(awbNo: string): Promise<TrackingResult> {
        const query = {
            handler: 'tnt',
            action: 'custawbquery',
            loginid: this.config.loginId,
            awb: 'awb',
            numbers: awbNo,
            format: 'xml',
            lickey: this.config.trackingLicenceKey,
            verno: this.config.apiVersion,
            scan: '1',
        };

        let status: number;
        let ok: boolean;
        let text: string;
        if (this.config.trackingMode === 'legacy') {
            // Classic servlet: login ID + licence key + version, no JWT.
            const res = await this.fetchWithTimeout(
                `${this.config.legacyTrackingUrl}?${new URLSearchParams(query).toString()}`,
                { method: 'GET', headers: { Accept: 'text/xml, application/xml' } },
            );
            status = res.status;
            ok = res.ok;
            text = await res.text();
        } else {
            ({ status, ok, text } = await this.call(this.config.paths.tracking, { method: 'GET', query }));
        }
        if (!ok || !text.includes('<')) {
            throw new BluedartApiError(`Blue Dart tracking failed (HTTP ${status})`, status, text.slice(0, 500));
        }
        return BluedartClient.parseTrackingXml(text, awbNo);
    }
}
