# Inventory index migration (Phase 1)

After deploying, if product create/update fails with a duplicate key error on `inventories`:

1. Open MongoDB shell or Compass for your database.
2. Drop the legacy index (name may vary):

```js
db.inventories.dropIndex("tenantId_1_productId_1")
```

3. Restart the API so Mongoose ensures the new compound index:

`(tenantId, productId, variantId)` unique.

Existing simple products keep one row with `variantId: null`.
Variant products get one row per variant on next read (lazy migration) or on admin save.
