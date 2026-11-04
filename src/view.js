// Acesso da câmera/transmissão não concede privilégios administrativos.
export function getViewMode(search="") {
  const params=new URLSearchParams(search.startsWith("?")?search.slice(1):search);
  return params.get("view")==="live"?"live":"operator";
}
export function broadcastLink(basePath="/") {
  const path=String(basePath||"/");
  return path+(path.includes("?")?"&":"?")+"view=live";
}
