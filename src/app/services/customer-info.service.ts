import { Injectable, signal, effect } from '@angular/core';

export type TipoEnvio = 'caracas' | 'nacional';
export type FormaPago = 'Pago móvil' | 'Binance' | 'PayPal' | 'USDT' | 'Zinli' | 'Wally' | 'Zelle' | 'Efectivo';

interface CustomerPersisted {
  nombre: string;
  cedula: string;
  envio: TipoEnvio;
  formaPago: FormaPago;
}

const STORAGE_KEY = 'customer_info_v1';

@Injectable({ providedIn: 'root' })
export class CustomerInfoService {
  nombre = signal<string>('');
  cedula = signal<string>('');
  envio = signal<TipoEnvio>('caracas');
  formaPago = signal<FormaPago>('Pago móvil');
  private readonly hasStorage = typeof window !== 'undefined' && typeof localStorage !== 'undefined';

  constructor() {
    if (!this.hasStorage) {
      return;
    }
    this.restore();
    let handle: any = null;
    const DEBOUNCE_MS = 300;
    effect(() => {
      const snapshot: CustomerPersisted = {
        nombre: this.nombre(),
        cedula: this.cedula(),
        envio: this.envio(),
        formaPago: this.formaPago(),
      };
      if (handle) clearTimeout(handle);
      handle = setTimeout(() => {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
        } catch {}
      }, DEBOUNCE_MS);
    });
  }

  private restore() {
    if (!this.hasStorage) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed: Partial<CustomerPersisted> = JSON.parse(raw);
      if (parsed.nombre) this.nombre.set(parsed.nombre);
      if (parsed.cedula) this.cedula.set(parsed.cedula);
      if (parsed.envio === 'caracas' || parsed.envio === 'nacional') this.envio.set(parsed.envio);
      const formas: FormaPago[] = ['Pago móvil','Binance','Efectivo','PayPal','Zelle','Zinli','Wally','USDT'];
      if (parsed.formaPago && formas.includes(parsed.formaPago as FormaPago)) this.formaPago.set(parsed.formaPago as FormaPago);
    } catch {}
  }

  clear() {
    if (!this.hasStorage) {
      this.nombre.set('');
      this.cedula.set('');
      this.envio.set('caracas');
      this.formaPago.set('Pago móvil');
      return;
    }
    this.nombre.set('');
    this.cedula.set('');
    this.envio.set('caracas');
    this.formaPago.set('Pago móvil');
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }
}
