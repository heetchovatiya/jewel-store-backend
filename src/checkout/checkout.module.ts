import { Module } from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { CartModule } from '../cart/cart.module';
import { ProductsModule } from '../products/products.module';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
    imports: [CartModule, ProductsModule, InventoryModule],
    providers: [CheckoutService],
    exports: [CheckoutService],
})
export class CheckoutModule { }
