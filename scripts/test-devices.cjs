const { devices } = require("playwright");

// Lily's reference laptop viewport, including Retina rendering.
const macBookAir13 = {
  viewport: { width: 1680, height: 1050 },
  screen: { width: 1680, height: 1050 },
  deviceScaleFactor: 2,
  isMobile: false,
  hasTouch: false,
};
const { defaultBrowserType: portraitEngine, ...iphone14Pro } =
  devices["iPhone 14 Pro"];
const { defaultBrowserType: landscapeEngine, ...iphone14ProLandscape } =
  devices["iPhone 14 Pro landscape"];
const iphone14ProFullHeight = {
  ...iphone14Pro,
  viewport: { ...iphone14Pro.screen },
};

module.exports = {
  macBookAir13,
  iphone14Pro,
  iphone14ProLandscape,
  iphone14ProFullHeight,
};
