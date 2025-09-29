import { Injectable } from '@angular/core'
import {
  AuthChangeEvent,
  AuthSession,
  createClient,
  Session,
  SupabaseClient,
  User,
} from '@supabase/supabase-js'
import { environment } from '../../environments/environment';
import { from, map, Observable } from 'rxjs';
import { Producto } from '../models/producto.model';
export interface Profile {
  id?: string
  username: string
  website: string
  avatar_url: string
}
@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  public supabase: SupabaseClient
  _session: AuthSession | null = null
  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey)
  }

  public getProducts(): Observable<Producto[]> {
    return from(
      this.supabase
      .from('productos')
  .select(`
        id_producto, sku, skp1, skp2, skp3, skp4, nombre, fecha_lanzamiento,
        popularidad,
  productos_precio!inner(detal,descuento,b_detal,b_descuento,ref_bcv,ref_bcv_descuento),
        productos_inventario!inner(disponible, preventa)
      `)
      .or('disponible.neq.0,preventa.neq.0', { foreignTable: 'productos_inventario' })
      .order('popularidad', { ascending: false })  // Primero por popularidad (descendente)
      .order('fecha_lanzamiento', { ascending: false })  // Luego por fecha (descendente)
    ).pipe(
      map((response: any) => {
          return response.data.map((item: any) => {
            return {
              idProducto: item.id_producto,
              sku: item.sku,
              skp1: item.skp1,
              skp2: item.skp2,
              skp3: item.skp3,
              skp4: item.skp4,
              nombre: item.nombre,
              fechaLanzamiento: item.fecha_lanzamiento,
              popularidad: item.popularidad,
              precios: {
                detal: item.productos_precio?.detal ?? 0,
                descuento: item.productos_precio?.descuento ?? undefined,
                b_detal: item.productos_precio?.b_detal ?? 0,
                b_descuento: item.productos_precio?.b_descuento ?? undefined,
                ref_bcv: item.productos_precio?.ref_bcv ?? undefined,
                ref_bcv_descuento: item.productos_precio?.ref_bcv_descuento ?? undefined,
              },
              inventario: item.productos_inventario,
            } as Producto;
          });
      })
    );
  }
  get session() {
    this.supabase.auth.getSession().then(({ data }) => {
      this._session = data.session
    })
    return this._session
  }
  profile(user: User) {
    return this.supabase
      .from('profiles')
      .select(`username, website, avatar_url`)
      .eq('id', user.id)
      .single()
  }

  async getConfigLP(): Promise<number> {
    // DEPRECATED: LISTAPRECIOS removed from runtime. Keep method stub for compatibility.
    console.warn('[SupabaseService] getConfigLP called but LISTAPRECIOS is deprecated. Returning 0.');
    return 0;
}

  authChanges(callback: (event: AuthChangeEvent, session: Session | null) => void) {
    return this.supabase.auth.onAuthStateChange(callback)
  }
  signIn(email: string) {
    return this.supabase.auth.signInWithOtp({ email })
  }
  signOut() {
    return this.supabase.auth.signOut()
  }
  updateProfile(profile: Profile) {
    const update = {
      ...profile,
      updated_at: new Date(),
    }
    return this.supabase.from('profiles').upsert(update)
  }
  downLoadImage(path: string) {
    return this.supabase.storage.from('avatars').download(path)
  }
  uploadAvatar(filePath: string, file: File) {
    return this.supabase.storage.from('avatars').upload(filePath, file)
  }
  async getConfigTasaBCV(): Promise<number> {
    console.log('[SupabaseService] getConfigTasaBCV() CALLED');
    const resp = await this.supabase
      .from('config')
      .select('valor')
      .eq('atributo', 'TASABCV')
      .single();

    // Log full response for debugging
    console.log('[SupabaseService] getConfigTasaBCV response:', resp);

    const data = (resp as any).data;
    const error = (resp as any).error;

    if (error) {
      console.error('[SupabaseService] Error fetching TASABCV', error);
      return 0;
    }

    const raw = data?.valor;
    console.log('[SupabaseService] TASABCV raw value:', raw);
    if (raw == null) return 0;
    if (typeof raw === 'number') return raw;
    const parsed = Number(String(raw).replace(/[^0-9.,-]/g, '').replace(',', '.'));
    if (isNaN(parsed) || !isFinite(parsed)) {
      console.warn('[SupabaseService] TASABCV could not be parsed to number:', raw);
      return 0;
    }
    return parsed;
  }
}