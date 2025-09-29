import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Component, inject, computed, ChangeDetectionStrategy } from '@angular/core';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { CartStore } from '../../stores/cart.store';
import { CartUiService } from '../../services/cart-ui.service';
import { CheckoutDialogComponent } from '../checkout-dialog/checkout-dialog.component';
import { ProductStore } from '../../stores/product.store';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-cart-drawer',
  standalone: true,
  imports: [CommonModule, FormsModule, DialogModule, ButtonModule, InputNumberModule, ToggleSwitchModule, CheckoutDialogComponent],
  templateUrl: './cart-drawer.component.html',
  styleUrl: './cart-drawer.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CartDrawerComponent {
  private cart = inject(CartStore);
  ui = inject(CartUiService);
  product = inject(ProductStore);

  // Mostrar el botón de simulación cuando el flag está activado (1)
  canShowDebug = environment.simulateStockButton === 1;

  items = computed(() => this.cart.items());
  totalItems = computed(() => this.cart.totalItems());
  subtotalUSD = computed(() => this.cart.subtotalUSD());
  // Subtotal en Bolívares usando precios b_descuento / b_detal actuales; fallback convierte desde USD * tasa si faltan campos
  subtotalBs = computed(() => {
    const products = this.product.products();
    const tasa = this.product.tasaBCV();
    return this.cart.items().reduce((acc, it) => {
      const p = products.find(pp => pp.idProducto === it.idProducto);
      if (!p) return acc;
      let priceBs: number | undefined;
      // Seleccionar precio bolívares preferentemente descuento si válido
      if (typeof p.precios.b_descuento === 'number' && p.precios.b_descuento > 0 && p.precios.b_descuento < p.precios.b_detal) {
        priceBs = p.precios.b_descuento;
      } else if (typeof p.precios.b_detal === 'number' && p.precios.b_detal > 0) {
        priceBs = p.precios.b_detal;
      }
      if (priceBs === undefined) {
        // Fallback: convertir desde unitPrice USD almacenado
        priceBs = it.unitPrice * (tasa || 0);
      }
      return acc + priceBs * it.qty;
    }, 0);
  });

  // Subtotal BCV (equivalente en USD oficial para los precios en Bs),
  // ahora usando las referencias pre-calculadas del backend (ref_bcv, ref_bcv_descuento) por unidad.
  // Fallback: si faltan referencias, divide subtotalBs entre tasa.
  subtotalBCV = computed(() => {
    const products = this.product.products();
    const tasa = this.product.tasaBCV();
    let totalRefUsd = 0;
    for (const it of this.cart.items()) {
      const p = products.find(pp => pp.idProducto === it.idProducto);
      if (!p) continue;
      // Determinar si se usa precio Bs con descuento
      const useBsDiscount = typeof p.precios.b_descuento === 'number' && p.precios.b_descuento > 0 && p.precios.b_descuento < p.precios.b_detal;
      const unitRef = useBsDiscount ? p.precios.ref_bcv_descuento : p.precios.ref_bcv;
      if (typeof unitRef === 'number' && unitRef > 0) {
        totalRefUsd += unitRef * it.qty;
      } else {
        // Fallback por item si no hay referencia: intentar calcular desde Bs/tasa
        let unitBs: number | undefined;
        if (useBsDiscount) unitBs = p.precios.b_descuento;
        else if (typeof p.precios.b_detal === 'number' && p.precios.b_detal > 0) unitBs = p.precios.b_detal;
        if (unitBs && tasa) totalRefUsd += (unitBs * it.qty) / tasa;
      }
    }
    if (totalRefUsd > 0) return totalRefUsd;
    // Último recurso: dividir el subtotal Bs por tasa (como antes)
    const subBs = this.subtotalBs();
    return tasa ? subBs / tasa : 0;
  });

  linePrice(it: { idProducto: number; unitPrice: number; qty: number }): number {
    const products = this.product.products();
    const p = products.find(pp => pp.idProducto === it.idProducto);
    if (!p) return it.unitPrice * it.qty;
    if (this.product.hideBolivares()) {
      return it.unitPrice * it.qty;
    } else {
      let unitBs: number | undefined;
      if (typeof p.precios.b_descuento === 'number' && p.precios.b_descuento > 0 && p.precios.b_descuento < p.precios.b_detal) {
        unitBs = p.precios.b_descuento;
      } else if (typeof p.precios.b_detal === 'number' && p.precios.b_detal > 0) {
        unitBs = p.precios.b_detal;
      }
      if (unitBs === undefined) {
        unitBs = it.unitPrice * (this.product.tasaBCV() || 0);
      }
      return unitBs * it.qty;
    }
  }

  lineUnit(it: { idProducto: number; unitPrice: number }): number {
    const products = this.product.products();
    const p = products.find(pp => pp.idProducto === it.idProducto);
    if (!p) return it.unitPrice;
    if (this.product.hideBolivares()) {
      return it.unitPrice; // USD unit
    } else {
      let unitBs: number | undefined;
      if (typeof p.precios.b_descuento === 'number' && p.precios.b_descuento > 0 && p.precios.b_descuento < p.precios.b_detal) {
        unitBs = p.precios.b_descuento;
      } else if (typeof p.precios.b_detal === 'number' && p.precios.b_detal > 0) {
        unitBs = p.precios.b_detal;
      }
      if (unitBs === undefined) unitBs = it.unitPrice * (this.product.tasaBCV() || 0);
      return unitBs;
    }
  }

  currencySymbol(): string { return this.product.hideBolivares() ? '$' : 'Bs'; }

  get visible() { return this.ui.visible(); }
  set visible(v: boolean) { v ? this.ui.open() : this.ui.close(); }
  open() { this.ui.open(); }
  close() { this.ui.close(); }

  updateQty(idProducto: number, qty: unknown) {
    const n = typeof qty === 'number' ? qty : Number(qty);
    const q = Math.max(0, Math.floor(n || 0));
    this.cart.update(idProducto, q);
  }

  maxFor(idProducto: number): number {
    const p = this.product.products().find(pp => pp.idProducto === idProducto);
    return p ? this.cart.maxPurchasable(p) : 99;
  }
  remove(idProducto: number) { this.cart.remove(idProducto); }
  clear() { this.cart.clear(); }

  // Simula que un producto del carrito tiene menos disponibilidad; útil para pruebas manuales
  simulateReduceRandomStock() {
    const items = this.cart.items();
    if (items.length === 0) return;
    const products = this.product.products();
    // Elegir primero algún item con qty > 1 para ver la reducción clara; si no hay, usar el primero
    const candidates = items.filter(it => it.qty > 1);
    const pool = (candidates.length ? candidates : items);
    const targetItem = pool[Math.floor(Math.random() * pool.length)]!;
    const p = products.find(pp => pp.idProducto === targetItem.idProducto);
    if (!p) return;
    let modProducts = products;
    if (targetItem.qty > 1) {
      const desiredMax = Math.max(1, targetItem.qty - 1);
      const modified = {
        ...p,
        inventario: {
          ...p.inventario,
          preventa: 0,
          disponible: desiredMax,
        },
      } as typeof p;
      modProducts = products.map(pp => (pp.idProducto === modified.idProducto ? modified : pp));
    } else {
      // Si ya tiene 1, simular que fue eliminado del catálogo para provocar un ajuste 'missing'
      modProducts = products.filter(pp => pp.idProducto !== p.idProducto);
    }
    const report = this.cart.reconcileWithProducts(modProducts, 'refresh');
    if (report && (report.removed.length || report.reduced.length)) {
      this.cart.pendingAdjustments.set(report);
    }
  }

  checkoutDialog?: CheckoutDialogComponent;
  onCheckout(dialog: CheckoutDialogComponent) {
    // Si el carrito está vacío no hacemos nada
    if (this.totalItems() === 0) return;
    // Cerrar primero el carrito para evitar solapamiento
    this.close();
    // Pequeño retardo para permitir animación de cierre
    setTimeout(() => dialog.open(), 150);
  }
}
