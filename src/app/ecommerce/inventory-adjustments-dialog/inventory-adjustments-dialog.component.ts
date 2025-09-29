import { Component, ChangeDetectionStrategy, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { CartStore } from '../../stores/cart.store';

@Component({
  selector: 'app-inventory-adjustments-dialog',
  standalone: true,
  imports: [CommonModule, DialogModule, ButtonModule],
  template: `<p-dialog
  [(visible)]="dialogVisible"
  [modal]="true"
  [closable]="false"
  [dismissableMask]="false"
  [draggable]="false"
  [resizable]="false"
  header="{{ title() }}"
>
  @if (report(); as r) {
    <div class="content">
      @if (r.removed.length > 0) {
        <div class="section">
          <h4>Productos removidos</h4>
          <ul>
            @for (it of r.removed; track it.idProducto) {
              <li>
                <b>{{ it.nombre }}</b>
                <span class="reason">— {{ it.reason === 'missing' ? 'ya no está en catálogo' : 'sin stock disponible' }}</span>
              </li>
            }
          </ul>
        </div>
      }
      @if (r.reduced.length > 0) {
        <div class="section">
          <h4>Cantidades ajustadas</h4>
          <ul>
            @for (it of r.reduced; track it.idProducto) {
              <li>
                <b>{{ it.nombre }}</b>
                <span>— de {{ it.from }} a {{ it.to }} por disponibilidad actual</span>
              </li>
            }
          </ul>
        </div>
      }
    </div>
  }
  <ng-template pTemplate="footer">
    <p-button label="Cerrar" (click)="close()" severity="primary" [raised]="true" />
  </ng-template>
</p-dialog>`,
  styles: [`.content { padding: .5rem 0; } .section { margin-bottom: .75rem; } .section h4 { margin: .25rem 0 .5rem; font-size: 1rem; } ul { margin: 0; padding-left: 1rem; } .reason { color: #ef4444; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InventoryAdjustmentsDialogComponent {
  cart = inject(CartStore);
  visible = signal(false);

  report = computed(() => this.cart.pendingAdjustments());

  // Abrir automáticamente cuando haya reporte pendiente
  autoOpen = effect(() => {
    const r = this.report();
    if (r && (r.removed.length || r.reduced.length)) {
      this.visible.set(true);
    }
  });

  open() { this.visible.set(true); }
  close() { this.visible.set(false); this.cart.consumePendingAdjustments(); }

  get dialogVisible() { return this.visible(); }
  set dialogVisible(v: boolean) { v ? this.open() : this.close(); }

  title(): string {
    const r = this.report();
    if (!r) return 'Ajustes de inventario';
    return r.trigger === 'checkout' ? 'Revisión de inventario antes de enviar' : 'Actualización de inventario';
  }
}
