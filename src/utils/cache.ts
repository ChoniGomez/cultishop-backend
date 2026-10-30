/**
 * Gestor de caché en memoria de alta velocidad para Node.js / Express.
 * 
 * Reduce drásticamente las consultas repetitivas a la base de datos PostgreSQL
 * y el consumo de transferencia de red (bandwidth), permitiendo que las vistas públicas
 * (catálogo, categorías, banners, contenido institucional y preguntas frecuentes)
 * se respondan en menos de 1-2 ms directamente desde la memoria RAM del servidor.
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class MemoryCache {
  private store = new Map<string, CacheEntry<any>>();

  /**
   * Obtiene un valor de la memoria si no ha expirado
   */
  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Guarda un valor en la memoria con un tiempo de vida (TTL) en segundos
   */
  set<T>(key: string, data: T, ttlSeconds: number = 180): void {
    this.store.set(key, {
      data,
      expiresAt: Date.now() + ttlSeconds * 1000
    });
  }

  /**
   * Invalida una clave específica o un conjunto de claves que coincidan con un patrón
   */
  invalidate(keyOrPattern: string | RegExp): void {
    if (typeof keyOrPattern === 'string') {
      this.store.delete(keyOrPattern);
      // También invalidar claves con sufijos (ej: 'products' invalida 'products:catalog', 'products:admin', etc.)
      for (const k of this.store.keys()) {
        if (k.startsWith(`${keyOrPattern}:`)) {
          this.store.delete(k);
        }
      }
    } else {
      for (const k of this.store.keys()) {
        if (keyOrPattern.test(k)) {
          this.store.delete(k);
        }
      }
    }
  }

  /**
   * Limpia toda la memoria
   */
  clear(): void {
    this.store.clear();
  }
}

export const cache = new MemoryCache();

