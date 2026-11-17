import { InjectionToken } from '@angular/core';

/** Whether the device has a network connection, and when that changes. */
export interface Connectivity {
  online(): boolean;
  /** Calls back when the connection comes or goes. Returns a function that stops the calls. */
  onChange(callback: (online: boolean) => void): () => void;
}
export const CONNECTIVITY = new InjectionToken<Connectivity>('Connectivity');
