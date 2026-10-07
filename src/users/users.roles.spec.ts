import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { UsersService } from './users.service';
import { UserRole } from './user.schema';

const tenantId = new Types.ObjectId().toString();

function setup(targetRole: UserRole, otherStaff = 1) {
    const target: any = {
        _id: new Types.ObjectId(),
        email: 't@example.com',
        role: targetRole,
        save: jest.fn().mockResolvedValue(undefined),
    };
    const model: any = {
        findOne: jest.fn(() => ({ exec: () => Promise.resolve(target) })),
        countDocuments: jest.fn().mockResolvedValue(otherStaff),
    };
    return { service: new UsersService(model), target };
}

const admin = { userId: new Types.ObjectId().toString(), role: UserRole.ADMIN };
const superAdmin = { userId: new Types.ObjectId().toString(), role: UserRole.SUPER_ADMIN };

describe('UsersService.changeRole', () => {
    it('lets an admin promote a customer and records who did it', async () => {
        const { service, target } = setup(UserRole.CUSTOMER);
        const r = await service.changeRole(tenantId, admin, target._id.toString(), UserRole.ADMIN);
        expect(r.role).toBe(UserRole.ADMIN);
        expect(target.roleChangedBy.toString()).toBe(admin.userId);
        expect(target.save).toHaveBeenCalled();
    });

    it('lets an admin demote another admin', async () => {
        const { service, target } = setup(UserRole.ADMIN);
        await expect(service.changeRole(tenantId, admin, target._id.toString(), UserRole.CUSTOMER))
            .resolves.toMatchObject({ role: UserRole.CUSTOMER });
    });

    it('blocks changing your own role', async () => {
        const { service } = setup(UserRole.ADMIN);
        await expect(service.changeRole(tenantId, admin, admin.userId, UserRole.CUSTOMER))
            .rejects.toBeInstanceOf(ForbiddenException);
    });

    it('only super admins can grant or remove super admin', async () => {
        const a = setup(UserRole.CUSTOMER);
        await expect(a.service.changeRole(tenantId, admin, a.target._id.toString(), UserRole.SUPER_ADMIN))
            .rejects.toBeInstanceOf(ForbiddenException);
        const b = setup(UserRole.SUPER_ADMIN);
        await expect(b.service.changeRole(tenantId, admin, b.target._id.toString(), UserRole.CUSTOMER))
            .rejects.toBeInstanceOf(ForbiddenException);
        const c = setup(UserRole.CUSTOMER);
        await expect(c.service.changeRole(tenantId, superAdmin, c.target._id.toString(), UserRole.SUPER_ADMIN))
            .resolves.toMatchObject({ role: UserRole.SUPER_ADMIN });
    });

    it('never removes the last admin', async () => {
        const { service, target } = setup(UserRole.ADMIN, 0);
        await expect(service.changeRole(tenantId, superAdmin, target._id.toString(), UserRole.CUSTOMER))
            .rejects.toBeInstanceOf(BadRequestException);
    });
});
