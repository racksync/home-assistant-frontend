import type { HassEntity } from "home-assistant-js-websocket";

export const supportsFeature = (
  stateObj: HassEntity,
  feature: number
): boolean => supportsFeatureFromAttributes(stateObj.attributes, feature);

export const supportsFeatureFromAttributes = (
  attributes: Record<string, any>,
  feature: number
): boolean =>
  // eslint-disable-next-line no-bitwise
  (attributes.supported_features! & feature) !== 0;
