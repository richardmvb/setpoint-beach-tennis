import { Injectable } from '@angular/core';
import type { Connectivity } from '../../ports/connectivity.port';

/** The browser's `online` and `offline` events. */
@Injectable({ providedIn: 'root' })
export class BrowserConnectivity implements Connectivity {
  online(): boolean {
    return navigator.onLine;
  }

  onChange(callback: (online: boolean) => void): () => void {
    const handler = (): void => callback(navigator.onLine);
    window.addEventListener('online', handler);
    window.addEventListener('offline', handler);
    return () => {
      window.removeEventListener('online', handler);
      window.removeEventListener('offline', handler);
    };
  }
}
