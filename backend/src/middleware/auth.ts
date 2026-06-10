import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';

export interface AuthRequest extends Request {
  userId?: string;
  userPhone?: string;
  userRole?: Role;
}

interface JwtPayload {
  userId: string;
  phone: string;
  role: Role;
}

/** Verify the bearer JWT and attach { userId, userPhone, userRole } to the request. */
export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or malformed Authorization header' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
    req.userId    = payload.userId;
    req.userPhone = payload.phone;
    req.userRole  = payload.role;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/** Require the authenticated user to hold one of the given roles. */
export function requireRole(...roles: Role[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    requireAuth(req, res, () => {
      if (!req.userRole || !roles.includes(req.userRole)) {
        res.status(403).json({ error: `Forbidden — requires role: ${roles.join(' | ')}` });
        return;
      }
      next();
    });
  };
}

/** Admin gate — ADMIN role on the token. */
export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  requireRole('ADMIN')(req, res, next);
}
