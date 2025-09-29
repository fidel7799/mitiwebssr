import { Injectable, signal, effect } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class FocusControlService {
  // Mientras sea true, evitamos que elementos interactivos (botones Añadir) sean enfocables
  private _blockInitialFocus = signal<boolean>(true);
  readonly blockInitialFocus = this._blockInitialFocus.asReadonly();

  private released = false;

  constructor() {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      this._blockInitialFocus.set(false);
      return;
    }
    const release = () => {
      if (this.released) return;
      this.released = true;
      this._blockInitialFocus.set(false);
      window.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('touchstart', onTouch, true);
    };

    const onPointer = () => release();
    const onTouch = () => release();
    const onKeyDown = (ev: KeyboardEvent) => {
      const key = ev.key;
      // Ignorar teclas de refresco (F5, Ctrl+R, Cmd+R)
      const isRefresh = key === 'F5' || ((key === 'r' || key === 'R') && (ev.ctrlKey || ev.metaKey));
      if (isRefresh) return;
      // Liberar solo con navegación/activación real por teclado
      const isNav = key === 'Tab' || key === 'Enter' || key === ' ';
      if (isNav) release();
    };

    window.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('touchstart', onTouch, true);
    // Fallback temporal por si no hay interacción
    setTimeout(release, 1500);

    // Añade una clase global mientras el bloqueo está activo (útil para CSS no intrusivo)
    effect(() => {
      const blocked = this._blockInitialFocus();
      const cls = 'block-initial-focus';
      const root = document.documentElement;
      if (blocked) {
        root.classList.add(cls);
        document.body.classList.add(cls);
      } else {
        root.classList.remove(cls);
        document.body.classList.remove(cls);
      }
    });

    // Mientras el bloqueo está activo, anula cualquier focus espontáneo
    const onFocusIn = (ev: FocusEvent) => {
      if (!this._blockInitialFocus()) return;
      const t = ev.target as HTMLElement | null;
      try { t?.blur?.(); } catch {}
    };
    document.addEventListener('focusin', onFocusIn, true);
    const cleanup = () => document.removeEventListener('focusin', onFocusIn, true);
    // Limpia el listener cuando se libere el bloqueo
    effect(() => { if (!this._blockInitialFocus()) cleanup(); });
  }
}