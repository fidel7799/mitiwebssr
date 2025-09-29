import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Producto } from '../models/producto.model';
import { SupabaseService } from '../services/supabase.service';
import { DbService } from '../services/db.service';
import { isPlatformBrowser } from '@angular/common';

// Estado derivado de inventario
export type StockState = 'preorder' | 'many' | 'few' | 'last' | 'none';

interface CachedProducts {
  products: Producto[];
  lastUpdated: string; // ISO date
}

@Injectable({ providedIn: 'root' })
export class ProductStore {
  private supabase = inject(SupabaseService);
  private db = inject(DbService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  // Cache config
  private static readonly CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
  private static readonly KV_LAST_UPDATED = 'productos_lastUpdated';
  private static readonly LEGACY_CACHE_KEY = 'products_cache_v2';
  private static readonly KV_TASA_BCV = 'tasa_bcv';
  private static readonly TASA_TTL_MS = 15 * 60 * 1000; // 15 minutes

  // Base state
  private _products = signal<Producto[]>([]);
  private _loading = signal<boolean>(false);
  private _error = signal<string | null>(null);
  private _lastUpdated = signal<Date | null>(null);
  private _tasaBCV = signal<number>(0);
  private _tasaLastUpdated = signal<Date | null>(null);

  // Filtros / UI state
  filterCategory = signal<string>('');
  // Nuevo: múltiples franquicias (categorías) simultáneas
  filterCategories = signal<string[]>([]);
  filterHidePreorder = signal<boolean>(false);
  filterSearch = signal<string>('');
  // Nuevo: ordenar y filtrar por presentación
  // sortBy: ahora iniciamos en 'popularidad'. El valor '' significa "sin orden explícito" (mantener orden original de llegada)
  sortBy = signal<string>('popularidad'); // '' | 'precio-asc' | 'precio-desc' | 'nombre' | 'popularidad'
  filterPresentations = signal<string[]>([]);
  filterLanguages = signal<string[]>([]); // nuevo filtro por idioma (skp2)
  hideBolivares = signal<boolean>(true);
  // Vista global (all | promociones | preventa)
  viewMode = signal<'all' | 'promociones' | 'preventa'>('all');

  // Exposed readonly getters
  readonly products = computed(() => this._products());
  readonly loading = computed(() => this._loading());
  readonly error = computed(() => this._error());
  readonly tasaBCV = computed(() => this._tasaBCV());
  readonly lastUpdated = computed(() => this._lastUpdated());
  readonly tasaLastUpdated = computed(() => this._tasaLastUpdated());

  // Derivados reutilizables
  readonly productsPreventa = computed(() =>
    this._products().filter(p => p.inventario.preventa && p.inventario.preventa !== 0)
  );

  readonly productsDescuento = computed(() =>
    // Excluir preventas: mostrar sólo descuentos que no están en preventa
    this._products().filter(p => !p.inventario.preventa && this.hasDiscount(p))
  );

  readonly productsCalidadPrecio = computed(() =>
    // Excluir preventas y descuentos: estos ya se muestran en carruseles anteriores
    this._products().filter(p => {
      if (p.inventario.preventa) return false;
      if (this.hasDiscount(p)) return false;
      const skp4 = p.skp4;
      const skp2 = p.skp2;
      return (
        skp4 === 'ALE' ||
        (['ES', 'MX'].includes(skp2) && ['SBR', 'SSBR'].includes(skp4))
      );
    })
  );

  // Productos filtrados base (sin orden)
  private readonly baseFilteredProducts = computed(() => {
    const hidePre = this.filterHidePreorder();
  const cat = this.filterCategory();
  const cats = this.filterCategories();
    const search = this.normalize(this.filterSearch());
    // Aplicar filtros base
    let result = this._products().filter(p => {
      if (hidePre && p.inventario.preventa) return false;
  if (cat && p.skp1 !== cat) return false; // soporte retro
  if (cats.length && !cats.includes(p.skp1)) return false;
      if (search && !this.normalize(p.nombre).includes(search)) return false;
      return true;
    });

    // Filtrar por presentación si hay selecciones
    const presentations = this.filterPresentations();
    if (presentations && presentations.length > 0) {
      result = result.filter(p => presentations.includes(p.skp4 || ''));
    }

    // Filtrar por idiomas si hay selecciones
    const langs = this.filterLanguages();
    if (langs && langs.length > 0) {
      const sel = new Set(langs);
      result = result.filter(p => sel.has(p.skp2 || 'NA'));
    }

    return result;
  });

  // Aplicar ordenamiento separado (reduce recomputación cuando solo cambian filtros base)
  readonly filteredProducts = computed(() => {
    const list = this.baseFilteredProducts();
    const sort = this.sortBy();
    if (!sort) return list;
    const result = [...list];
    switch (sort) {
      case 'precio-asc':
        result.sort((a, b) => this.finalPrice(a) - this.finalPrice(b));
        break;
      case 'precio-desc':
        result.sort((a, b) => this.finalPrice(b) - this.finalPrice(a));
        break;
      case 'nombre':
        result.sort((a, b) => this.normalize(a.nombre).localeCompare(this.normalize(b.nombre)));
        break;
      case 'popularidad':
        result.sort((a, b) => (b.popularidad ?? 0) - (a.popularidad ?? 0));
        break;
      default:
        break;
    }
    return result;
  });

  readonly showCarousels = computed(() => {
    // Mostrar carruseles solo si no hay filtros activos distintos al default
  const anyCategory = !!this.filterCategory() || this.filterCategories().length>0;
    const anySearch = !!this.filterSearch();
    const hidePre = this.filterHidePreorder();
  const anyPresent = this.filterPresentations().length > 0;
    const anyLang = this.filterLanguages().length > 0;
    const nonDefaultSort = this.sortBy() !== 'popularidad';
    return !(
      anyCategory || anySearch || hidePre || anyPresent || anyLang || nonDefaultSort
    );
  });

  constructor() {
    // Kick off restoration from IndexedDB (with legacy migration fallback) only on browser
    if (this.isBrowser) {
      this.restoreFromIndexedDB();
    } else {
      void this.fetchVisible();
    }
  }

  private async restoreFromIndexedDB() {
    if (!this.isBrowser) return;
    try {
      // 1) Load products from IndexedDB if any
      const [items, lastUpdatedKV, tasaKV] = await Promise.all([
        this.db.getAllProductos(),
        this.db.getKV<number>(ProductStore.KV_LAST_UPDATED),
        this.db.getKV<{ rate: number; updatedAt: number }>(ProductStore.KV_TASA_BCV),
      ]);
      if (items && items.length > 0) {
        this._products.set(items);
        if (typeof lastUpdatedKV === 'number') {
          this._lastUpdated.set(new Date(lastUpdatedKV));
        }
        if (tasaKV && typeof tasaKV.rate === 'number') {
          this._tasaBCV.set(tasaKV.rate || 0);
          if (tasaKV.updatedAt) this._tasaLastUpdated.set(new Date(tasaKV.updatedAt));
        }
        console.info('[ProductStore] Restored products from IndexedDB:', items.length);
      } else {
        // 2) Try migrate from legacy localStorage cache v2 (single-shot)
  const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(ProductStore.LEGACY_CACHE_KEY);
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as { version: number; updatedAt: number; products: any[] };
            if (parsed?.products?.length) {
              // set into store and persist into IndexedDB
              this._products.set(parsed.products as any);
              this._lastUpdated.set(new Date(parsed.updatedAt || Date.now()));
              await this.db.putProductos(parsed.products as any);
              console.info('[ProductStore] Migrated products from legacy localStorage to IndexedDB:', parsed.products.length);
            }
          } catch (e) {
            console.warn('[ProductStore] Failed to parse legacy cache', e);
          }
        }
      }
    } catch (err) {
      console.warn('[ProductStore] restoreFromIndexedDB error', err);
    } finally {
      // After restore, run SWR loadAll decision (won't block UI)
      this.loadAll();
    }
  }

  async loadAll(force = false) {
    console.log('[ProductStore] loadAll()', { force });
    const hasCache = this._products().length > 0;
  const last = this._lastUpdated();
  const age = last ? Date.now() - last.getTime() : Number.POSITIVE_INFINITY;
    const shouldRefresh = force || age > ProductStore.CACHE_TTL_MS;
    console.log('[ProductStore] cache status', { hasCache, ageMs: age, isStale: shouldRefresh });

    if (!this._products().length) {
      // If there's nothing, fetch visibly
      await this.fetchVisible();
      return;
    }

    if (shouldRefresh) {
      // Stale-while-revalidate: show current, refresh in background
      void this.fetchInBackground();
    } else {
      // Products not refreshed; ensure TASABCV is fresh enough
      void this.maybeFetchTasaBCV();
    }
  }

  private async fetchVisible() {
    this._loading.set(true);
    this._error.set(null);
    try {
      const [items, tasa] = await Promise.all([
        firstValueFrom(this.supabase.getProducts()),
        this.supabase.getConfigTasaBCV(),
      ]);
      this._products.set(items);
      this._lastUpdated.set(new Date());
      this._tasaBCV.set(tasa || 0);
      this._tasaLastUpdated.set(new Date());
      // persist to IndexedDB
      if (this.isBrowser) {
        await this.db.putProductos(items);
        await this.db.setKV(ProductStore.KV_TASA_BCV, { rate: this._tasaBCV(), updatedAt: Date.now() });
      }
      console.info('[ProductStore] Fetch (visible) complete. Items:', items.length);
    } catch (e: unknown) {
      console.error('[ProductStore] Fetch (visible) failed', e);
      this._error.set(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      this._loading.set(false);
    }
  }

  private async fetchInBackground() {
    try {
      const [items, tasa] = await Promise.all([
        firstValueFrom(this.supabase.getProducts()),
        this.supabase.getConfigTasaBCV(),
      ]);
      this._products.set(items);
      this._lastUpdated.set(new Date());
      this._tasaBCV.set(tasa || 0);
      this._tasaLastUpdated.set(new Date());
      if (this.isBrowser) {
        await this.db.putProductos(items);
        await this.db.setKV(ProductStore.KV_TASA_BCV, { rate: this._tasaBCV(), updatedAt: Date.now() });
      }
      console.info('[ProductStore] Background refresh complete. Items:', items.length);
    } catch (e) {
      console.warn('[ProductStore] Background refresh failed', e);
    }
  }

  reload() {
    return this.fetchVisible();
  }

  // Helpers dominio
  hasDiscount(p: Producto): boolean {
    // Existe descuento en USD o en Bs (preferimos la señal USD si viene)
    const usdDisc = typeof p.precios.descuento === 'number' && p.precios.descuento > 0 && p.precios.descuento < p.precios.detal;
    const bsDisc = typeof p.precios.b_descuento === 'number' && p.precios.b_descuento > 0 && p.precios.b_descuento < p.precios.b_detal;
    return usdDisc || bsDisc;
  }

  discountPercent(p: Producto): number | null {
    if (!this.hasDiscount(p)) return null;
    // Priorizar cálculo desde USD si está disponible para consistencia con marketing
    if (typeof p.precios.descuento === 'number' && p.precios.descuento > 0 && p.precios.descuento < p.precios.detal) {
      return Math.round(((p.precios.detal - p.precios.descuento) / p.precios.detal) * 100);
    }
    if (typeof p.precios.b_descuento === 'number' && p.precios.b_descuento > 0 && p.precios.b_descuento < p.precios.b_detal) {
      return Math.round(((p.precios.b_detal - p.precios.b_descuento) / p.precios.b_detal) * 100);
    }
    return null;
  }

  finalPrice(p: Producto): number {
    // Precio final en USD: usar descuento USD si existe, sino detal
    if (typeof p.precios.descuento === 'number' && p.precios.descuento > 0 && p.precios.descuento < p.precios.detal) {
      return p.precios.descuento;
    }
    return p.precios.detal;
  }

  finalPriceConverted(p: Producto): number {
    // hideBolivares true => USD; false => Bolívares
    if (this.hideBolivares()) return this.finalPrice(p);
    if (typeof p.precios.b_descuento === 'number' && p.precios.b_descuento > 0 && p.precios.b_descuento < p.precios.b_detal) {
      return p.precios.b_descuento;
    }
    return p.precios.b_detal;
  }

  priceParts(value: number): { entero: number; decimal: string } {
    const entero = Math.floor(value);
    const decimal = (value % 1).toFixed(2).split('.')[1];
    return { entero, decimal };
  }

  stockState(p: Producto): StockState {
    if (p.inventario.preventa && p.inventario.preventa !== 0) return 'preorder';
    const disp = p.inventario.disponible;
    if (disp === 0) return 'none';
    if (disp === 1) return 'last';
    if (disp <= 5) return 'few';
    return 'many';
  }

  presentation(code: string): string {
    switch (code) {
      case 'SBR':
      case 'SSBR':
        return 'Sobre';
      case 'PAQ':
      case 'BB6':
      case '3PK':
        return 'Paquete';
      case 'UNI':
        return 'Unidad';
      case 'PAR':
        return 'Par';
      case 'TRI':
        return 'Trio';
      case 'TIN':
        return 'Lata';
      case 'B36':
      case 'BBA':
      case 'SUR':
      case 'PRC':
      case 'PCO':
      case 'BCO':
      case 'CES':
      case 'SPC':
      case 'CJA':
      case 'B24':
      case 'SPE':
      case 'MAT':
        return 'Caja';
      case 'ETB':
        return 'ETB';
      case 'ALE':
        return 'Mazo';
      case 'DCK':
      case 'BD1':
      case 'BD2':
      case 'BD3':
        return 'Deck';
      case 'BLI':
        return 'Blister';
      default:
        return 'N/A';
    }
  }

  private async maybeFetchTasaBCV(force = false) {
    try {
      const last = this._tasaLastUpdated();
      const age = last ? Date.now() - last.getTime() : Number.POSITIVE_INFINITY;
      const should = force || age > ProductStore.TASA_TTL_MS || !this._tasaBCV();
      if (!should) return;
      const rate = await this.supabase.getConfigTasaBCV();
      if (typeof rate !== 'number' || !isFinite(rate) || rate <= 0) {
        console.warn('[ProductStore] TASABCV invalid or zero; keeping previous', rate);
        return;
      }
      this._tasaBCV.set(rate);
      this._tasaLastUpdated.set(new Date());
      if (this.isBrowser) {
        await this.db.setKV(ProductStore.KV_TASA_BCV, { rate, updatedAt: Date.now() });
      }
      console.info('[ProductStore] TASABCV updated:', rate);
    } catch (err) {
      console.error('[ProductStore] Error obteniendo TASABCV', err);
    }
  }


  private normalize(str: string): string {
    return (str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }
}
