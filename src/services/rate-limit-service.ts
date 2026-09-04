/**
 * Rate Limiting Service for fair API distribution
 * Uses Token Bucket algorithm with per-user tracking
 */

export interface RateLimitConfig {
  tokensPerMinute: number;
  maxTokens: number;
  burstAllowance: number;
}

export interface UserQuota {
  tokens: number;
  lastRefill: number;
  requestCount: number;
  lastRequestTime: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remainingTokens: number;
  resetTime: number;
  retryAfterMs?: number;
}

// Default tier configurations (increased for better mobile experience)
export const RATE_LIMIT_TIERS: Record<string, RateLimitConfig> = {
  free: {
    tokensPerMinute: 30,
    maxTokens: 60,
    burstAllowance: 15,
  },
  pro: {
    tokensPerMinute: 60,
    maxTokens: 120,
    burstAllowance: 30,
  },
  enterprise: {
    tokensPerMinute: 200,
    maxTokens: 400,
    burstAllowance: 100,
  },
  admin: {
    tokensPerMinute: 1000,
    maxTokens: 1000,
    burstAllowance: 500,
  },
};

export class RateLimitService {
  private userQuotas: Map<string, UserQuota> = new Map();
  private userTiers: Map<string, string> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Cleanup stale entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleEntries();
    }, 5 * 60 * 1000);
  }

  /**
   * Set the tier for a user
   */
  setUserTier(userId: string, tier: string): void {
    if (!RATE_LIMIT_TIERS[tier]) {
      throw new Error(`Unknown tier: ${tier}`);
    }
    this.userTiers.set(userId, tier);
  }

  /**
   * Get user's tier (defaults to 'free')
   */
  getUserTier(userId: string): string {
    return this.userTiers.get(userId) || 'free';
  }

  /**
   * Get rate limit config for a user
   */
  private getConfig(userId: string): RateLimitConfig {
    const tier = this.getUserTier(userId);
    return RATE_LIMIT_TIERS[tier];
  }

  /**
   * Get or create user quota
   */
  private getQuota(userId: string): UserQuota {
    let quota = this.userQuotas.get(userId);

    if (!quota) {
      const config = this.getConfig(userId);
      quota = {
        tokens: config.maxTokens,
        lastRefill: Date.now(),
        requestCount: 0,
        lastRequestTime: 0,
      };
      this.userQuotas.set(userId, quota);
    }

    return quota;
  }

  /**
   * Refill tokens based on time elapsed
   */
  private refillTokens(userId: string): void {
    const quota = this.getQuota(userId);
    const config = this.getConfig(userId);
    const now = Date.now();
    const elapsed = now - quota.lastRefill;
    const minutesElapsed = elapsed / 60000;

    // Calculate tokens to add
    const tokensToAdd = Math.floor(minutesElapsed * config.tokensPerMinute);

    if (tokensToAdd > 0) {
      quota.tokens = Math.min(
        config.maxTokens + config.burstAllowance,
        quota.tokens + tokensToAdd
      );
      quota.lastRefill = now;
    }
  }

  /**
   * Try to consume a token for a user
   * Returns whether the request is allowed
   */
  tryConsume(userId: string, tokensRequired: number = 1): RateLimitResult {
    this.refillTokens(userId);

    const quota = this.getQuota(userId);
    const config = this.getConfig(userId);
    const now = Date.now();

    if (quota.tokens >= tokensRequired) {
      quota.tokens -= tokensRequired;
      quota.requestCount++;
      quota.lastRequestTime = now;

      return {
        allowed: true,
        remainingTokens: quota.tokens,
        resetTime: quota.lastRefill + 60000,
      };
    }

    // Calculate when user can retry
    const tokensNeeded = tokensRequired - quota.tokens;
    const minutesUntilTokens = tokensNeeded / config.tokensPerMinute;
    const retryAfterMs = Math.ceil(minutesUntilTokens * 60000);

    return {
      allowed: false,
      remainingTokens: quota.tokens,
      resetTime: quota.lastRefill + 60000,
      retryAfterMs,
    };
  }

  /**
   * Check rate limit without consuming
   */
  checkLimit(userId: string): RateLimitResult {
    this.refillTokens(userId);

    const quota = this.getQuota(userId);

    return {
      allowed: quota.tokens >= 1,
      remainingTokens: quota.tokens,
      resetTime: quota.lastRefill + 60000,
    };
  }

  /**
   * Get user's current quota status
   */
  getQuotaStatus(userId: string): {
    tier: string;
    tokens: number;
    maxTokens: number;
    requestCount: number;
    resetTime: number;
  } {
    this.refillTokens(userId);

    const quota = this.getQuota(userId);
    const config = this.getConfig(userId);

    return {
      tier: this.getUserTier(userId),
      tokens: quota.tokens,
      maxTokens: config.maxTokens,
      requestCount: quota.requestCount,
      resetTime: quota.lastRefill + 60000,
    };
  }

  /**
   * Reset a user's quota (admin function)
   */
  resetQuota(userId: string): void {
    const config = this.getConfig(userId);
    this.userQuotas.set(userId, {
      tokens: config.maxTokens,
      lastRefill: Date.now(),
      requestCount: 0,
      lastRequestTime: 0,
    });
  }

  /**
   * Get global statistics
   */
  getStats(): {
    totalUsers: number;
    activeUsers: number;
    totalRequests: number;
    tierBreakdown: Record<string, number>;
  } {
    const now = Date.now();
    const fiveMinutesAgo = now - 5 * 60 * 1000;

    let activeUsers = 0;
    let totalRequests = 0;
    const tierBreakdown: Record<string, number> = {};

    this.userQuotas.forEach((quota, userId) => {
      if (quota.lastRequestTime > fiveMinutesAgo) {
        activeUsers++;
      }
      totalRequests += quota.requestCount;

      const tier = this.getUserTier(userId);
      tierBreakdown[tier] = (tierBreakdown[tier] || 0) + 1;
    });

    return {
      totalUsers: this.userQuotas.size,
      activeUsers,
      totalRequests,
      tierBreakdown,
    };
  }

  /**
   * Cleanup stale entries (users inactive for > 1 hour)
   */
  private cleanupStaleEntries(): void {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    this.userQuotas.forEach((quota, userId) => {
      if (quota.lastRequestTime < oneHourAgo && quota.lastRequestTime > 0) {
        this.userQuotas.delete(userId);
        this.userTiers.delete(userId);
      }
    });
  }

  /**
   * Shutdown the service
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Singleton instance
export const rateLimitService = new RateLimitService();
export default rateLimitService;
