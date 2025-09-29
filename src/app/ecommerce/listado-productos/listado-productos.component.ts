import { Component, inject, OnInit, effect } from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { MultiSelectModule } from 'primeng/multiselect';
import { FormsModule } from '@angular/forms';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { InputTextModule } from 'primeng/inputtext';
import { FloatLabelModule } from 'primeng/floatlabel';
import { SelectModule } from 'primeng/select';
import { SupabaseService } from '../../services/supabase.service';
import { TarjetaProductoComponent } from './tarjeta-producto/tarjeta-producto.component';
import { environment } from '../../../environments/environment';
import { CarouselModule as CarouselNGX, OwlOptions } from 'ngx-owl-carousel-o';
import { ActivatedRoute, Data } from '@angular/router';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { DialogModule } from 'primeng/dialog';
import { ProductStore } from '../../stores/product.store';
import { ProductosService } from '../../services/productos.service';
import { Producto, ValoresSKP2 } from '../../models/producto.model';

@Component({
  selector: 'app-listado-productos',
  imports: [
    CommonModule,
    ButtonModule,
    NgOptimizedImage,
  MultiSelectModule,
    FormsModule,
    ToggleSwitchModule,
    InputTextModule,
    FloatLabelModule,
  SelectModule,
    ToastModule,
    DialogModule,
  TarjetaProductoComponent,
  CarouselNGX,
  ],
  // standalone por defecto
  templateUrl: './listado-productos.component.html',
  styleUrl: './listado-productos.component.css',
  providers: [MessageService],
})
export class ListadoProductosComponent implements OnInit {
  protected store = inject(ProductStore);
  // Eliminado: ya no se unifican ES/MX; se muestran como idiomas distintos
  // Se usa store.viewMode ahora (all | promociones | preventa)
  get viewTitle(): string {
    const vm = this.store.viewMode();
    if (vm === 'promociones') return 'Promociones';
    if (vm === 'preventa') return 'Preventa';
    return 'Todos los productos';
  }
  meses: string[] = [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre',
  ];
  categoriasFiltradas: any[] = []; // placeholder futuras multi-categorías
  mostrarDescuentos: boolean = false; // futuro toggle global
  private productosService = inject(ProductosService); // Solo para categorías (puede migrar a store luego)
  urlImagenes = environment.imgPrds;
  responsiveOptions: any[] | undefined;
  categoriaActiva: string = '';
  listadoCategorias: any[] = [];
  ocultarPreventa = false; // usado para binding visual; estado real en store.filterHidePreorder
  mostrarPopupEnvioGratis = false;
  mostrarPanelFiltros = false; // nuevo panel combinando ordenar + presentaciones
  // Umbral fijo en USD para envío gratis (productos sin descuento)
  private readonly FREE_SHIPPING_THRESHOLD_USD = 20;
  get freeShippingThresholdUsd() { return this.FREE_SHIPPING_THRESHOLD_USD; }
  get freeShippingThresholdBs(): number {
    const tasa = this.store.tasaBCV();
    if (!tasa || tasa <= 0) return 0;
    return this.FREE_SHIPPING_THRESHOLD_USD * tasa;
  }
  // Derivar idiomas disponibles según productos actuales y categoría (opcional)
  get availableLanguages(): { label: string; value: string; disabled?: boolean }[] {
    // Facet de idiomas: aplica todos los filtros activos EXCEPTO el propio de idiomas.
    // Incluye filtros de franquicias (multi + legacy), presentaciones, búsqueda, preventa.
    const fixedOrder: { value: ValoresSKP2 | 'ES' | 'MX'; label: string }[] = [
      { value: 'EN', label: 'Inglés' },
      { value: 'ES', label: 'Español España' },
      { value: 'MX', label: 'Español LATAM' },
      { value: 'KR', label: 'Coreano' },
      { value: 'JP', label: 'Japonés' },
      { value: 'CN', label: 'Chino' },
      { value: 'NA', label: 'Sin idioma' },
    ];

    // Partimos de products y aplicamos mismos filtros que filteredProducts menos el de idiomas.
    const hidePre = this.store.filterHidePreorder();
    const legacyCat = this.store.filterCategory();
    const multiCats = this.store.filterCategories();
    const hasMulti = multiCats.length > 0;
    const presentationsFilter = this.store.filterPresentations();
    const norm = (s:string)=> (s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
    const search = norm(this.store.filterSearch());

    const base = this.store.products().filter(p => {
      if (hidePre && p.inventario.preventa) return false;
      // aplicar franquicias si existen (multi tiene prioridad sobre legacy)
      if (hasMulti) {
        if (!multiCats.includes(p.skp1 || '')) return false;
      } else if (legacyCat && p.skp1 !== legacyCat) return false;
      if (search && !norm(p.nombre).includes(search)) return false;
      if (presentationsFilter.length && !presentationsFilter.includes(p.skp4 || '')) return false;
      return true;
    });

    // Contar por idioma bruto (ES y MX separados)
    const countsRaw = base.reduce<Record<string, number>>((acc, p) => {
      const code = p.skp2 || 'NA';
      acc[code] = (acc[code] || 0) + 1;
      return acc;
    }, {});
    const orderIndex = new Map(fixedOrder.map((f, i) => [f.value, i] as const));
    const enriched = fixedOrder.map(item => {
      const count = countsRaw[item.value] || 0;
      return { value: item.value, label: `${item.label} (${count})`, disabled: count === 0, _count: count } as any;
    }).sort((a: any, b: any) => {
      // 1. Orden principal: count desc
      if (b._count !== a._count) return b._count - a._count;
      // 2. Segundo criterio: habilitados antes que deshabilitados (count será 0 en disabled)
      if (a._count === 0 && b._count === 0) {
        // Ambos 0: mantener orden base definido (para consistencia visual)
        return (orderIndex.get(a.value) ?? 999) - (orderIndex.get(b.value) ?? 999);
      }
      return (orderIndex.get(a.value) ?? 999) - (orderIndex.get(b.value) ?? 999);
    });
    return enriched.map(({ _count, ...rest }: any) => rest);
  }

  get availablePresentations(): {label:string, value:string, disabled?: boolean}[] {
    // Facet de presentaciones: aplica franquicias, idiomas, búsqueda, preventa; ignora su propio filtro de presentaciones.
    const hidePre = this.store.filterHidePreorder();
    const legacyCat = this.store.filterCategory();
    const multiCats = this.store.filterCategories();
    const hasMulti = multiCats.length > 0;
    const langs = this.store.filterLanguages();
    const norm = (s:string)=> (s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
    const search = norm(this.store.filterSearch());

    const base = this.store.products().filter(p => {
      if (hidePre && p.inventario.preventa) return false;
      if (hasMulti) {
        if (!multiCats.includes(p.skp1 || '')) return false;
      } else if (legacyCat && p.skp1 !== legacyCat) return false;
      if (search && !norm(p.nombre).includes(search)) return false;
      if (langs.length && !langs.includes(p.skp2 || 'NA')) return false; // aplicamos idiomas elegidos
      return true;
    });

    const countsRaw = base.reduce<Record<string, number>>((acc, p) => {
      const code = p.skp4 || '';
      if (!code) return acc;
      acc[code] = (acc[code] || 0) + 1;
      return acc;
    }, {});

    // Partir de las presentaciones realmente mapeables mediante store.presentation
    const allCodes = new Set<string>(Object.keys(countsRaw));
    // También añadir las actualmente seleccionadas aunque ahora cuenten 0 para que el usuario pueda verlas y limpiarlas
    this.store.filterPresentations().forEach(c => allCodes.add(c));

    const mapped = Array.from(allCodes)
      .map(code => ({ code, label: this.store.presentation(code) }))
      .filter(x => x.label && x.label !== 'N/A');

    const byLabel = new Map<string, string>();
    for (const m of mapped) {
      if (!byLabel.has(m.label)) byLabel.set(m.label, m.code); // primera ocurrencia
    }
    const finalList = Array.from(byLabel.entries())
      .map(([label, code]) => {
        const count = countsRaw[code] || 0;
        return { label: `${label} (${count})`, value: code, disabled: count === 0, _count: count };
      })
      .sort((a, b) => {
        if (b._count !== a._count) return b._count - a._count; // cantidad desc
        return a.label.localeCompare(b.label, 'es');
      })
      .map(({ _count, ...rest }) => rest);

    return finalList;
  }
  // Franquicias disponibles con conteos (para MultiSelect de filtros) ignorando el propio filtro de franquicias
  get availableFranchises(): { label: string; value: string; disabled?: boolean }[] {
    const hidePre = this.store.filterHidePreorder();
    const norm = (s:string)=> (s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
    const search = norm(this.store.filterSearch());
    const presentations = this.store.filterPresentations();
    const langs = this.store.filterLanguages();
    const selected = this.store.filterCategories();

    // Base sin aplicar franquicias para poder calcular conteos potenciales
    const base = this.store.products().filter(p => {
      if (hidePre && p.inventario.preventa) return false;
      if (search && !norm(p.nombre).includes(search)) return false;
      if (presentations.length && !presentations.includes(p.skp4 || '')) return false;
      if (langs.length && !langs.includes(p.skp2 || 'NA')) return false;
      return true;
    });

    const counts = base.reduce<Record<string, number>>((acc, p) => {
      const cat = p.skp1 || 'N/A';
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    }, {});

    const labelMap: Record<string,string> = {
      POK: 'Pokémon',
      ACC: 'Accesorios y más',
      LOR: 'Lorcana',
      DIG: 'Digimon',
      DBF: 'Dragon Ball',
      OPI: 'One Piece',
      MTG: 'Magic The Gathering',
      YGO: 'Yu-Gi-Oh!',
    };

    // Unión de categorías presentes y seleccionadas para permitir limpiar filtros
    const all = new Set<string>([...Object.keys(counts), ...selected]);
    const entries = Array.from(all).map(cat => {
      const c = counts[cat] || 0;
      const friendly = labelMap[cat] || cat;
      return {
        value: cat,
        label: `${friendly} (${c})`,
        disabled: c === 0,
        _c: c,
        _friendly: friendly,
      } as any;
    }).sort((a,b) => {
      if (b._c !== a._c) return b._c - a._c; // mayor a menor
      return a._friendly.localeCompare(b._friendly, 'es'); // empate: alfabético
    }).map(({_c, _friendly, ...rest}) => rest);

    return entries;
  }
  customOptions: OwlOptions = {
    loop: true,
    mouseDrag: true,
    touchDrag: true,
    pullDrag: true,
    dots: false,
    navSpeed: 250,
    autoplay: true,
    autoplayHoverPause: true,
    autoplaySpeed: 700,
    autoplayTimeout: 3500,
    autoplayMouseleaveTimeout: 2100,
    navText: [
      '<i class="pi pi-chevron-left"></i>',
      '<i class="pi pi-chevron-right"></i>',
    ],
    responsive: {
      0: { items: 2 },
      400: { items: 2 },
      740: { items: 4.7 },
      940: { items: 5.7 },
    },
    nav: true,
    dotsEach: true,
  };

  constructor(
    private route: ActivatedRoute,
    private messageService: MessageService
  ) {}

  ngOnInit() {
    console.log('[ListadoProductosComponent] ngOnInit -> calling store.loadAll()');
    this.route.paramMap.subscribe(params => {
      const cat = params.get('franquicia') ?? '';
      this.categoriaActiva = cat;
      this.store.filterCategory.set(cat);
    });
    // Ruta ya no fuerza viewMode; se controla desde header via store.viewMode
    this.listadoCategorias = this.obtenerCategorias();
    this.store.loadAll();
  }

  // Número de filtros activos (excluye si sort es popularidad y sin filtros)
  get activeFiltersCount(): number {
    // Contar por grupo, no por cantidad interna
    let count = 0;
    const anyFranquicia = !!this.categoriaActiva || this.store.filterCategories().length > 0;
    if (anyFranquicia) count++;
    if (this.store.filterPresentations().length) count++;
    if (this.store.filterLanguages().length) count++;
    // (Opcionales: activar si se quieren contar) búsqueda, preventa, sort, viewMode
    // if (this.store.filterSearch().trim()) count++; // <-- desactivado según requerimiento actual
    // if (this.ocultarPreventa) count++;
    // if (this.store.viewMode() === 'promociones') count++;
    // if (this.store.sortBy() !== 'popularidad') count++;
    return count;
  }

  // Exponer y manipular filtros de orden/presentación
  sortOptions = [
    { label: 'Popularidad (default)', value: 'popularidad' },
    { label: 'Precio ↑', value: 'precio-asc' },
    { label: 'Precio ↓', value: 'precio-desc' },
    { label: 'Nombre', value: 'nombre' },
  ];
  get sortBy() { return this.store.sortBy(); }
  setSort(option: string) { this.store.sortBy.set(option); }

  get selectedPresentations() { return this.store.filterPresentations(); }
  setPresentations(vals: string[]) { this.store.filterPresentations.set(vals); }

  clearFiltros() {
    this.store.filterPresentations.set([]);
    this.store.filterLanguages.set([]);
    this.store.filterCategories.set([]);
    this.store.sortBy.set('popularidad');
    this.store.filterSearch.set('');
    this.store.viewMode.set('all');
    this.ocultarPreventa = false;
    this.store.filterHidePreorder.set(false);
    this.mostrarPanelFiltros = false;
  }

  openFiltros() {
    this.mostrarPanelFiltros = true;
    // Eliminamos el scroll agresivo que causaba salto. Opcionalmente podríamos centrar suavemente si el diálogo queda fuera, pero por ahora no.
    // Mantener lógica futura: si se detectan que el diálogo aparece parcialmente fuera, hacer ajuste mínimo.
    try {
      if (typeof window !== 'undefined' && window.innerWidth < 640) {
        const raf = window.requestAnimationFrame.bind(window);
        raf(() => {
          const el = document.querySelector('p-dialog[header="Filtros y Orden"] .p-dialog-content') as HTMLElement | null;
          if (!el) return;
          // Sólo si está completamente por debajo del viewport hacemos un scroll leve (no al final total)
          const rect = el.getBoundingClientRect();
          if (rect.top > window.innerHeight * 0.85) {
            window.scrollBy({ top: rect.top - window.innerHeight * 0.6, behavior: 'smooth' });
          }
        });
      }
    } catch { /* noop */ }
  }

  // Desplaza el contenedor al viewport cuando abre un overlay (mobile)
  autoScrollIntoView(elRef?: Element | null) {
    try {
      if (typeof window === 'undefined') return;
      if (window.innerWidth >= 640) return; // solo móvil
      const el = (elRef as HTMLElement) || null;
      if (!el) return;
      // espera a que el overlay esté en el DOM
      const raf = window.requestAnimationFrame.bind(window);
      raf(() => raf(() => {
        const rect = el.getBoundingClientRect();
        const isVisible = rect.top >= 0 && rect.bottom <= window.innerHeight;
        if (isVisible) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }));
    } catch {}
  }

  // (Versión mejorada de availablePresentations añadida arriba con conteos y disabled)

  // Getters para exponer signals sin cambiar el template existente
  get productos() { return this.store.products(); }
  get productosOrdenados() {
    const all = this.store.filteredProducts();
    if (this.store.viewMode() === 'promociones') {
      const ids = new Set(this.store.productsDescuento().map(p => p.idProducto));
      return all.filter(p => ids.has(p.idProducto));
    }
    if (this.store.viewMode() === 'preventa') {
      const ids = new Set(this.store.productsPreventa().map(p => p.idProducto));
      return all.filter(p => ids.has(p.idProducto));
    }
    return all;
  }
  // Exponer listas para carruseles
  get productosPreventa() { return this.store.productsPreventa(); }
  get productosDescuento() { return this.store.productsDescuento(); }
  get productosCalidadPrecio() { return this.store.productsCalidadPrecio(); }
  // Control si mostramos carruseles
  get mostrarCarruseles() { return this.store.viewMode() === 'all' && this.store.showCarousels(); }

  toggleCategoria(categoria: string) {
    // Soporta multiselección: si viene de ruta (categoriaActiva) mantenemos compatibilidad
    const multi = this.store.filterCategories();
    const set = new Set(multi);
    if (set.has(categoria)) set.delete(categoria); else set.add(categoria);
    this.store.filterCategories.set(Array.from(set));
    // Ajustar categoriaActiva sólo si había una legacy activa y se está quitando
    if (this.categoriaActiva === categoria && set.has(categoria) === false) {
      this.categoriaActiva = '';
      this.store.filterCategory.set('');
    }
    this.feedbackFiltro();
  }

  toggleOcultarPreventa() {
    this.store.filterHidePreorder.set(this.ocultarPreventa);
    this.feedbackFiltro();
  }

  // búsqueda ahora en encabezado

  filtrarDescuentos() {
    this.mostrarDescuentos = !this.mostrarDescuentos; // placeholder
  }

  obtenerCategorias(): any[] {
    return this.productosService.obtenerCategorias();
  }

  // Toggle de divisas ahora está en el encabezado

  private feedbackFiltro() {
    this.messageService.add({
      severity: 'success',
      summary: 'Filtro aplicado',
      detail: 'Revisa el listado de productos abajo⬇️',
    });
  }

  // Determina el número mínimo de ítems visibles según el breakpoint actual
  private getCarouselMinVisibleItems(): number {
    try {
      const resp: any = (this.customOptions as any)?.responsive || {};
      const width = typeof window !== 'undefined' ? window.innerWidth : 1024;
      const bps = Object.keys(resp).map(n => Number(n)).sort((a, b) => a - b);
      let items = 1;
      for (const bp of bps) {
        if (width >= bp) {
          const val = resp[bp]?.items;
          if (typeof val === 'number') {
            items = Math.ceil(val);
          }
        }
      }
      return Math.max(items, 1);
    } catch {
      return 6;
    }
  }

  // Asegura que los carruseles tengan al menos `min` (o el visible dinámico) repitiendo los productos
  carouselItems(list: Producto[] | null | undefined, min?: number): Producto[] {
    // Nueva lógica solicitada:
    // Si la lista tiene menos que "min" (ej: 6) entonces se DUPLICA el array completo
    // en múltiplos completos (sin recortes parciales) hasta cumplir:
    // - Al menos "min" elementos
    // - Al menos 2 veces el array original (para n>=3 esto ya es 2*n, para n<3 puede requerir más repeticiones)
    // Ejemplos esperados:
    // 5 -> 10 (2x)
    // 3 -> 6  (2x)
    // 2 -> 6  (3x)
    // 1 -> 6  (6x)
    // 4 -> 8  (2x) (no especificado pero consistente con la regla)
    const required = typeof min === 'number' ? min : this.getCarouselMinVisibleItems();
    const src = Array.isArray(list) ? list : [];
    const n = src.length;
    if (n === 0) return [];
    if (n >= required) return src; // Suficiente, no duplicar

    // Número de copias completas necesarias
    const copies = Math.max(2, Math.ceil(required / n));
    const out: Producto[] = [];
    for (let i = 0; i < copies; i++) {
      out.push(...src);
    }
    return out; // Siempre múltiplo de n y >= required
  }
}
