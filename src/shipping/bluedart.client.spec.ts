import { BluedartClient } from './bluedart.client';

const jsonRes = (status: number, body: unknown) =>
    ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) }) as any;
const textRes = (status: number, text: string) =>
    ({ ok: status >= 200 && status < 300, status, json: async () => JSON.parse(text), text: async () => text }) as any;

function makeClient() {
    const client = new BluedartClient();
    Object.assign(client.config, {
        clientId: 'cid', clientSecret: 'secret', loginId: 'LOGIN',
        shippingLicenceKey: 'SHIPKEY', trackingLicenceKey: 'TRACKKEY',
        baseUrl: 'https://bd.test', timeoutMs: 1000, trackingMode: 'gateway', apiVersion: '1',
    });
    client.config.shipper.pincode = '400001';
    return client;
}

describe('BluedartClient', () => {
    const realFetch = global.fetch;
    afterEach(() => {
        global.fetch = realFetch;
    });

    it('logs in, sends JWTToken and the shipping licence key to the pincode finder', async () => {
        const fetchMock = jest.fn()
            .mockResolvedValueOnce(jsonRes(200, { JWTToken: 'jwt-1' }))
            .mockResolvedValueOnce(jsonRes(200, {
                GetServicesforPincodeResult: {
                    IsError: false, eTailPrePaidAirInbound: 'Yes', eTailCODAirInbound: 'No',
                    AreaCode: 'BOM', PincodeDescription: 'ANDHERI',
                },
            }));
        global.fetch = fetchMock;

        const r = await makeClient().getServicesForPincode('400057');

        expect(fetchMock.mock.calls[0][0]).toBe('https://bd.test/token/v1/login');
        expect(fetchMock.mock.calls[0][1].headers).toMatchObject({ ClientID: 'cid', clientSecret: 'secret' });
        const [url, init] = fetchMock.mock.calls[1];
        expect(url).toBe('https://bd.test/finder/v1/GetServicesforPincode');
        expect(init.headers.JWTToken).toBe('jwt-1');
        expect(JSON.parse(init.body)).toEqual({
            pinCode: '400057',
            profile: { Api_type: 'S', LicenceKey: 'SHIPKEY', LoginID: 'LOGIN' },
        });
        expect(r).toMatchObject({ checked: true, serviceable: true, prepaidAvailable: true, codAvailable: false, areaCode: 'BOM' });
    });

    it('treats IsError for a pincode as not serviceable', async () => {
        global.fetch = jest.fn()
            .mockResolvedValueOnce(jsonRes(200, { JWTToken: 'jwt' }))
            .mockResolvedValueOnce(jsonRes(200, { GetServicesforPincodeResult: { IsError: true, ErrorMessage: 'Invalid PinCode' } }));
        const r = await makeClient().getServicesForPincode('999999');
        expect(r).toMatchObject({ checked: true, serviceable: false, codAvailable: false });
    });

    it('throws (so the service fails open) on credential errors and unknown response shapes', async () => {
        global.fetch = jest.fn()
            .mockResolvedValueOnce(jsonRes(200, { JWTToken: 'jwt' }))
            .mockResolvedValueOnce(jsonRes(200, { GetServicesforPincodeResult: { IsError: true, ErrorMessage: 'Invalid LicenceKey' } }));
        await expect(makeClient().getServicesForPincode('400057')).rejects.toThrow(/credentials/);

        global.fetch = jest.fn()
            .mockResolvedValueOnce(jsonRes(200, { JWTToken: 'jwt' }))
            .mockResolvedValueOnce(jsonRes(200, { GetServicesforPincodeResult: { Something: 'else' } }));
        await expect(makeClient().getServicesForPincode('400057')).rejects.toThrow(/Unrecognised/);
    });

    it('refreshes the token once on 401', async () => {
        const fetchMock = jest.fn()
            .mockResolvedValueOnce(jsonRes(200, { JWTToken: 'old' }))
            .mockResolvedValueOnce(jsonRes(401, {}))
            .mockResolvedValueOnce(jsonRes(200, { JWTToken: 'new' }))
            .mockResolvedValueOnce(jsonRes(200, { GetServicesforPincodeResult: { eTailCODAirInbound: 'Yes' } }));
        global.fetch = fetchMock;
        const r = await makeClient().getServicesForPincode('400057');
        expect(fetchMock.mock.calls[3][1].headers.JWTToken).toBe('new');
        expect(r.codAvailable).toBe(true);
        expect(r.serviceable).toBe(true);
    });

    it('generates a COD waybill and returns the AWB + label', async () => {
        const fetchMock = jest.fn()
            .mockResolvedValueOnce(jsonRes(200, { JWTToken: 'jwt' }))
            .mockResolvedValueOnce(jsonRes(200, {
                GenerateWayBillResult: {
                    AWBNo: '69012345678', IsError: false, DestinationArea: 'BOM', DestinationLocation: 'ANDHERI',
                    TokenNumber: 'T1', AWBPrintContent: [37, 80, 68, 70],
                },
            }));
        global.fetch = fetchMock;
        const client = makeClient();
        const r = await client.generateWaybill({
            referenceNo: 'ORD-1', invoiceNo: 'ORD-1', isCod: true, declaredValue: 52000, collectableAmount: 52000,
            weightKg: 0.5, pieces: 1, dimensionsCm: { length: 15, breadth: 10, height: 5 },
            pickupDate: new Date('2026-10-08T06:30:00Z'), registerPickup: false,
            consignee: { name: 'Asha Patel', address1: 'Flat 2', address2: 'MG Road', address3: 'Mumbai', pincode: '400057', mobile: '+91 98765 43210' },
        });
        const body = JSON.parse(fetchMock.mock.calls[1][1].body);
        expect(fetchMock.mock.calls[1][0]).toBe('https://bd.test/waybill/v1/GenerateWayBill');
        expect(body.Request.Services).toMatchObject({
            SubProductCode: 'C', CollectableAmount: 52000, DeclaredValue: 52000,
            PickupDate: `/Date(${new Date('2026-10-08T06:30:00Z').getTime()})/`,
        });
        expect(body.Request.Consignee.ConsigneeMobile).toBe('9876543210');
        expect(body.Profile.LicenceKey).toBe('SHIPKEY');
        expect(r.awbNo).toBe('69012345678');
        expect(Buffer.from(r.labelPdfBase64!, 'base64').toString()).toBe('%PDF');
    });

    it('surfaces Blue Dart waybill error messages', async () => {
        global.fetch = jest.fn()
            .mockResolvedValueOnce(jsonRes(200, { JWTToken: 'jwt' }))
            .mockResolvedValueOnce(jsonRes(400, { 'error-response': [{ IsError: true, Status: [{ StatusInformation: 'Invalid Customer Code' }] }] }));
        await expect(makeClient().generateWaybill({
            referenceNo: 'R', invoiceNo: 'R', isCod: false, declaredValue: 1, collectableAmount: 0, weightKg: 0.5, pieces: 1,
            dimensionsCm: { length: 1, breadth: 1, height: 1 }, pickupDate: new Date(), registerPickup: false,
            consignee: { name: 'A', address1: 'B', address2: '', address3: '', pincode: '400057', mobile: '9999999999' },
        })).rejects.toThrow('Invalid Customer Code');
    });

    it('calls tracking with the tracking licence key and parses the XML', async () => {
        const xml = `<?xml version="1.0"?><ShipmentData><Shipment SenderID="" WaybillNo="69012345678">
            <Origin>MUMBAI</Origin><Destination>AHMEDABAD</Destination>
            <Status>SHIPMENT DELIVERED</Status><StatusType>DL</StatusType>
            <StatusDate>10 Oct 2026</StatusDate><StatusTime>14:05</StatusTime><ReceivedBy>R &amp; S</ReceivedBy>
            <ExpectedDeliveryDate>10 October 2026</ExpectedDeliveryDate>
            <Scans>
              <ScanDetail><Scan>SHIPMENT DELIVERED</Scan><ScanCode>000</ScanCode><ScanType>DL</ScanType><ScanDate>10-Oct-2026</ScanDate><ScanTime>14:05</ScanTime><ScannedLocation>AHMEDABAD</ScannedLocation></ScanDetail>
              <ScanDetail><Scan>SHIPMENT PICKED UP</Scan><ScanType>PU</ScanType><ScanDate>08-Oct-2026</ScanDate><ScanTime>17:00</ScanTime><ScannedLocation>MUMBAI</ScannedLocation></ScanDetail>
            </Scans></Shipment></ShipmentData>`;
        const fetchMock = jest.fn()
            .mockResolvedValueOnce(jsonRes(200, { JWTToken: 'jwt' }))
            .mockResolvedValueOnce(textRes(200, xml));
        global.fetch = fetchMock;
        const t = await makeClient().track('69012345678');
        const url = new URL(fetchMock.mock.calls[1][0]);
        expect(url.pathname).toBe('/tracking/v1');
        expect(url.searchParams.get('lickey')).toBe('TRACKKEY');
        expect(url.searchParams.get('numbers')).toBe('69012345678');
        expect(t).toMatchObject({ found: true, statusType: 'DL', receivedBy: 'R & S', origin: 'MUMBAI' });
        expect(t.scans).toHaveLength(2);
        expect(t.scans[1]).toMatchObject({ scan: 'SHIPMENT PICKED UP', location: 'MUMBAI', scanType: 'PU' });
    });

    it('marks unknown waybills as not found', () => {
        const t = BluedartClient.parseTrackingXml(
            '<ShipmentData><Shipment WaybillNo="1"><StatusType>NF</StatusType><Status>Incorrect Waybill number or No Information</Status></Shipment></ShipmentData>',
            '1',
        );
        expect(t.found).toBe(false);
    });

    it('splits long addresses into 3 lines within the limit', () => {
        const lines = BluedartClient.splitAddress(
            'Flat 1203, Shanti Heights Co-op Housing Society, Near Jain Mandir, Opp. City Mall, Andheri West, Mumbai, Maharashtra',
            30,
        );
        expect(lines).toHaveLength(3);
        lines.forEach((l) => expect(l.length).toBeLessThanOrEqual(30));
        expect(lines[0]).toBe('Flat 1203, Shanti Heights');
    });

    it('tracks via the classic servlet (no JWT) with login ID, licence key and version', async () => {
        const fetchMock = jest.fn().mockResolvedValueOnce(
            textRes(200, '<ShipmentData><Shipment WaybillNo="1"><Status>IN TRANSIT</Status><StatusType>UD</StatusType></Shipment></ShipmentData>'),
        );
        global.fetch = fetchMock;
        const client = makeClient();
        Object.assign(client.config, { trackingMode: 'legacy', apiVersion: '1.3', legacyTrackingUrl: 'https://api.bluedart.test/servlet/RoutingServlet' });
        const t = await client.track('1');
        expect(fetchMock).toHaveBeenCalledTimes(1); // no token call
        const url = new URL(fetchMock.mock.calls[0][0]);
        expect(url.origin + url.pathname).toBe('https://api.bluedart.test/servlet/RoutingServlet');
        expect(url.searchParams.get('verno')).toBe('1.3');
        expect(url.searchParams.get('loginid')).toBe('LOGIN');
        expect(url.searchParams.get('lickey')).toBe('TRACKKEY');
        expect(fetchMock.mock.calls[0][1].headers.JWTToken).toBeUndefined();
        expect(t).toMatchObject({ found: true, status: 'IN TRANSIT' });
    });
});
