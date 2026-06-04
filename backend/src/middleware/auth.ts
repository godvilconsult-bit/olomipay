import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma';


export interface AuthRequest extends Request {
  userId?: string;
  userPhone?: string;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or malformed Authorization header' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as {
      userId: string;
      phone: string;
    };
    req.userId    = payload.userId;
    req.userPhone = payload.phone;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export async function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  requireAuth(req, res, async () => {
    // Admin is identified by matching the platform Stellar key's owner
    // For simplicity we check an env-configured admin phone list
    const adminPhones = (process.env.ADMIN_PHONES ?? '').split(',').map(p => p.trim());
    if (!req.userPhone || !adminPhones.includes(req.userPhone)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    next();
  });
}
