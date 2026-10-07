import { BadRequestException } from '@nestjs/common';
import { BluedartApiError, BluedartClient } from './bluedart.client';
import { ShippingService } from './shipping.service';

function makeService(overrides: Partial<BluedartClient> = {}) {
    const client = new BluedartClient();
    Object.assign(client.config, {
        mock: false, enabled: true, clientId: 'c', clientSecret: 's', loginId: 'l', shippingLicenceKey: 'k',
    });
    Object.assign(client, { getExpectedDeliveryDate: jest.fn().mockResolvedValue('2026-10-12'), ...overrides });
    return { service: new ShippingService({} as any, client), client };
}

describe('ShippingService serviceability', () => {
    it('allows the order (fails open) when Blue Dart is down', async () => {
        const { service } = makeService({
            getServicesForPincode: jest.fn().mockRejectedValue(new BluedartApiError('timed out')),
        });
        const r = await service.assertDeliverable('400057', 'cod');
        expect(r).toMatchObject({ checked: false, serviceable: true, codAvailable: true });
    });

    it('blocks a PIN code Blue Dart does not serve', async () => {
        const { service } = makeService({
            getServicesForPincode: jest.fn().mockResolvedValue({
                pincode: '999999', checked: true, serviceable: false, prepaidAvailable: false, codAvailable: false, source: 'bluedart',
            }),
        });
        await expect(service.assertDeliverable('999999', 'prepaid')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('blocks COD where only prepaid is available, but allows online payment', async () => {
        const lookup = jest.fn().mockResolvedValue({
            pincode: '400057', checked: true, serviceable: true, prepaidAvailable: true, codAvailable: false, source: 'bluedart',
        });
        const { service } = makeService({ getServicesForPincode: lookup });
        await expect(service.assertDeliverable('400057', 'cod')).rejects.toThrow(/Cash on Delivery/);
        await expect(service.assertDeliverable('400057', 'prepaid')).resolves.toMatchObject({ serviceable: true });
        expect(lookup).toHaveBeenCalledTimes(1); // second call served from cache
    });

    it('skips the check when Blue Dart is not configured', async () => {
        const { service, client } = makeService();
        client.config.clientId = '';
        const r = await service.checkServiceability('400057');
        expect(r).toMatchObject({ checked: false, serviceable: true, source: 'unavailable' });
    });

    it('rejects malformed PIN codes', async () => {
        const { service } = makeService();
        await expect(service.checkServiceability('12ab')).rejects.toBeInstanceOf(BadRequestException);
    });
});
