import { Injectable, PLATFORM_ID, effect, signal, computed, inject } from '@angular/core';
import { MessageService } from 'primeng/api';
import { environment } from '../../environments/environment';
import { SwUpdate, VersionEvent, VersionReadyEvent } from '@angular/service-worker';
import { isPlatformBrowser } from '@angular/common';

// Keys for localStorage to track user acknowledgement
const LS_SEEN_VERSION = 'appVersionSeen';

@Injectable({ providedIn: 'root' })
export class VersionService {
  private swUpdate = inject(SwUpdate, { optional: true });
  private message = inject(MessageService, { optional: true });
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  // Current application version baked at build time
  readonly currentVersion = environment.appVersion;

  // Latest version detected remotely (may differ from current when update available)
  private latestVersionSig = signal<string | null>(null);
  readonly latestVersion = computed(() => this.latestVersionSig() ?? this.currentVersion);

  // Whether an update is available (SW or remote fetch mismatch)
  private updateAvailableSig = signal(false);
  readonly updateAvailable = computed(() => this.updateAvailableSig());

  // Whether user already acknowledged currentVersion (to suppress banner if no newer version)
  private seenVersion = signal<string | null>(null);

  constructor() {
    // Load seen version from storage
    if (!this.isBrowser) {
      return;
    }

    try {
      this.seenVersion.set(localStorage.getItem(LS_SEEN_VERSION));
    } catch {
      /* ignore */
    }

    // Service Worker driven update detection
    if (this.swUpdate?.isEnabled) {
      effect(() => {
        this.swUpdate?.versionUpdates.subscribe((evt: VersionEvent) => {
          if (evt.type === 'VERSION_READY') {
            const ready = evt as VersionReadyEvent;
            const newVer = (ready.latestVersion.appData as any)?.version || this.extractNgHash(ready.latestVersion.hash) || 'unknown';
            this.latestVersionSig.set(newVer);
            if (newVer !== this.currentVersion) this.flagUpdate(newVer);
          }
        });
      });
    } else {
      // Fallback polling when SW disabled (dev) using version.json
      this.pollRemoteVersion();
      // Poll every 5 minutes (lightweight ~ few bytes)
      setInterval(() => this.pollRemoteVersion(), 5 * 60_000);
    }

    // If there is a mismatch between stored seen version and current one, mark as not seen to allow banner if remote differs
    if (this.seenVersion() !== this.currentVersion) {
      // Do nothing now; banner will appear only when updateAvailable true.
    }
  }

  private extractNgHash(hash: string): string | null {
    if (!hash) return null;
    return hash.substring(0, 8);
  }

  private async pollRemoteVersion() {
    if (!this.isBrowser) return;
    try {
      const res = await fetch('/version.json', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json().catch(() => null) as { version?: string } | null;
        const remoteVersion = data?.version;
        if (remoteVersion && remoteVersion !== this.currentVersion) this.flagUpdate(remoteVersion);
      }
    } catch {
      // Silent; network unreachable or file missing
    }
  }

  private flagUpdate(newVer: string) {
    this.latestVersionSig.set(newVer);
    this.updateAvailableSig.set(true);
    if (this.message) {
      this.message.add({ severity: 'info', summary: 'Actualización disponible', detail: `Versión ${newVer}`, life: 8000 });
    }
  }

  acknowledgeCurrent() {
    if (!this.isBrowser) return;
    try {
      localStorage.setItem(LS_SEEN_VERSION, this.currentVersion);
      this.seenVersion.set(this.currentVersion);
    } catch {
      /* ignore */
    }
  }

  async activateUpdateAndReload() {
    if (!this.isBrowser) return;
    try {
      if (this.swUpdate && this.swUpdate.isEnabled) {
        await this.swUpdate.activateUpdate();
      }
    } catch {
      // ignore
    } finally {
      location.reload();
    }
  }

  async hardReload() {
    if (!this.isBrowser) return;
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k).catch(() => false)));
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister().catch(() => false)));
      }
    } catch {
      // ignore
    } finally {
      location.reload();
    }
  }
}
