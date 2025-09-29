import { Injectable } from '@angular/core';
import { SwUpdate, VersionEvent, UnrecoverableStateEvent } from '@angular/service-worker';

@Injectable({ providedIn: 'root' })
export class SwUpdatesService {
  constructor(private swUpdate: SwUpdate) {
    // Subscribe immediately; in dev swUpdate.isEnabled is false
    this.bindUpdates();
  }

  private bindUpdates() {
    try {
      if (typeof window === 'undefined' || typeof document === 'undefined') {
        return;
      }
      if (!this.swUpdate.isEnabled) {
        return; // No SW in dev
      }
      this.swUpdate.versionUpdates.subscribe(async (event: VersionEvent) => {
        switch (event.type) {
          case 'VERSION_DETECTED':
            // A new version is downloading
            console.info('[SW] New version detected:', event.version.hash);
            break;
          case 'VERSION_READY':
            // New version ready to activate
            console.info('[SW] Version ready. Current:', event.currentVersion?.hash, ' -> Latest:', event.latestVersion.hash);
            const shouldReload = window.confirm('Hay una nueva versión de la app. ¿Actualizar ahora?');
            if (shouldReload) {
              try {
                await this.swUpdate.activateUpdate();
              } catch (e) {
                console.warn('[SW] activateUpdate failed', e);
              }
              document.location.reload();
            }
            break;
          case 'VERSION_INSTALLATION_FAILED':
            console.error('[SW] Version installation failed:', event.error);
            break;
          case 'NO_NEW_VERSION_DETECTED':
            // Nothing to do
            break;
        }
      });

  this.swUpdate.unrecoverable.subscribe((event: UnrecoverableStateEvent) => {
        console.error('[SW] Unrecoverable state', event.reason);
        const shouldReload = window.confirm('Se detectó un problema con la caché. ¿Recargar la app?');
        if (shouldReload) {
          document.location.reload();
        }
      });
    } catch (err) {
      console.warn('[SW] bindUpdates error', err);
    }
  }
}
