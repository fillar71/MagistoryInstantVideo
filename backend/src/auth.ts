
import { OAuth2Client } from 'google-auth-library';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

// --- DB Abstraction for Fallback ---
let prismaInstance: PrismaClient | null = null;
const memoryUsers: any[] = [];

try {
    if (process.env.DATABASE_URL) {
        prismaInstance = new PrismaClient();
    } else {
        console.warn("WARN: DATABASE_URL not set. Using in-memory storage. Data will be lost on restart.");
    }
} catch (e) {
    console.error("Failed to initialize PrismaClient", e);
}

export const db = {
    user: {
        findUnique: async (args: { where: { id?: string; email?: string } }) => {
            if (prismaInstance) return prismaInstance.user.findUnique(args);
            return memoryUsers.find(u => 
                (args.where.id && u.id === args.where.id) || 
                (args.where.email && u.email === args.where.email)
            ) || null;
        },
        create: async (args: { data: any }) => {
            if (prismaInstance) return prismaInstance.user.create(args);
            // Mock ID generation
            const newUser = { id: `user-${Date.now()}-${Math.floor(Math.random() * 1000)}`, ...args.data };
            memoryUsers.push(newUser);
            return newUser;
        },
        update: async (args: { where: { id: string }, data: any }) => {
            if (prismaInstance) return prismaInstance.user.update(args);
            const idx = memoryUsers.findIndex(u => u.id === args.where.id);
            if (idx === -1) throw new Error("User not found");
            
            const user = memoryUsers[idx];
            
            // Handle simple decrement logic for credits (specific to this app)
            if (args.data.credits && typeof args.data.credits === 'object' && args.data.credits.decrement) {
                user.credits -= args.data.credits.decrement;
            } else if (args.data.credits !== undefined) {
                user.credits = args.data.credits;
            }
            
            // Handle other fields if necessary (none used currently except credits)
            
            memoryUsers[idx] = user;
            return user;
        }
    }
};
// -----------------------------------

export const verifyGoogleToken = async (token: string) => {
  const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
  });
  return ticket.getPayload();
};

export const findOrCreateUser = async (email: string, name: string, googleId: string) => {
    let user = await db.user.findUnique({ where: { email } });
    
    if (!user) {
        // New User: Gets 10 credits by default schema
        user = await db.user.create({
            data: {
                email,
                name,
                googleId,
                credits: 10 
            }
        });
    }
    return user;
};

export const generateSessionToken = (user: any) => {
    return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
};

// Middleware to check JWT from frontend requests
export const authMiddleware = async (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No token provided' });

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
    }
};
