export interface PincodeServiceability {
    pincode: string;
    /** false = we could not ask Blue Dart (down / not configured); order is allowed. */
    checked: boolean;
    serviceable: boolean;
    prepaidAvailable: boolean;
    codAvailable: boolean;
    /** Estimated delivery date (ISO yyyy-mm-dd) when Blue Dart returns one. */
    estimatedDeliveryDate?: string;
    areaCode?: string;
    location?: string;
    message?: string;
    source: 'bluedart' | 'mock' | 'cache' | 'unavailable';
}

export interface WaybillInput {
    referenceNo: string;
    invoiceNo: string;
    isCod: boolean;
    declaredValue: number;
    collectableAmount: number;
    weightKg: number;
    pieces: number;
    dimensionsCm: { length: number; breadth: number; height: number };
    pickupDate: Date;
    registerPickup: boolean;
    consignee: {
        name: string;
        address1: string;
        address2: string;
        address3: string;
        pincode: string;
        mobile: string;
        email?: string;
    };
}

export interface WaybillResult {
    awbNo: string;
    tokenNumber?: string;
    destinationArea?: string;
    destinationLocation?: string;
    /** Base64 PDF shipping label, when Blue Dart returns one. */
    labelPdfBase64?: string;
    raw?: unknown;
}

export interface TrackingScan {
    scan: string;
    scanCode?: string;
    scanType?: string;
    date?: string;
    time?: string;
    location?: string;
}

export interface TrackingResult {
    awbNo: string;
    found: boolean;
    status?: string;
    /** Blue Dart status type, e.g. PU (picked up), IT (in transit), OD (out for delivery), DL (delivered), RT (returned). */
    statusType?: string;
    statusDate?: string;
    statusTime?: string;
    expectedDeliveryDate?: string;
    origin?: string;
    destination?: string;
    receivedBy?: string;
    scans: TrackingScan[];
    fetchedAt: string;
}
