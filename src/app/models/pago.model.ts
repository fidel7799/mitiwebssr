export type MetodoPago =
  | 'Efectivo'
  | 'Zinli'
  | 'Transferencia'
  | 'Pago Móvil'
  | 'Wally'
  | 'Paypal'
  | 'USDT';

export interface Pago {
  metodo: MetodoPago;
  fecha: Date;
  monto: number;
  tasaCambio?: number;
}
