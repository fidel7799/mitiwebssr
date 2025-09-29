// Tipos personalizados para valores permitidos
export type ValoresSKP1 = 'POK' | 'MTG' | 'YGO' | 'BDF' | 'DGI' | 'OPI' | 'ACC' | 'LOR'; // Ejemplo: idiomas
export type ValoresSKP2 = 'ES' | 'MX' | 'EN' | 'JP' | 'KR' | 'CN' | 'NA'; // Incluye Chino (CN) y Sin idioma (NA)
type ValoresSKP4 = 'FÍSICO' | 'DIGITAL' | 'PREMIUM' | undefined; // Ejemplo: formato (opcional)

export interface Producto {
  idProducto: number;
  sku: string;
  skp1: ValoresSKP1;
  skp2: ValoresSKP2;
  skp3: string;
  skp4: string;
  nombre: string;
  fechaLanzamiento: string;
  popularidad: number;
  costo: number;
  precios: { detal: number; descuento?: number; b_detal: number; b_descuento?: number; ref_bcv?: number; ref_bcv_descuento?: number };
  inventario: { disponible: number; preventa: number; apartado: number; espera: number };
}

export class ProductoModel implements Producto {
  idProducto: number = -1;
  sku: string = '';
  skp1: ValoresSKP1 = 'POK';
  skp2: ValoresSKP2 = 'EN';
  skp3: string = '';
  skp4: string = '';
  nombre: string = '';
  fechaLanzamiento: string = '';
  popularidad: number = 0;
  costo: number = 0;
  precios: { detal: number; descuento?: number; b_detal: number; b_descuento?: number; ref_bcv?: number; ref_bcv_descuento?: number } = {
    detal: 0,
    descuento: undefined,
    b_detal: 0,
    b_descuento: undefined,
    ref_bcv: undefined,
    ref_bcv_descuento: undefined,
  };
  inventario: { disponible: number; preventa: number; apartado: number; espera: number } = { disponible: 0, preventa: 0, apartado: 0, espera: 0 };

  constructor(initialValues?: Partial<ProductoModel>) {
    if (initialValues) {
      Object.assign(this, initialValues);
    }
  }
}