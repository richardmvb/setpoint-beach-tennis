const runtimeConfig = window.__SETPOINT_CONFIG__;

export const environment = {
  production: runtimeConfig?.production ?? false,
  posthogKey: runtimeConfig?.posthogKey,
  posthogHost: runtimeConfig?.posthogHost,
};
