/**
 * Manage admin accounts (public signup can no longer create admins).
 *
 *   npm run make-admin -- --list                    # list all admin / super_admin users
 *   npm run make-admin -- owner@example.com         # promote an existing user to admin
 *   npm run make-admin -- owner@example.com --super # promote to super_admin
 *   npm run make-admin -- someone@example.com --demote   # back to customer
 *
 * The user must register on the site first. Uses MONGODB_URI_BASE / NODE_ENV from .env
 * (NODE_ENV=production → the -prod database). After demoting, also rotate JWT_SECRET:
 * existing login tokens keep their old role until they expire.
 */
import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { resolveMongoUri } from '../src/config/database.config';

async function main() {
    const args = process.argv.slice(2);
    const list = args.includes('--list');
    const demote = args.includes('--demote');
    const superAdmin = args.includes('--super');
    const email = args.find((a) => !a.startsWith('--'))?.trim().toLowerCase();

    if (!list && !email) {
        console.error('Usage: npm run make-admin -- <email> [--super|--demote]   or   npm run make-admin -- --list');
        process.exit(1);
    }

    const uri = resolveMongoUri();
    const client = new MongoClient(uri);
    await client.connect();
    const users = client.db().collection('users');
    console.log(`Database: ${client.db().databaseName}`);

    try {
        if (list) {
            const admins = await users
                .find({ role: { $in: ['admin', 'super_admin'] } }, { projection: { email: 1, name: 1, phone: 1, role: 1, createdAt: 1 } })
                .sort({ createdAt: 1 })
                .toArray();
            console.log(`\n${admins.length} admin account(s):`);
            for (const a of admins) {
                const created = a.createdAt ? new Date(a.createdAt).toISOString().slice(0, 16).replace('T', ' ') : '?';
                console.log(` - ${a.role.padEnd(11)} ${a.email}  ${a.name || ''}  ${a.phone || ''}  created ${created}`);
            }
            console.log('\nIf you do not recognise an account above, demote it with --demote and rotate JWT_SECRET.');
            return;
        }

        const role = demote ? 'customer' : superAdmin ? 'super_admin' : 'admin';
        const res = await users.updateOne(
            { email: { $regex: `^${email!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } },
            { $set: { role } },
        );
        if (res.matchedCount === 0) {
            console.error(`No user with email ${email}. Ask them to register on the site first.`);
            process.exitCode = 1;
            return;
        }
        console.log(`${email} is now "${role}". They must log out and log in again for it to apply.`);
    } finally {
        await client.close();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
