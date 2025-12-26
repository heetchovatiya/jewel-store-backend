import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { User, UserDocument, UserRole } from './user.schema';
import { CreateUserDto, UpdateUserDto, AddAddressDto } from './dto/user.dto';

@Injectable()
export class UsersService {
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

        const user = new this.userModel({
            ...createUserDto,
            tenantId: new Types.ObjectId(tenantId),
            password: hashedPassword,
        });

        return user.save();
    }

    async findByEmail(tenantId: string, email: string): Promise<UserDocument | null> {
        return this.userModel.findOne({
            tenantId: new Types.ObjectId(tenantId),
            email,
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

    async removeAddress(tenantId: string, userId: string, addressIndex: number): Promise<User | null> {
        const user = await this.findById(tenantId, userId);
        if (!user) throw new NotFoundException('User not found');

        user.addresses.splice(addressIndex, 1);
        return user.save();
    }

    async validatePassword(user: UserDocument, password: string): Promise<boolean> {
        return bcrypt.compare(password, user.password);
    }

    async createAdminUser(tenantId: string, email: string, password: string, name: string): Promise<User> {
        const existing = await this.findByEmail(tenantId, email);
        if (existing) return existing;

        return this.create(tenantId, {
            email,
            password,
            name,
            role: UserRole.ADMIN,
        });
    }
}
