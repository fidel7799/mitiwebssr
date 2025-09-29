import { Component, OnInit, inject } from '@angular/core';
import { EncabezadoComponent } from './encabezado/encabezado.component';
import { ListadoProductosComponent } from './listado-productos/listado-productos.component';
import { FooterComponent } from './footer/footer.component';
import { CartUiService } from '../services/cart-ui.service';
import { CartStore } from '../stores/cart.store';
import { InventoryAdjustmentsDialogComponent } from './inventory-adjustments-dialog/inventory-adjustments-dialog.component';

@Component({
  selector: 'app-ecommerce',
  imports: [EncabezadoComponent, ListadoProductosComponent, FooterComponent, InventoryAdjustmentsDialogComponent],
  standalone: true,
  templateUrl: './ecommerce.component.html',
  styleUrl: './ecommerce.component.css',
})
export class EcommerceComponent {
  private cartUi = inject(CartUiService);
  cart = inject(CartStore);
  openCart() { this.cartUi.open(); }
}
