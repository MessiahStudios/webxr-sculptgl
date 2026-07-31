var Tablet = {
  radiusFactor: 0.75, // the pen pressure acts on the tool's radius
  intensityFactor: 0.0, // the pen pressure acts on the tool's intensity
  pressure: 0.5,
  /** When true, pressure is absolute 0–1 from XR trigger (not pen tablet neutral curve). */
  xrAnalog: false
};

Tablet.getPressureIntensity = function () {
  if (Tablet.xrAnalog)
    return Math.max(0.08, Math.min(1.0, Tablet.pressure));
  return 1.0 + Tablet.intensityFactor * (Tablet.pressure * 2.0 - 1.0);
};

Tablet.getPressureRadius = function () {
  if (Tablet.xrAnalog)
    return Math.max(0.5, Math.min(1.0, 0.55 + Tablet.pressure * 0.45));
  return 1.0 + Tablet.radiusFactor * (Tablet.pressure * 2.0 - 1.0);
};

Tablet.clearXRAnalog = function () {
  Tablet.xrAnalog = false;
  Tablet.pressure = 0.5;
};

export default Tablet;
