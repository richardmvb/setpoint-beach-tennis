interface SetpointRuntimeConfig {
  supabaseUrl?: string;
  publishableKey?: string;
  buildId?: string;
  buildVersion?: number;
  production?: boolean;
  lockScreenEnabled?: boolean;
  posthogKey?: string;
  posthogHost?: string;
}

interface Window {
  __SETPOINT_CONFIG__?: SetpointRuntimeConfig;
}
