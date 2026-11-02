const runtimeConfig = window.__SETPOINT_CONFIG__;

export const environment = {
  production: runtimeConfig?.production ?? false,
  lockScreenEnabled: runtimeConfig?.lockScreenEnabled ?? false,
  posthogKey: runtimeConfig?.posthogKey,
  posthogHost: runtimeConfig?.posthogHost,
};
