import { CommonModule, NgOptimizedImage } from '@angular/common';
import { Component, inject, input, computed, ChangeDetectionStrategy, signal, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ChipModule } from 'primeng/chip';
import { Producto } from '../../../models/producto.model';
import { environment } from '../../../../environments/environment';
import { ProductStore } from '../../../stores/product.store';
import { CartStore } from '../../../stores/cart.store';
import { FocusControlService } from '../../../services/focus-control.service';
import { MessageService } from 'primeng/api';

@Component({
  selector: 'app-tarjeta-producto',
  imports: [
    CommonModule,
    CardModule,
    ButtonModule,
    NgOptimizedImage,
    FormsModule,
    ChipModule,
    InputTextModule
],
  templateUrl: './tarjeta-producto.component.html',
  styleUrl: './tarjeta-producto.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  
})
export class TarjetaProductoComponent {
  producto = input.required<Producto>();
  mostrarBs = input.required<boolean>(); // true = USD, false = Bolívares (backend values)
  // Permite marcar esta imagen como prioritaria (above-the-fold)
  priorityImage = input<boolean>(false);
  urlImagenes = environment.imgPrds;
  private store = inject(ProductStore);
  private cart = inject(CartStore);
  private messageService = inject(MessageService);
  focusCtl = inject(FocusControlService); // público para template

  // Computeds basados en helpers del store
  bDescuento = computed(() => this.store.hasDiscount(this.producto()));
  porcentajeDescuento = computed(() => this.store.discountPercent(this.producto()));
  bPreventa = computed(() => this.store.stockState(this.producto()) === 'preorder');

  // Precio final (USD o Bs según toggle en padre)
  // Precio final mostrado (depende de toggle USD/Bs)
  precioFinal = computed(() => this.mostrarBs() ? this.store.finalPrice(this.producto()) : this.store.finalPriceConverted(this.producto()));

  precioDetal = computed(() => this.mostrarBs() ? this.producto().precios.detal : (this.producto().precios.b_detal));

  partesPrecioFinal = computed(() => this.store.priceParts(this.precioFinal()));
  partesPrecioDetal = computed(() => this.store.priceParts(this.precioDetal()));

  obtenerPresentacion(): string {
    return this.store.presentation(this.producto().skp4);
  }

  // Se puede agregar si hay stock (disponible != 0) y no es preventa
  canAdd = computed(() => {
    const p = this.producto();
    const disp = p.inventario.disponible;
    if (disp === 0 || disp < -1) return false; // bloqueado
    // -1 => se permite (hasta 100 en la store)
    // >0 normal
    return true;
  });

  addToCart(ev?: Event) {
    // Instrumentación: detectar invocaciones inesperadas
    try {
      console.info('[TarjetaProducto] addToCart called', {
        sku: this.producto().sku,
        nombre: this.producto().nombre,
        trusted: ev?.isTrusted,
        scrollY: window.scrollY
      });
    } catch {}
    if (ev && !ev.isTrusted) {
      // Ignorar disparos programáticos inesperados
      return;
    }

    // Si todavía bloqueamos focos iniciales y llegó aquí por keyboard (enter/space) ignorar
    if (this.focusCtl.blockInitialFocus()) {
      return;
    }
    const p = this.producto();
    // unitPrice en USD (sin conversión a Bs)
    const unitPriceUSD = this.store.finalPrice(p);
    // Antes de añadir, comprobar si ya alcanzamos máximo
    const max = this.cart.maxPurchasable(p);
    const existing = this.cart.items().find(i => i.idProducto === p.idProducto);
    if (existing && existing.qty >= max) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Stock máximo',
        detail: `Ya tienes el máximo (${max}) en el carrito.`
      });
      return;
    }
    this.cart.add(p, 1, unitPriceUSD, this.store.hasDiscount(p));
    const after = this.cart.items().find(i => i.idProducto === p.idProducto);
    const reached = after && after.qty >= max;
    this.messageService.add({
      key: 'cart',
      severity: reached ? 'info' : 'success',
      summary: reached ? 'Límite alcanzado' : 'Añadido al carrito',
      detail: reached ? `Has alcanzado el máximo (${max}) permitido.` : `${p.nombre} (x1)`
    });
  }

  onAddButtonFocus(el: EventTarget | null) {
    if (!this.focusCtl.blockInitialFocus()) return;
    if (el && (el as HTMLElement).blur) {
      try { (el as HTMLElement).blur(); } catch {}
    }
  }

  // Carrito: estado y acciones para stepper
  cartItem = computed(() => this.cart.items().find(i => i.idProducto === this.producto().idProducto) || null);
  cartQty = computed(() => this.cartItem()?.qty ?? 0);
  maxQty = computed(() => this.cart.maxPurchasable(this.producto()));
  inCart = computed(() => this.cartQty() > 0);
  maxReached = computed(() => this.cartQty() >= this.maxQty());

  // Control del input para edición suave
  qtyInput = signal<string>('');
  isEditing = signal<boolean>(false);
  private inputDebounceId: ReturnType<typeof globalThis.setTimeout> | null = null;
  private static readonly INPUT_DEBOUNCE_MS = 350;
  // Sincroniza la vista del input con el carrito cuando no se está editando manualmente
  private _syncInputEffect = effect(() => {
    if (this.isEditing()) return;
    const q = this.cartQty();
    this.qtyInput.set(q > 0 ? String(q) : '');
  });

  incQty() {
    const p = this.producto();
    const qty = this.cartQty();
    const max = this.maxQty();
    if (qty >= max) {
      this.messageService.add({ severity: 'warn', summary: 'Stock máximo', detail: `Máximo permitido: ${max}` });
      return;
    }
    const unitPriceUSD = this.store.finalPrice(p);
    this.cart.add(p, 1, unitPriceUSD, this.store.hasDiscount(p));
    // Actualiza input y sale de modo edición
    this.isEditing.set(false);
    this.qtyInput.set(String(this.cartQty() + 0));
  }

  decQty() {
    const qty = this.cartQty();
    const id = this.producto().idProducto;
    if (qty <= 1) {
      this.cart.remove(id);
      this.isEditing.set(false);
      this.qtyInput.set('');
      return;
    }
    this.cart.update(id, qty - 1);
    this.isEditing.set(false);
    this.qtyInput.set(String(this.cartQty() - 1));
  }

  onQtyInput(val: string) {
    // Usuario está editando; no sincronizar desde carrito
    this.isEditing.set(true);
    // Sanitiza a dígitos únicamente, pero permite vacío temporal
    const digits = val.replace(/[^0-9]/g, '');
    this.qtyInput.set(digits);
    // Reinicia debounce
    if (this.inputDebounceId !== null) {
      clearTimeout(this.inputDebounceId);
      this.inputDebounceId = null;
    }
    this.inputDebounceId = globalThis.setTimeout(() => {
      this.commitQtyFromInput();
    }, TarjetaProductoComponent.INPUT_DEBOUNCE_MS);
  }

  onQtyBlur() {
    // Al perder foco, forzar commit inmediato y normalización
    if (this.inputDebounceId !== null) {
      clearTimeout(this.inputDebounceId);
      this.inputDebounceId = null;
    }
    if (this.qtyInput() === '') {
      // Si quedó vacío, restaurar último valor del carrito
      const q = this.cartQty();
      this.qtyInput.set(q > 0 ? String(q) : '');
    } else {
      this.commitQtyFromInput();
    }
    this.isEditing.set(false);
  }

  onQtyKeydown(ev: KeyboardEvent) {
    const key = ev.key;
    // Permitir control/meta combinaciones comunes
    if (ev.ctrlKey || ev.metaKey) {
      const allow = ['a', 'c', 'v', 'x', 'z', 'A', 'C', 'V', 'X', 'Z'];
      if (allow.includes(key)) return;
    }
    // Permitir teclas de navegación y edición
    const nav = ['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter'];
    if (nav.includes(key)) return;
    // Permitir dígitos 0-9 únicamente
    if (/^[0-9]$/.test(key)) return;
    // Bloquear cualquier otro carácter (como ., -, e)
    ev.preventDefault();
  }

  onQtyPaste(ev: ClipboardEvent) {
    const data = ev.clipboardData?.getData('text') ?? '';
    const digits = data.replace(/[^0-9]/g, '');
    if (digits !== data) {
      ev.preventDefault();
      // Forzar valor saneado y actualizar carrito
      this.onQtyInput(digits);
    }
  }

  private commitQtyFromInput() {
    const raw = this.qtyInput();
    if (raw === '') return; // nada que confirmar
    let n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 0) n = 0;
    const max = this.maxQty();
    if (n > max) n = max;
    const id = this.producto().idProducto;
    if (n === 0) {
      // Quitar del carrito
      this.cart.remove(id);
      this.qtyInput.set('');
      return;
    }
    // Actualizar carrito y normalizar input (sin ceros a la izquierda)
    this.cart.update(id, n);
    this.qtyInput.set(String(n));
  }
}
