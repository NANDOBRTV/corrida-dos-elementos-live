// Aparência determinística original em proporções humanoides blocadas (R6-like).
// Não baixa nem afirma representar modelos oficiais/roupas licenciadas do Roblox.
// Cosméticos nunca mudam a corrida, a velocidade ou a chance de vitória.
import {hash} from "./engine.js";

export function appearanceForRunner(id){
  const seed=hash(String(id));
  const variant=seed%5;
  // Preserve the historical kart/motorbike mapping for saved game visuals.
  const vehicle=seed%10===2?"kart":seed%10===7?"moto":seed%13===5?"jetpack":"foot";
  return {
    variant,vehicle,
    outfit:Math.floor(seed/37)%8,
    hairStyle:Math.floor(seed/113)%5,
    headwear:Math.floor(seed/631)%5,
    accessory:Math.floor(seed/1543)%4
  };
}
