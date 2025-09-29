import { Injectable, signal, computed, effect, inject } from '@angular/core';
import { Producto } from '../models/producto.model';
import { DbService } from '../services/db.service';
import { ProductStore } from './product.store';

export interface CartItem {
  idProducto: number;
  sku: string;
  nombre: string;
  qty: number;
  unitPrice: number; // precio base USD (sin conversión)
  discountApplied: boolean;
}

export interface CartAdjustmentRemoved {
  idProducto: number;
  sku: string;
  nombre: string;
  reason: 'missing' | 'noStock';
}

export interface CartAdjustmentReduced {
  idProducto: number;
  sku: string;
  nombre: string;
  from: number;
  to: number;
}

export interface CartAdjustmentsReport {
  trigger: 'refresh' | 'checkout';
  removed: CartAdjustmentRemoved[];
  reduced: CartAdjustmentReduced[];
}

@Injectable({ providedIn: 'root' })
export class CartStore {
  private _items = signal<CartItem[]>([]);
  private db = inject(DbService);
  private productStore = inject(ProductStore);

  private readonly KV_KEY = 'cart_items_v1';

  readonly items = computed(() => this._items());
  readonly totalItems = computed(() => this._items().reduce((acc, it) => acc + it.qty, 0));
  readonly subtotalUSD = computed(() => this._items().reduce((acc, it) => acc + it.qty * it.unitPrice, 0));

  // Reporte pendiente para mostrar en UI cuando se hacen ajustes por inventario
  readonly pendingAdjustments = signal<CartAdjustmentsReport | null>(null);

  // Restore from IndexedDB on service creation
  constructor() {
    // Load persisted cart asynchronously
    (async () => {
      try {
        const saved = await this.db.getKV<CartItem[]>(this.KV_KEY);
        if (Array.isArray(saved)) {
          // basic sanity: filter invalid entries
          const items = saved.filter(it => typeof it?.idProducto === 'number' && typeof it?.qty === 'number' && it.qty > 0);
          this._items.set(items);
        }
      } catch (err) {
        console.error('[CartStore] restore error', err);
      }
    })();

    // Persist on every change (debounce not necessary for small carts)
    effect(() => {
      const snapshot = this._items();
      // store shallow copy to avoid reactive proxies
      this.db.setKV(this.KV_KEY, snapshot.map(it => ({ ...it })));
    });

    // Vigilar cambios en productos e intentar reconciliar automáticamente
    effect(() => {
      const products = this.productStore.products();
      // Solo intenta reconciliar si hay items en carrito
      if (!this._items().length) return;
      const report = this.reconcileWithProducts(products, 'refresh');
      if (report && (report.removed.length || report.reduced.length)) {
        this.pendingAdjustments.set(report);
      }
    });
  }

  add(producto: Producto, qty = 1, unitPrice?: number, discountApplied = false) {
    const max = this.maxPurchasable(producto);
    if (max <= 0) return;
    this._items.update(items => {
      const existing = items.find(i => i.idProducto === producto.idProducto);
      if (existing) {
        const newQty = Math.min(existing.qty + qty, max);
        return items.map(i => i.idProducto === producto.idProducto ? { ...i, qty: newQty } : i);
      }
      const clampedQty = Math.min(qty, max);
      const price = unitPrice ?? (producto.precios.descuento ?? producto.precios.detal);
      return [
        ...items,
        {
          idProducto: producto.idProducto,
          sku: producto.sku,
          nombre: producto.nombre,
          qty: clampedQty,
          unitPrice: price,
          discountApplied: !!producto.precios.descuento || discountApplied
        }
      ];
    });
  }

  update(productId: number, qty: number) {
    if (qty <= 0) return this.remove(productId);
    const products = this.productStore.products();
    const prod = products.find(p => p.idProducto === productId);
    const max = prod ? this.maxPurchasable(prod) : qty;
    const clamped = Math.min(qty, max);
    this._items.update(items => items.map(i => i.idProducto === productId ? { ...i, qty: clamped } : i));
  }

  remove(productId: number) {
    this._items.update(items => items.filter(i => i.idProducto !== productId));
  }

  clear() {
    this._items.set([]);
  }

  // Máximo comprable = disponible + preventa (permitiendo reservar preventa) ignorando negativos
  maxPurchasable(p: Producto): number {
    const dispRaw = p.inventario.disponible;
    // Regla especial:
    //  -1 => stock "ilimitado" controlado a 100
    //   0 o < -1 => no se puede añadir
    if (dispRaw === -1) return 100; // tope artificial
    if (dispRaw === 0 || dispRaw < -1) return 0;
    const disp = Math.max(0, dispRaw || 0);
    const prev = Math.max(0, p.inventario.preventa || 0);
    return disp + prev;
  }

  buildWhatsAppMessage(opts: { nombre: string; cedula: string; envio: string; formaPago: string; includeSku?: boolean }): string {
    const { nombre, cedula, envio, formaPago } = opts;
    const tasa = this.productStore.tasaBCV();
    const products = this.productStore.products();
    const hideBolivares = this.productStore.hideBolivares(); // true => modo descuentos (USD), false => modo Bs
    const lines: string[] = [];
    lines.push(`Hola soy ${nombre} con cédula ${cedula} y mi pedido es:`);
    lines.push('');
    lines.push('Items:');
    let totalUsd = 0;
    let totalBs = 0;
    this._items().forEach(it => {
      const p = products.find(pp => pp.idProducto === it.idProducto);
      if (!p) return;
      // Precios base
      const unitUsd = it.unitPrice;
      let unitUsdOriginal = p.precios.detal;
      const hasDiscountUsd = typeof p.precios.descuento === 'number' && p.precios.descuento > 0 && p.precios.descuento < p.precios.detal;
      if (!hasDiscountUsd) unitUsdOriginal = unitUsd; // no discount
      const lineSubtotalUsd = unitUsd * it.qty;
      totalUsd += lineSubtotalUsd;
      // Bolívares
      let unitBs = p.precios.b_descuento && p.precios.b_descuento > 0 && p.precios.b_descuento < p.precios.b_detal ? p.precios.b_descuento : p.precios.b_detal;
      if (!unitBs) unitBs = unitUsd * tasa;
  const lineSubtotalBs = unitBs * it.qty;
      totalBs += lineSubtotalBs;
      const discountTag = hasDiscountUsd ? ` (desc ${(( (p.precios.detal - unitUsd) / p.precios.detal) * 100).toFixed(0)}%)` : '';
      const originalPart = hasDiscountUsd ? ` (antes $${unitUsdOriginal.toFixed(2)})` : '';
      if (hideBolivares) {
        // Modo descuentos en divisas: solo USD
        lines.push(`${it.qty}x ${it.nombre} - $${unitUsd.toFixed(2)}${discountTag}${originalPart}`);
      } else {
        // Modo Bs: mostrar precio en Bs y equivalencia a USD BCV usando referencias del backend
        let eqUsdLinea = 0;
        if (p.precios) {
          const useBsDiscount = typeof p.precios.b_descuento === 'number' && p.precios.b_descuento > 0 && p.precios.b_descuento < p.precios.b_detal;
          const unitRef = useBsDiscount ? p.precios.ref_bcv_descuento : p.precios.ref_bcv;
          if (typeof unitRef === 'number' && unitRef > 0) {
            eqUsdLinea = unitRef * it.qty;
          } else {
            // Fallback a conversión
            eqUsdLinea = tasa ? (lineSubtotalBs / tasa) : 0;
          }
        }
        lines.push(`${it.qty}x ${it.nombre} - Bs ${Math.round(lineSubtotalBs)} (= $${eqUsdLinea.toFixed(2)})`);
      }
    });
    lines.push('');
    if (hideBolivares) {
      lines.push(`Subtotal con descuento: $${totalUsd.toFixed(2)}`);
    } else {
      // Subtotal BCV usando referencias; fallback a dividir por tasa
      let eqSubtotalUsd = 0;
      const productsMap = new Map(this.productStore.products().map(p => [p.idProducto, p] as const));
      for (const it of this._items()) {
        const p = productsMap.get(it.idProducto);
        if (!p) continue;
        const useBsDiscount = typeof p.precios.b_descuento === 'number' && p.precios.b_descuento > 0 && p.precios.b_descuento < p.precios.b_detal;
        const unitRef = useBsDiscount ? p.precios.ref_bcv_descuento : p.precios.ref_bcv;
        if (typeof unitRef === 'number' && unitRef > 0) {
          eqSubtotalUsd += unitRef * it.qty;
        }
      }
      if (!eqSubtotalUsd) {
        eqSubtotalUsd = tasa ? (totalBs / tasa) : 0;
      }
      lines.push(`Subtotal: Bs${Math.round(totalBs)} (≈ $${eqSubtotalUsd.toFixed(2)} BCV)`);
    }
    lines.push(`Entrega: ${envio === 'caracas' ? 'Caracas' : 'Envío nacional'}`);
    lines.push(`Forma de pago: ${formaPago}`);
    const fecha = new Date();
    lines.push(`Fecha: ${fecha.toLocaleDateString()} ${fecha.toLocaleTimeString()}`);
    lines.push('');
    lines.push('Gracias.');
    return lines.join('\n');
  }

  // Reconciliar carrito contra productos actuales; aplica cambios y devuelve reporte si hubo ajustes
  reconcileWithProducts(products: Producto[], trigger: 'refresh' | 'checkout'): CartAdjustmentsReport | null {
    const items = this._items();
    if (!items.length) return null;
    const removed: CartAdjustmentRemoved[] = [];
    const reduced: CartAdjustmentReduced[] = [];
    const map = new Map(products.map(p => [p.idProducto, p] as const));
    const newItems: CartItem[] = [];
    for (const it of items) {
      const p = map.get(it.idProducto);
      if (!p) {
        removed.push({ idProducto: it.idProducto, sku: it.sku, nombre: it.nombre, reason: 'missing' });
        continue;
      }
      const max = this.maxPurchasable(p);
      if (max <= 0) {
        removed.push({ idProducto: it.idProducto, sku: it.sku, nombre: it.nombre, reason: 'noStock' });
        continue;
      }
      if (it.qty > max) {
        reduced.push({ idProducto: it.idProducto, sku: it.sku, nombre: it.nombre, from: it.qty, to: max });
        newItems.push({ ...it, qty: max });
      } else {
        newItems.push(it);
      }
    }
    // Si hubo cambios (remociones o reducciones), aplicar
    if (removed.length || reduced.length) {
      // aplicar removidos
      if (removed.length) {
        const removedIds = new Set(removed.map(r => r.idProducto));
        // newItems ya no incluye removidos; si llegaran a estar, filtrarlos
        for (let i = newItems.length - 1; i >= 0; i--) {
          if (removedIds.has(newItems[i]!.idProducto)) newItems.splice(i, 1);
        }
      }
      this._items.set(newItems);
      return { trigger, removed, reduced };
    }
    return null;
  }

  // Consumir/limpiar el reporte pendiente (lo hace la UI al cerrar el diálogo)
  consumePendingAdjustments() {
    this.pendingAdjustments.set(null);
  }
}
