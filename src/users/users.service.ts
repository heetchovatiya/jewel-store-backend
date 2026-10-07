import { Injectable, ConflictException, NotFoundException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { User, UserDocument, UserRole } from './user.schema';
import { CreateUserDto, UpdateUserDto, AddAddressDto } from './dto/user.dto';

@Injectable()
export class UsersService {
    private readonly logger = new Logger(UsersService.name);

    constructor(
        @InjectModel(User.name) private userModel: Model<UserDocument>,
    ) { }

    async create(tenantId: string, createUserDto: CreateUserDto): Promise<User> {
        const existing = await this.userModel.findOne({
            tenantId: new Types.ObjectId(tenantId),
            email: createUserDto.email,
        });

        if (existing) {
            throw new ConflictException('User with this email already exists');
        }

        const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

        // Only copy known fields: never let request data set role or other privileged fields.
        const user = new this.userModel({
            email: createUserDto.email,
            name: createUserDto.name,
            phone: createUserDto.phone,
            tenantId: new Types.ObjectId(tenantId),
            password: hashedPassword,
            role: UserRole.CUSTOMER,
        });

        return user.save();
    }

    async findByEmail(tenantId: string, email: string): Promise<UserDocument | null> {
        return this.userModel.findOne({
            tenantId: new Types.ObjectId(tenantId),
            email,
        }).exec();
    }

    async findByEmailOrPhone(tenantId: string, identifier: string): Promise<UserDocument | null> {
        return this.userModel.findOne({
            tenantId: new Types.ObjectId(tenantId),
            $or: [
                { email: identifier.toLowerCase() },
                { phone: identifier },
            ],
        }).exec();
    }

    async findById(tenantId: string, id: string): Promise<UserDocument | null> {
        return this.userModel.findOne({
            _id: new Types.ObjectId(id),
            tenantId: new Types.ObjectId(tenantId),
        }).exec();
    }

    async findAll(tenantId: string): Promise<User[]> {
        return this.userModel.find({
            tenantId: new Types.ObjectId(tenantId),
            role: UserRole.CUSTOMER,
        }).select('-password').exec();
    }

    async update(tenantId: string, id: string, updateDto: UpdateUserDto): Promise<User | null> {
        return this.userModel.findOneAndUpdate(
            { _id: new Types.ObjectId(id), tenantId: new Types.ObjectId(tenantId) },
            updateDto,
            { new: true }
        ).select('-password').exec();
    }

    async addAddress(tenantId: string, userId: string, addressDto: AddAddressDto): Promise<User | null> {
        const user = await this.findById(tenantId, userId);
        if (!user) throw new NotFoundException('User not found');

        // If this is set as default, remove default from others
        if (addressDto.isDefault) {
            user.addresses.forEach(addr => addr.isDefault = false);
        }

        user.addresses.push(addressDto as any);
        return user.save();
    }

    async upsertAddress(tenantId: string, userId: string, addressDto: AddAddressDto): Promise<User | null> {
        const user = await this.findById(tenantId, userId);
        if (!user) throw new NotFoundException('User not found');

        const exists = user.addresses.some((addr) =>
            addr.fullName === addressDto.fullName &&
            addr.phone === addressDto.phone &&
            addr.addressLine1 === addressDto.addressLine1 &&
            (addr.addressLine2 || '') === (addressDto.addressLine2 || '') &&
            addr.city === addressDto.city &&
            addr.state === addressDto.state &&
            addr.pincode === addressDto.pincode
        );

        if (!exists) {
            const shouldSetDefault = user.addresses.length === 0 || !!addressDto.isDefault;
            if (shouldSetDefault) {
                user.addresses.forEach((addr) => { addr.isDefault = false; });
            }

            user.addresses.push({
                ...addressDto,
                isDefault: shouldSetDefault,
            } as any);
        }

        if (!user.phone && addressDto.phone) {
            user.phone = addressDto.phone;
        }

        return user.save();
    }

    async removeAddress(tenantId: string, userId: string, addressIndex: number): Promise<User | null> {
        const user = await this.findById(tenantId, userId);
        if (!user) throw new NotFoundException('User not found');

        user.addresses.splice(addressIndex, 1);
        return user.save();
    }

    async validatePassword(user: UserDocument, password: string): Promise<boolean> {
        return bcrypt.compare(password, user.password);
    }

    // ------------------------------------------------------------------ admin: roles

    async listUsersForAdmin(
        tenantId: string,
        query: { search?: string; role?: string; page?: number; limit?: number },
    ) {
        const page = query.page || 1;
        const limit = query.limit || 25;
        const filter: Record<string, unknown> = { tenantId: new Types.ObjectId(tenantId) };

        if (query.role === 'staff') filter.role = { $in: [UserRole.ADMIN, UserRole.SUPER_ADMIN] };
        else if (query.role) filter.role = query.role;

        const search = (query.search || '').trim().slice(0, 100);
        if (search) {
            const safe = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            filter.$or = [{ email: safe }, { name: safe }, { phone: safe }];
        }

        const [users, total] = await Promise.all([
            this.userModel
                .find(filter)
                .select('email name phone role createdAt roleChangedAt roleChangedBy')
                .sort({ role: -1, createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean()
                .exec(),
            this.userModel.countDocuments(filter),
        ]);
        return { users, total, page, limit };
    }

    /**
     * Change a user's role from the admin panel.
     * Rules: no changing your own role; only super_admins can grant/revoke super_admin
     * or touch a super_admin; at least one super_admin/admin must always remain.
     */
    async changeRole(tenantId: string, actor: { userId: string; role: string }, targetId: string, newRole: UserRole) {
        if (!Types.ObjectId.isValid(targetId)) throw new NotFoundException('User not found');
        if (actor.userId === targetId) {
            throw new ForbiddenException("You can't change your own role. Ask another admin.");
        }

        const target = await this.findById(tenantId, targetId);
        if (!target) throw new NotFoundException('User not found');
        if (target.role === newRole) return this.toAdminView(target);

        const actorIsSuper = actor.role === UserRole.SUPER_ADMIN;
        if (!actorIsSuper && (newRole === UserRole.SUPER_ADMIN || target.role === UserRole.SUPER_ADMIN)) {
            throw new ForbiddenException('Only a super admin can grant or remove super admin access.');
        }

        const isStaff = (r: string) => r === UserRole.ADMIN || r === UserRole.SUPER_ADMIN;
        if (isStaff(target.role) && !isStaff(newRole)) {
            const remaining = await this.userModel.countDocuments({
                tenantId: new Types.ObjectId(tenantId),
                role: { $in: [UserRole.ADMIN, UserRole.SUPER_ADMIN] },
                _id: { $ne: target._id },
            });
            if (remaining === 0) throw new BadRequestException('At least one admin must remain.');
        }

        const previous = target.role;
        target.role = newRole;
        target.roleChangedBy = new Types.ObjectId(actor.userId);
        target.roleChangedAt = new Date();
        await target.save();
        this.logger.warn(`[ROLE] ${target.email}: ${previous} -> ${newRole} (by user ${actor.userId})`);
        return this.toAdminView(target);
    }

    private toAdminView(u: UserDocument) {
        return {
            _id: u._id,
            email: u.email,
            name: u.name,
            phone: u.phone,
            role: u.role,
            createdAt: (u as any).createdAt,
            roleChangedAt: u.roleChangedAt,
        };
    }

    /** Current role straight from the DB (used on every authenticated request). */
    async getRole(tenantId: string, userId: string): Promise<UserRole | null> {
        if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(tenantId)) return null;
        const u = await this.userModel
            .findOne({ _id: new Types.ObjectId(userId), tenantId: new Types.ObjectId(tenantId) })
            .select('role')
            .lean()
            .exec();
        return (u?.role as UserRole) ?? null;
    }

    async createAdminUser(tenantId: string, email: string, password: string, name: string): Promise<User> {
        const existing = await this.findByEmail(tenantId, email);
        if (existing) return existing;

        // Internal use only (never reachable from public signup): create, then promote.
        const user = (await this.create(tenantId, { email, password, name })) as UserDocument;
        user.role = UserRole.ADMIN;
        return user.save();
    }
}
