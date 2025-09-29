import { Component, ChangeDetectionStrategy, inject, signal, computed, effect } from '@angular/core';
import { DialogModule } from 'primeng/dialog';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { RadioButtonModule } from 'primeng/radiobutton';
import { CustomerInfoService } from '../../services/customer-info.service';
import { CartStore } from '../../stores/cart.store';
import { environment } from '../../../environments/environment';
import { ProductStore } from '../../stores/product.store';
import { CartUiService } from '../../services/cart-ui.service';
import { FloatLabelModule } from 'primeng/floatlabel';

@Component({
  selector: 'app-checkout-dialog',
  standalone: true,
  imports: [CommonModule, DialogModule, FormsModule, ButtonModule, SelectModule, RadioButtonModule, FloatLabelModule],
  templateUrl: './checkout-dialog.component.html',
  styleUrl: './checkout-dialog.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutDialogComponent {
  ci = inject(CustomerInfoService);
  cart = inject(CartStore);
  productStore = inject(ProductStore);
  cartUi = inject(CartUiService);

  visible = signal(false);
  loadingSend = signal(false);

  private allFormas: string[] = ['Pago móvil','Binance','Efectivo','PayPal','Zelle','Zinli','Wally','USDT'];

  // Reglas:
  // - Toggle descuentos (hideBolivares() === true) => NO "Pago móvil" (resto sí)
  // - Toggle desactivado (hideBolivares() === false) => SOLO "Pago móvil"
  // - Envío nacional => no se permite "Efectivo" (se elimina si aparece)
  formasPago = computed(() => {
    const toggleUsd = this.productStore.hideBolivares();
    const envio = this.ci.envio();
    let list: string[];
    if (toggleUsd) list = this.allFormas.filter(f => f !== 'Pago móvil');
    else list = this.allFormas.filter(f => f === 'Pago móvil');
    if (envio === 'nacional') list = list.filter(f => f !== 'Efectivo');
    return list;
  });

  formasPagoOptions = computed(() => this.formasPago().map(f => ({ label: f, value: f })));

  // Efecto separado para sanear la selección sin escribir dentro del computed
  cleanupFormaPago = effect(() => {
    const list = this.formasPago();
    const current = this.ci.formaPago();
    if (!list.includes(current)) {
      if (list.length > 0) this.ci.formaPago.set(list[0] as any);
    }
  });

  open() { this.visible.set(true); }
  close() { if (!this.loadingSend()) this.visible.set(false); }

  get dialogVisible() { return this.visible(); }
  set dialogVisible(v: boolean) { v ? this.open() : this.close(); }

  private validarNombre(n: string) { return !!n && n.trim().length >= 3; }
  private validarCedula(c: string) { return /^[0-9]{5,12}$/.test(c.trim()); }

  formValido = computed(() => this.validarNombre(this.ci.nombre()) && this.validarCedula(this.ci.cedula()));

  async enviar() {
    if (!this.formValido()) return;
    this.loadingSend.set(true);
    try {
      // Refrescar productos e intentar reconciliar antes de enviar
      await this.productStore.reload();
      const products = this.productStore.products();
      const report = this.cart.reconcileWithProducts(products, 'checkout');
      if (report && (report.removed.length || report.reduced.length)) {
        // Publicar reporte, reabrir carrito y abortar envío
        this.cart.pendingAdjustments.set(report);
        this.close();
        this.cartUi.open();
        return;
      }
      const mensaje = this.cart.buildWhatsAppMessage({
        nombre: this.ci.nombre().trim(),
        cedula: this.ci.cedula().trim(),
        envio: this.ci.envio(),
        formaPago: this.ci.formaPago(),
      });
      const encoded = encodeURIComponent(mensaje);
      const url = `https://wa.me/${environment.whatsappNumber.replace(/[^0-9+]/g,'').replace(/^\+/, '')}?text=${encoded}`;
      if (typeof window !== 'undefined') {
        window.open(url, '_blank');
      }
      // Vaciar carrito tras enviar
      this.cart.clear();
      this.close();
    } finally {
      this.loadingSend.set(false);
    }
  }
}
