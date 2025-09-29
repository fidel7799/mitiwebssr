import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import Dexie, { Table } from 'dexie';
import { Producto } from '../models/producto.model';

export interface KVEntry { key: string; value: any; updatedAt: number; }

@Injectable({ providedIn: 'root' })
export class AppDB extends Dexie {
  productos!: Table<Producto, number>; // key by idProducto
  kv!: Table<KVEntry, string>;

  constructor() {
    super('mitiweb-db');
    this.version(1).stores({
      productos: 'idProducto, sku, skp1, skp2, skp3, skp4, nombre, popularidad',
      kv: '&key'
    });
  }
}

@Injectable({ providedIn: 'root' })
export class DbService {
  private readonly db: AppDB | null;

  constructor(@Inject(PLATFORM_ID) platformId: object) {
    this.db = isPlatformBrowser(platformId) ? new AppDB() : null;
  }

  async putProductos(items: Producto[]): Promise<void> {
    if (!this.db) return;
    // Bulk upsert by idProducto
    await this.db.productos.bulkPut(items);
    await this.setKV('productos_lastUpdated', Date.now());
  }

  async getAllProductos(): Promise<Producto[]> {
    if (!this.db) return [];
    return await this.db.productos.toArray();
  }

  async clearProductos(): Promise<void> {
    if (!this.db) return;
    await this.db.productos.clear();
  }

  async setKV(key: string, value: any): Promise<void> {
    if (!this.db) return;
    await this.db.kv.put({ key, value, updatedAt: Date.now() });
  }

  async getKV<T = any>(key: string): Promise<T | undefined> {
    if (!this.db) return undefined;
    const row = await this.db.kv.get(key);
    return row?.value as T | undefined;
  }
}
