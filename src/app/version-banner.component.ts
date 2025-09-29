import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { VersionService } from './services/version.service';

@Component({
  selector: 'app-version-banner',
  template: `
    @if (vs.updateAvailable()) {
      <div class="overlay" role="dialog" aria-modal="true" aria-label="Actualización disponible">
        <div class="panel">
          <h2>Nueva versión disponible</h2>
          <p>
            Tienes la versión <code>{{ vs.currentVersion }}</code> y está lista la
            <strong>{{ vs.latestVersion() }}</strong>.
          </p>
          <p class="hint">Debes actualizar para continuar usando la aplicación.</p>
          <div class="actions">
            <button type="button" class="btn primary" (click)="reload()">Actualizar ahora</button>
            <button type="button" class="btn ghost" (click)="hardReload()" title="Forzar limpieza de caché">
              Recarga limpia
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `:host{display:contents}`,
    `.overlay{position:fixed;inset:0;background:rgba(3,18,29,.82);backdrop-filter:blur(4px);z-index:3000;display:flex;align-items:center;justify-content:center;padding:1rem;}`,
    `.panel{background:#0d2538;color:#fff;max-width:420px;width:100%;border:1px solid #16384f;border-radius:12px;padding:1.25rem 1.5rem;box-shadow:0 6px 18px -2px rgba(0,0,0,.5);display:flex;flex-direction:column;gap:.75rem;}`,
    `.panel h2{margin:0;font-size:1.15rem;line-height:1.2;font-weight:600;}`,
    `.panel code{background:#12364d;padding:2px 4px;border-radius:4px;font-size:.8rem;}`,
    `.hint{font-size:.8rem;opacity:.85;margin:.25rem 0 0;}`,
    `.actions{display:flex;flex-wrap:wrap;gap:.75rem;margin-top:.5rem;}`,
    `.btn{border:none;cursor:pointer;font-weight:600;border-radius:6px;padding:.6rem 1rem;font-size:.8rem;letter-spacing:.3px;}`,
    `.btn.primary{background:#30b6ff;color:#062438;}`,
    `.btn.ghost{background:transparent;color:#c6eaff;border:1px solid #346d8e;}`,
    `.btn:hover{filter:brightness(1.08);}`
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class VersionBannerComponent {
  protected vs = inject(VersionService);

  reload() { this.vs.activateUpdateAndReload(); }
  hardReload() { this.vs.hardReload(); }
}
