// Deterministic appearance only. Visual cosmetics never modify speed or race physics.
// Stable IDs maintain the same appearance between sessions and SSE reconnects.
import {hash} from "./engine.js";
export function appearanceForRunner(id){
  const seed=hash(String(id));
  const variant=seed%5;
  const vehicle=seed%10===2?"kart":seed%10===7?"moto":"foot";
  return {variant,vehicle};
}
