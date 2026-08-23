/**
 * Rate Limit Middleware for Express
 * Applies fair rate limiting to Claude API requests
 */

import { Request, Response, NextFunction } from 'express';
import rateLimitService, { RateLimitResult } from '../services/RateLimitService.js';

export interface RateLimitOptions {
  // Number of tokens required for this endpoint
  tokensRequired?: number;
  // Custom function to extract user ID from request
  getUserId?: (req: Request) => string | null;
  // Skip rate limiting for certain requests
  skip?: (req: Request) => boolean;
  // Custom error handler
  onRateLimited?: (req: Request, res: Response, result: RateLimitResult) => void;
}

/**
 * Create rate limit middleware
 */
export function createRateLimitMiddleware(options: RateLimitOptions = {}) {
  const {
    tokensRequired = 1,
    getUserId = defaultGetUserId,
    skip = () => false,
    onRateLimited = defaultOnRateLimited,
  } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    // Skip if configured
    if (skip(req)) {
      return next();
    }

    // Get user ID
    const userId = getUserId(req);
    if (!userId) {
      // No user ID - could be unauthenticated, apply default limits
      return next();
    }

    // Check rate limit
    const result = rateLimitService.tryConsume(userId, tokensRequired);

    // Add rate limit headers
    res.setHeader('X-RateLimit-Limit', rateLimitService.getQuotaStatus(userId).maxTokens);
    res.setHeader('X-RateLimit-Remaining', result.remainingTokens);
    res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000));

    if (!result.allowed) {
      if (result.retryAfterMs) {
        res.setHeader('Retry-After', Math.ceil(result.retryAfterMs / 1000));
      }
      return onRateLimited(req, res, result);
    }

    next();
  };
}

/**
 * Default function to extract user ID from request
 */
function defaultGetUserId(req: Request): string | null {
  // Try to get from authenticated user
  const user = (req as any).user;
  if (user?.id) return user.id;
  if (user?.accountId) return user.accountId;

  // Try to get from header
  const userIdHeader = req.headers['x-user-id'];
  if (userIdHeader && typeof userIdHeader === 'string') {
    return userIdHeader;
  }

  // Try to get from query param (for testing)
  const queryUserId = req.query.userId;
  if (queryUserId && typeof queryUserId === 'string') {
    return queryUserId;
  }

  return null;
}

/**
 * Default rate limited response handler
 */
function defaultOnRateLimited(req: Request, res: Response, result: RateLimitResult): void {
  const retryAfterSeconds = result.retryAfterMs ? Math.ceil(result.retryAfterMs / 1000) : 60;

  res.status(429).json({
    error: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many requests. Please try again later.',
    retryAfter: retryAfterSeconds,
    remainingTokens: result.remainingTokens,
    resetTime: new Date(result.resetTime).toISOString(),
  });
}

/**
 * Middleware specifically for Claude API endpoints
 * Uses higher token cost for expensive operations
 */
export function claudeRateLimitMiddleware(tokensRequired: number = 1) {
  return createRateLimitMiddleware({
    tokensRequired,
    getUserId: (req) => {
      // Priority: JWT user > header > query param
      const user = (req as any).user;
      if (user?.accountId) return user.accountId;
      if (user?.id) return user.id;

      const header = req.headers['x-user-id'] || req.headers['x-account-id'];
      if (header && typeof header === 'string') return header;

      return null;
    },
    skip: (req) => {
      // Skip health checks
      if (req.path === '/health' || req.path === '/healthz') {
        return true;
      }
      // Skip admin endpoints (they have their own limits)
      if (req.path.startsWith('/admin/')) {
        return true;
      }
      return false;
    },
    onRateLimited: (req, res, result) => {
      const retryAfterSeconds = result.retryAfterMs ? Math.ceil(result.retryAfterMs / 1000) : 60;

      console.warn(`[RateLimit] User rate limited: ${defaultGetUserId(req)}, remaining: ${result.remainingTokens}`);

      res.status(429).json({
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'You have exceeded your API request quota. Please wait before making more requests.',
        details: {
          remainingTokens: result.remainingTokens,
          resetTime: new Date(result.resetTime).toISOString(),
          retryAfterSeconds,
        },
        suggestion: 'Consider upgrading your plan for higher limits.',
      });
    },
  });
}

/**
 * Express router for rate limit status endpoints
 */
import { Router } from 'express';

export function createRateLimitRouter(): Router {
  const router = Router();

  // Get current user's rate limit status
  router.get('/status', (req, res) => {
    const userId = defaultGetUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'User ID required' });
    }

    const status = rateLimitService.getQuotaStatus(userId);
    res.json({
      tier: status.tier,
      tokens: {
        remaining: status.tokens,
        max: status.maxTokens,
      },
      requestCount: status.requestCount,
      resetTime: new Date(status.resetTime).toISOString(),
    });
  });

  // Admin: Get global statistics
  router.get('/admin/stats', (req, res) => {
    // TODO: Add admin authentication check
    const stats = rateLimitService.getStats();
    res.json(stats);
  });

  // Admin: Set user tier
  router.post('/admin/tier', (req, res) => {
    // TODO: Add admin authentication check
    const { userId, tier } = req.body;
    if (!userId || !tier) {
      return res.status(400).json({ error: 'userId and tier required' });
    }

    try {
      rateLimitService.setUserTier(userId, tier);
      res.json({ success: true, userId, tier });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Admin: Reset user quota
  router.post('/admin/reset', (req, res) => {
    // TODO: Add admin authentication check
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    rateLimitService.resetQuota(userId);
    res.json({ success: true, userId });
  });

  return router;
}

export default createRateLimitMiddleware;
