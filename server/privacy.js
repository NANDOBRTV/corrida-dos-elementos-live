import {createHmac} from "node:crypto";

// Não publicar IDs internos da plataforma em snapshots ou SSE do jogo.
// O mesmo ID público é gerado em CHAT e GIFT com a mesma chave privada.
export function pseudonymizeTikTokUser(rawId,secret) {
  if(typeof secret!=="string"||secret.length<16)throw new Error("Segredo de identidade inválido");
  const input=String(rawId??"").trim();
  if(!input||input.length>128)throw new Error("Identificador TikTok inválido");
  return "tt-"+createHmac("sha256",secret).update("elemental-live-v1|"+input).digest("hex").slice(0,32);
}
