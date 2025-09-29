export type MetodoEnvio = 'Delivery' | 'Nacional';

export type EmpresaEnvio = 'MRW' | 'Zoom' | 'Tealca' | 'Domesa' | 'Yummy';

export interface Envio {
  metodo: MetodoEnvio;
  costo: number;
  empresa: EmpresaEnvio;
  detalle: string;
}
