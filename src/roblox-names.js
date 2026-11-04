// Nome informado no chat não é prova de propriedade da conta.
export function validRobloxUsername(value){
  return typeof value==="string"&&/^[A-Za-z0-9_]{3,20}$/.test(value)&&
    !value.startsWith("_")&&!value.endsWith("_");
}
export function parseRaceJoin(text){
  if(typeof text!=="string"||text.length>60)return null;
  const match=/^\s*entrar(?:\s+([A-Za-z0-9_]{3,20}))?\s*$/i.exec(text);
  if(!match)return null;
  if(!match[1])return {mode:"demo",username:null,content:"entrar"};
  if(!validRobloxUsername(match[1]))return null;
  return {mode:"roblox",username:match[1],content:"entrar "+match[1]};
}
