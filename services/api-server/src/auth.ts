import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

declare const require: any;

// Safely initialize OAuth Client
const clientId = process.env.GOOGLE_CLIENT_ID || '';
const client = new OAuth2Client(clientId);
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

// --- DB Abstraction for Fallback ---
let prismaInstance: any = null;
let isPrismaInitialized = false;

// JSON DB Configuration for persistence
const DATA_DIR = path.join((process as any).cwd(), 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// Memory Fallback (in case disk is read-only)
let MEMORY_USERS: any[] = [];
let USE_MEMORY_ONLY = false;

// Ensure data directory exists if possible
try {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
} catch (e) {
    console.warn("⚠️ Cannot create data directory. Falling back to IN-MEMORY mode (Non-persistent).");
    USE_MEMORY_ONLY = true;
}

// Helper to read users
const readUsers = (): any[] => {
    if (USE_MEMORY_ONLY) return MEMORY_USERS;

    if (!fs.existsSync(USERS_FILE)) {
        return [];
    }
    try {
        const data = fs.readFileSync(USERS_FILE, 'utf-8');
        MEMORY_USERS = JSON.parse(data); // Sync memory cache
        return MEMORY_USERS;
    } catch (error) {
        console.error("Error reading users file (resetting memory):", error);
        return MEMORY_USERS;
    }
};

// Helper to write users
const writeUsers = (users: any[]) => {
    MEMORY_USERS = users; // Always update memory
    
    if (USE_MEMORY_ONLY) return;

    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    } catch (error) {
        console.error("⚠️ Error writing users file (switching to memory-only):", error);
        USE_MEMORY_ONLY = true;
    }
};

// --- LAZY PRISMA INITIALIZATION ---
// We do not initialize Prisma at top-level to prevent startup crashes if DB is unreachable.
const getPrisma = () => {
    if (isPrismaInitialized) return prismaInstance;

    try {
        if (process.env.DATABASE_URL) {
            console.log("Initializing PrismaClient (Lazy)...");
            let pkg;
            try {
                pkg = require('@prisma/client');
            } catch (requireErr) {
                console.warn("⚠️ @prisma/client package not found or cannot be required.");
            }

            if (pkg && pkg.PrismaClient) {
                const { PrismaClient } = pkg;
                prismaInstance = new PrismaClient();
                console.log("✅ PrismaClient initialized successfully.");
            } else {
                console.warn("⚠️ @prisma/client found but PrismaClient export missing. Did you run 'prisma generate'?");
            }
        }
    } catch (e) {
        console.error("Failed to initialize PrismaClient:", e);
    }
    
    isPrismaInitialized = true;
    return prismaInstance;
};

export const db = {
    user: {
        findUnique: async (args: { where: any }) => {
            const prisma = getPrisma();
            if (prisma) {
                try {
                    return await prisma.user.findUnique(args as any);
                } catch (e) {
                    console.error("Prisma Connection Failed (findUnique), using fallback...", e);
                }
            }
            
            const users = readUsers();
            return users.find(u => 
                (args.where.id && u.id === args.where.id) || 
                (args.where.email && u.email === args.where.email) ||
                (args.where.googleId && u.googleId === args.where.googleId)
            ) || null;
        },
        create: async (args: { data: any }) => {
            const prisma = getPrisma();
            if (prisma) {
                try {
                    return await prisma.user.create(args as any);
                } catch (e) {
                    console.error("Prisma Create Failed, using fallback...", e);
                }
            }
            
            const users = readUsers();
            const newUser = { id: `user-${Date.now()}-${Math.floor(Math.random() * 1000)}`, ...args.data };
            users.push(newUser);
            writeUsers(users);
            
            return newUser;
        },
        update: async (args: { where: { id: string }, data: any }) => {
            const prisma = getPrisma();
            if (prisma) {
                try {
                    return await prisma.user.update(args as any);
                } catch (e) {
                    console.error("Prisma Update Failed, using fallback...", e);
                }
            }
            
            const users = readUsers();
            const idx = users.findIndex(u => u.id === args.where.id);
            if (idx === -1) throw new Error("User not found");
            
            const user = users[idx];
            
            if (args.data.credits && typeof args.data.credits === 'object' && args.data.credits.decrement) {
                user.credits -= args.data.credits.decrement;
            } else if (args.data.credits !== undefined) {
                user.credits = args.data.credits;
            }
            
            users[idx] = user;
            writeUsers(users);
            
            return user;
        }
    }
};

export const verifyGoogleToken = async (token: string) => {
  if (!clientId) {
      console.warn("Skipping strict Google Token verification (Client ID missing). Decoding only.");
      const decoded: any = jwt.decode(token);
      if (decoded && decoded.email) return decoded;
      throw new Error("GOOGLE_CLIENT_ID is not configured on the server.");
  }
  const ticket = await client.verifyIdToken({
      idToken: token,
      audience: clientId,
  });
  return ticket.getPayload();
};

export const findOrCreateUser = async (email: string, name: string, googleId: string) => {
    let user = await db.user.findUnique({ where: { email } });
    
    if (!user) {
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