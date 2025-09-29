import { Cliente } from './cliente.model';
import { Envio } from './envio.model';
import { Pago } from './pago.model';
import { ProductoCarrito } from './productoCarrito.model';

export type Estado = 'Preventa' | 'Apartado' | 'Por entregar' | 'Entregado';

export interface Transaccion {
  id: number;
  productos: ProductoCarrito[];
  ventaTotal?: number;
  costoTotal: number;
  fecha: Date;
  estado: Estado; //pendiente, pagado, enviado, entregado
  envio?: Envio;
  pagos: Pago[];
  observacion: string;
  cliente?: Cliente;
}
