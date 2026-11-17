import type { BrowserContextOptions } from "playwright";
type Device = BrowserContextOptions & {
  viewport: { width: number; height: number };
  screen: { width: number; height: number };
};
export const macBookAir13: Device;
export const iphone14Pro: Device;
export const iphone14ProLandscape: Device;
export const iphone14ProFullHeight: Device;
