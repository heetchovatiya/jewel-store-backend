/**
 * Blue Dart settings, read from environment variables (see .env.example).
 * Secrets never go to the frontend.
 */
export interface BluedartShipperConfig {
    name: string;
    address1: string;
    address2: string;
    address3: string;
    pincode: string;
    mobile: string;
    email: string;
    gstin: string;
}

export interface BluedartConfig {
    /** Real API calls are made only when enabled AND credentials are present. */
    enabled: boolean;
    /** Fake responses for local testing (no network calls). */
    mock: boolean;
    baseUrl: string;
    clientId: string;
    clientSecret: string;
    loginId: string;
    /** Licence key for shipping APIs (location finder, transit time, waybill). */
    shippingLicenceKey: string;
    /** Licence key for the tracking API (falls back to the shipping key). */
    trackingLicenceKey: string;
    /** Blue Dart API version number they issued with the licence key (tracking `verno`). */
    apiVersion: string;
    /**
     * 'gateway' = new API gateway (needs Client ID/secret + JWT).
     * 'legacy'  = classic api.bluedart.com tracking servlet (login ID + licence key + version only).
     */
    trackingMode: 'gateway' | 'legacy';
    legacyTrackingUrl: string;
    customerCode: string;
    originArea: string;
    productCode: string;
    /** 1 = non-document (dutiable) parcel, 0 = documents. */
    productType: number;
    subProductPrepaid: string;
    subProductCod: string;
    pickupTime: string;
    defaultWeightKg: number;
    defaultDimensionsCm: { length: number; breadth: number; height: number };
    commodityDescription: string;
    addressLineMax: number;
    shipper: BluedartShipperConfig;
    returnAddress: BluedartShipperConfig;
    paths: {
        token: string;
        pincodeServices: string;
        transitTime: string;
        generateWaybill: string;
        cancelWaybill: string;
        tracking: string;
    };
    serviceabilityCacheHours: number;
    trackingCacheMinutes: number;
    timeoutMs: number;
}

const env = (key: string, fallback = ''): string => (process.env[key] ?? fallback).toString().trim();
const bool = (key: string, fallback = false): boolean => {
    const v = env(key);
    if (!v) return fallback;
    return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
};
const num = (key: string, fallback: number): number => {
    const n = Number(env(key));
    return Number.isFinite(n) && n > 0 ? n : fallback;
};

function parseDims(value: string): { length: number; breadth: number; height: number } {
    const [l, b, h] = value.split(/[x×*]/i).map((p) => Number(p.trim()));
    return {
        length: Number.isFinite(l) && l > 0 ? l : 15,
        breadth: Number.isFinite(b) && b > 0 ? b : 10,
        height: Number.isFinite(h) && h > 0 ? h : 5,
    };
}

export function loadBluedartConfig(): BluedartConfig {
    const shipper: BluedartShipperConfig = {
        name: env('BLUEDART_SHIPPER_NAME'),
        address1: env('BLUEDART_SHIPPER_ADDRESS1'),
        address2: env('BLUEDART_SHIPPER_ADDRESS2'),
        address3: env('BLUEDART_SHIPPER_ADDRESS3'),
        pincode: env('BLUEDART_SHIPPER_PINCODE'),
        mobile: env('BLUEDART_SHIPPER_MOBILE'),
        email: env('BLUEDART_SHIPPER_EMAIL'),
        gstin: env('BLUEDART_SHIPPER_GSTIN'),
    };

    return {
        enabled: bool('BLUEDART_ENABLED', true),
        mock: bool('BLUEDART_MOCK', false),
        baseUrl: env('BLUEDART_BASE_URL', 'https://apigateway.bluedart.com/in/transportation').replace(/\/$/, ''),
        clientId: env('BLUEDART_CLIENT_ID'),
        clientSecret: env('BLUEDART_CLIENT_SECRET'),
        loginId: env('BLUEDART_LOGIN_ID'),
        shippingLicenceKey: env('BLUEDART_SHIPPING_LICENCE_KEY'),
        trackingLicenceKey: env('BLUEDART_TRACKING_LICENCE_KEY') || env('BLUEDART_SHIPPING_LICENCE_KEY'),
        apiVersion: env('BLUEDART_API_VERSION', '1.3'),
        trackingMode: (() => {
            const m = env('BLUEDART_TRACKING_MODE').toLowerCase();
            if (m === 'legacy' || m === 'gateway') return m;
            // Auto: without gateway credentials, use the classic tracking servlet.
            return env('BLUEDART_CLIENT_ID') && env('BLUEDART_CLIENT_SECRET') ? 'gateway' : 'legacy';
        })() as 'gateway' | 'legacy',
        legacyTrackingUrl: env('BLUEDART_LEGACY_TRACKING_URL', 'https://api.bluedart.com/servlet/RoutingServlet'),
        customerCode: env('BLUEDART_CUSTOMER_CODE'),
        originArea: env('BLUEDART_ORIGIN_AREA'),
        productCode: env('BLUEDART_PRODUCT_CODE', 'A'),
        productType: env('BLUEDART_PRODUCT_TYPE') === '0' ? 0 : 1,
        subProductPrepaid: env('BLUEDART_SUB_PRODUCT_PREPAID', 'P'),
        subProductCod: env('BLUEDART_SUB_PRODUCT_COD', 'C'),
        pickupTime: env('BLUEDART_PICKUP_TIME', '1600'),
        defaultWeightKg: num('BLUEDART_DEFAULT_WEIGHT_KG', 0.5),
        defaultDimensionsCm: parseDims(env('BLUEDART_DEFAULT_DIMENSIONS_CM', '15x10x5')),
        commodityDescription: env('BLUEDART_COMMODITY_DESCRIPTION', 'Gold Jewellery'),
        addressLineMax: num('BLUEDART_ADDRESS_LINE_MAX', 30),
        shipper,
        returnAddress: {
            name: env('BLUEDART_RETURN_NAME') || shipper.name,
            address1: env('BLUEDART_RETURN_ADDRESS1') || shipper.address1,
            address2: env('BLUEDART_RETURN_ADDRESS2') || shipper.address2,
            address3: env('BLUEDART_RETURN_ADDRESS3') || shipper.address3,
            pincode: env('BLUEDART_RETURN_PINCODE') || shipper.pincode,
            mobile: env('BLUEDART_RETURN_MOBILE') || shipper.mobile,
            email: env('BLUEDART_RETURN_EMAIL') || shipper.email,
            gstin: '',
        },
        paths: {
            token: env('BLUEDART_PATH_TOKEN', '/token/v1/login'),
            pincodeServices: env('BLUEDART_PATH_PINCODE', '/finder/v1/GetServicesforPincode'),
            transitTime: env('BLUEDART_PATH_TRANSIT', '/transit/v1/GetDomesticTransitTimeForPinCodeandProduct'),
            generateWaybill: env('BLUEDART_PATH_WAYBILL', '/waybill/v1/GenerateWayBill'),
            cancelWaybill: env('BLUEDART_PATH_CANCEL_WAYBILL', '/waybill/v1/CancelWaybill'),
            tracking: env('BLUEDART_PATH_TRACKING', '/tracking/v1'),
        },
        serviceabilityCacheHours: num('BLUEDART_PINCODE_CACHE_HOURS', 12),
        trackingCacheMinutes: num('BLUEDART_TRACKING_CACHE_MINUTES', 10),
        timeoutMs: num('BLUEDART_TIMEOUT_MS', 8000),
    };
}

/** Which features have everything they need configured. */
export function bluedartCapabilities(c: BluedartConfig) {
    const auth = !!(c.clientId && c.clientSecret && c.loginId);
    return {
        serviceability: c.mock || (c.enabled && auth && !!c.shippingLicenceKey),
        waybill:
            c.mock ||
            (c.enabled && auth && !!c.shippingLicenceKey && !!c.customerCode && !!c.originArea &&
                !!c.shipper.pincode && !!c.shipper.address1 && !!c.shipper.mobile),
        tracking:
            c.mock ||
            (c.enabled && !!c.loginId && !!c.trackingLicenceKey && (c.trackingMode === 'legacy' || auth)),
    };
}
