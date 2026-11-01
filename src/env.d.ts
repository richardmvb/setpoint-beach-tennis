interface SetpointRuntimeConfig {
  supabaseUrl?: string;
  publishableKey?: string;
  buildId?: string;
  production?: boolean;
  posthogKey?: string;
  posthogHost?: string;
}

interface Window {
  __SETPOINT_CONFIG__?: SetpointRuntimeConfig;
}
