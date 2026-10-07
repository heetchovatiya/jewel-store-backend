import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './user.schema';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { AdminUsersController } from './admin-users.controller';

@Module({
    imports: [
        MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    ],
    controllers: [UsersController, AdminUsersController],
    providers: [UsersService],
    exports: [UsersService],
})
export class UsersModule { }
