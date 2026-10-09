// How the attack mode is played, per user request: on a phone (a touch
// screen) the army is automatic -- the player buys units and zooms with two
// fingers (autoArmy.js); on a PC the player commands it with the mouse
// (attackControls.js). Settings › Controles can force either one; «auto»
// goes by the device.
export const CONTROL_SETTINGS = ["auto", "touch", "mouse"];

// The device's own: a touch screen as its main pointer (phones, tablets).
// A laptop with a touch screen still has a mouse or touchpad as its main
// pointer, so it counts as a PC. `env`: { coarsePointer, maxTouchPoints }.
export function detectControls(env) {
  return env.coarsePointer && env.maxTouchPoints > 0 ? "touch" : "mouse";
}

// The controls in use: the setting's, or the device's under «auto».
export function resolveControls(setting, env) {
  return setting === "touch" || setting === "mouse" ? setting : detectControls(env);
}

// The browser's answers for detectControls.
export function browserControlsEnv() {
  if (typeof window === "undefined") return { coarsePointer: false, maxTouchPoints: 0 };
  return {
    coarsePointer: Boolean(window.matchMedia?.("(pointer: coarse)").matches),
    maxTouchPoints: navigator.maxTouchPoints || 0,
  };
}
