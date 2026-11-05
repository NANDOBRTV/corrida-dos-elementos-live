// Aparência determinística original em proporções humanoides blocadas (R6-like).
// Não baixa nem afirma representar modelos oficiais/roupas licenciadas do Roblox.
// Cosméticos nunca mudam a corrida, a velocidade ou a chance de vitória.
import {hash} from "./engine.js";

export function appearanceForRunner(id){
  const seed=hash(String(id));
  const variant=seed%5;
  // Carros e motos só são concedidos por eventos de presentes.
  const vehicle=seed%13===5?"jetpack":"foot";
  return {
    variant,vehicle,
    outfit:Math.floor(seed/37)%8,
    hairStyle:Math.floor(seed/113)%5,
    headwear:Math.floor(seed/631)%5,
    accessory:Math.floor(seed/1543)%4
  };
}
