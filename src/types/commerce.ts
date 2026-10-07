/** API contracts — keep in sync with frontend/src/types/commerce.ts */

export interface ProductVariant {
    _id: string;
    size?: string;
    color?: string;
    price?: number;
    sku?: string;
    stock?: number;
    image?: string;
    isActive?: boolean;
}

export interface ProductInventorySummary {
    stock?: number;
    sku?: string;
    inStock?: boolean;
    priceFrom?: number;
    priceTo?: number;
    allowBackorder?: boolean;
}

export interface Product {
    _id: string;
    title: string;
    description?: string;
    price: number;
    compareAtPrice?: number;
    category: string;
    images: string[];
    videos?: string[];
    hoverImageIndex?: number | null;
    slug: string;
    isActive?: boolean;
    isFeatured?: boolean;
    specifications?: Record<string, string>;
    hasVariants?: boolean;
    variants?: ProductVariant[];
    availableSizes?: string[];
    availableColors?: string[];
    colorImages?: Record<string, string[]>;
    inventory?: ProductInventorySummary;
}

export interface CartItem {
    lineId: string;
    productId: string;
    variantId?: string;
    size?: string;
    color?: string;
    title: string;
    price: number;
    image: string;
    quantity: number;
    sku?: string;
}

export interface CartResponse {
    items: CartItem[];
    total: number;
    itemCount: number;
    /** Lines that were dropped or reduced (guest-cart preview / merge). */
    issues?: CartIssue[];
}

/** A guest-cart line that could not be kept as-is. */
export interface CartIssue {
    productId: string;
    variantId?: string;
    title?: string;
    message: string;
}

/** Minimal line stored in the browser for logged-out shoppers. */
export interface GuestCartLine {
    productId: string;
    variantId?: string;
    quantity: number;
}

export interface OrderItem {
    productId: string;
    variantId?: string;
    size?: string;
    color?: string;
    title: string;
    price: number;
    image?: string;
    quantity: number;
    sku?: string;
}
