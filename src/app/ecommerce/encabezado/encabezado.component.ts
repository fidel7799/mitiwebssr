import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, ViewChild, inject, signal, effect } from '@angular/core';
import { NgOptimizedImage, DecimalPipe, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Router, ActivatedRoute, NavigationEnd } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { BadgeModule } from 'primeng/badge';
import { DialogModule } from 'primeng/dialog';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { CartDrawerComponent } from '../cart-drawer/cart-drawer.component';
import { CartStore } from '../../stores/cart.store';
import { ProductStore } from '../../stores/product.store';

@Component({
  selector: 'app-encabezado',
  imports: [NgOptimizedImage, DecimalPipe, RouterLink, FormsModule, ButtonModule, InputTextModule, BadgeModule, DialogModule, ToggleSwitchModule, CartDrawerComponent],
  standalone: true,
  templateUrl: './encabezado.component.html',
  styleUrl: './encabezado.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EncabezadoComponent {
  @ViewChild(CartDrawerComponent) drawer!: CartDrawerComponent;
  private destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  scrolled = signal(false);
  menuOpen = signal(false);
  breadcrumbText = signal<string>('');
  // Estado de búsqueda
  searchOpenMobile = signal(false); // controla barra expandida debajo del header en mobile
  searchText = signal('');
  private searchDebounceHandle: any = null;
  private static readonly SEARCH_DEBOUNCE_MS = 300;

  constructor(public cart: CartStore, public product: ProductStore) {
    if (this.isBrowser) {
      // Add hysteresis and rAF throttling to avoid flicker near the top
      const ENTER = 24; // become compact when scrolling past this
      const EXIT = 8;   // expand again only when above this
      let lastY = window.scrollY || document.documentElement.scrollTop || 0;
      let ticking = false;
      let scrolledState = this.scrolled();

      const handle = () => {
        const y = lastY;
        if (!scrolledState && y > ENTER) {
          scrolledState = true;
          this.scrolled.set(true);
        } else if (scrolledState && y < EXIT) {
          scrolledState = false;
          this.scrolled.set(false);
        }
        ticking = false;
      };

      const onScroll = () => {
        lastY = window.scrollY || document.documentElement.scrollTop || 0;
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(handle);
        }
      };
      // initial compute
      handle();
      // passive scroll listener
      window.addEventListener('scroll', onScroll, { passive: true });
      this.destroyRef.onDestroy(() => window.removeEventListener('scroll', onScroll));
    }
    // Breadcrumbs from route
    const router = inject(Router);
    const route = inject(ActivatedRoute);
    const computeCrumb = () => {
      let r: ActivatedRoute | null = route;
      while (r?.firstChild) r = r.firstChild;
      const data = r?.snapshot.data || {};
      const params = r?.snapshot.params || {};
      if (data['vista'] === 'promociones') {
        this.breadcrumbText.set('Promociones');
        return;
      }
      if (data['vista'] === 'preventa') {
        this.breadcrumbText.set('Preventa');
        return;
      }
      const franquicia = params['franquicia'];
      if (franquicia) {
        this.breadcrumbText.set(String(franquicia));
        return;
      }
      this.breadcrumbText.set('');
    };
    computeCrumb();
    const sub = router.events.subscribe(ev => {
      if (ev instanceof NavigationEnd) computeCrumb();
    });
    this.destroyRef.onDestroy(() => sub.unsubscribe());

    // Efecto: si viewMode apunta a promociones/preventa y se quedan sin productos, volver a 'all'
    effect(() => {
      const vm = this.product.viewMode();
      // Early exit si ya estamos en 'all'
      if (vm === 'all') return;
      const emptyPromo = vm === 'promociones' && this.product.productsDescuento().length === 0;
      const emptyPre = vm === 'preventa' && this.product.productsPreventa().length === 0;
      if (emptyPromo || emptyPre) this.product.viewMode.set('all');
    });
  }
  refresh() {
    if (this.isBrowser) {
      window.location.reload();
    }
  }
  openCart() { this.drawer?.open(); }
  openMenu() { this.menuOpen.set(true); }
  closeMenu() { this.menuOpen.set(false); }
  toggleDivisas() { this.product.hideBolivares.set(!this.product.hideBolivares()); }
  goHome() {
    this.product.filterCategory.set('');
    this.product.filterCategories.set([]);
    this.product.viewMode.set('all');
    if (this.isBrowser) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    this.closeMenu();
  }
  setPromociones() {
    this.product.filterCategory.set('');
    this.product.filterCategories.set([]);
    this.product.viewMode.set('promociones');
    this.closeMenu();
    if (this.isBrowser) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }
  setPreventa() {
    this.product.filterCategory.set('');
    this.product.filterCategories.set([]);
    this.product.viewMode.set('preventa');
    this.closeMenu();
    if (this.isBrowser) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  // Búsqueda
  toggleSearchMobile() {
    const next = !this.searchOpenMobile();
    this.searchOpenMobile.set(next);
    if (!next) {
      // cerrar => limpiar y aplicar
      this.clearSearch();
    } else {
      // abrir => sincronizar con store existente
      this.searchText.set(this.product.filterSearch());
      if (this.isBrowser) {
        setTimeout(() => {
          const el = document.getElementById('headerSearchInput');
          el?.focus();
        }, 10);
      }
    }
  }
  applySearch(immediate = false) {
    if (this.searchDebounceHandle) {
      clearTimeout(this.searchDebounceHandle);
      this.searchDebounceHandle = null;
    }
    const nextValRaw = this.searchText().trim();
    const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const current = this.product.filterSearch();
    if (normalize(current) === normalize(nextValRaw)) return; // evitar trabajo innecesario
    const doSet = () => this.product.filterSearch.set(nextValRaw);
    if (immediate) {
      doSet();
    } else {
      this.searchDebounceHandle = setTimeout(doSet, EncabezadoComponent.SEARCH_DEBOUNCE_MS);
    }
  }
  clearSearch() {
    if (this.searchDebounceHandle) {
      clearTimeout(this.searchDebounceHandle);
      this.searchDebounceHandle = null;
    }
    this.searchText.set('');
    this.product.filterSearch.set('');
  }

  onSearchChange(value: string) {
    this.searchText.set(value);
    this.applySearch();
  }

  onSearchKey(ev: KeyboardEvent) {
    if (ev.key === 'Enter') {
      this.applySearch(true);
    } else if (ev.key === 'Escape') {
      this.toggleSearchMobile();
    }
  }

  get menuVisible() { return this.menuOpen(); }
  set menuVisible(v: boolean) { this.menuOpen.set(!!v); }
}
