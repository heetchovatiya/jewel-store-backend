import { Types } from 'mongoose';
import { UsersService } from './users.service';
import { UserRole } from './user.schema';

describe('UsersService.create (public signup)', () => {
    it('always creates a customer, even if a role is smuggled in', async () => {
        const saved: any[] = [];
        function UserModel(this: any, doc: any) {
            Object.assign(this, doc);
            this.save = async () => {
                saved.push(doc);
                return this;
            };
        }
        (UserModel as any).findOne = jest.fn().mockResolvedValue(null);

        const service = new UsersService(UserModel as any);
        await service.create(new Types.ObjectId().toString(), {
            email: 'attacker@example.com',
            password: 'secret123',
            name: 'X',
            role: 'admin',
            isAdmin: true,
        } as any);

        expect(saved[0].role).toBe(UserRole.CUSTOMER);
        expect(saved[0]).not.toHaveProperty('isAdmin');
        expect(saved[0].password).not.toBe('secret123');
    });
});
