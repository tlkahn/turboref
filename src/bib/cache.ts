import type { BibEntry } from "./types";

interface CacheEntry {
    entries: BibEntry[];
    mtime: number;
}

export interface BibCache {
    get(bibPath: string): Promise<CacheEntry | null>;
    set(bibPath: string, entry: CacheEntry): Promise<void>;
    invalidate(bibPath: string): Promise<void>;
    disconnect(): Promise<void>;
}

/**
 * In-memory cache for parsed bib entries. Default backend.
 */
export class MemoryBibCache implements BibCache {
    private store = new Map<string, CacheEntry>();

    async get(bibPath: string): Promise<CacheEntry | null> {
        return this.store.get(bibPath) ?? null;
    }

    async set(bibPath: string, entry: CacheEntry): Promise<void> {
        this.store.set(bibPath, entry);
    }

    async invalidate(bibPath: string): Promise<void> {
        this.store.delete(bibPath);
    }

    async disconnect(): Promise<void> {
        this.store.clear();
    }
}

/**
 * Redis-backed cache for parsed bib entries. Opt-in via settings.
 */
export class RedisBibCache implements BibCache {
    private redis: import("ioredis").default | null = null;
    private fallback = new MemoryBibCache();

    constructor(private redisUrl: string) {}

    private async getClient(): Promise<import("ioredis").default | null> {
        if (this.redis) return this.redis;
        try {
            const Redis = (await import("ioredis")).default;
            this.redis = new Redis(this.redisUrl, {
                lazyConnect: true,
                connectTimeout: 3000,
                maxRetriesPerRequest: 1,
            });
            await this.redis.connect();
            return this.redis;
        } catch (e) {
            console.warn("[TurboRef] Redis unavailable, using in-memory cache:", e);
            this.redis = null;
            return null;
        }
    }

    private key(bibPath: string): string {
        return `turboref:bib:${bibPath}`;
    }

    async get(bibPath: string): Promise<CacheEntry | null> {
        const client = await this.getClient();
        if (!client) return this.fallback.get(bibPath);

        try {
            const data = await client.get(this.key(bibPath));
            if (!data) return null;
            return JSON.parse(data) as CacheEntry;
        } catch {
            return this.fallback.get(bibPath);
        }
    }

    async set(bibPath: string, entry: CacheEntry): Promise<void> {
        const client = await this.getClient();
        if (!client) {
            await this.fallback.set(bibPath, entry);
            return;
        }

        try {
            await client.set(this.key(bibPath), JSON.stringify(entry));
        } catch {
            await this.fallback.set(bibPath, entry);
        }
    }

    async invalidate(bibPath: string): Promise<void> {
        const client = await this.getClient();
        if (client) {
            try {
                await client.del(this.key(bibPath));
            } catch { /* ignore */ }
        }
        await this.fallback.invalidate(bibPath);
    }

    async disconnect(): Promise<void> {
        if (this.redis) {
            try {
                await this.redis.quit();
            } catch { /* ignore */ }
            this.redis = null;
        }
        await this.fallback.disconnect();
    }
}
