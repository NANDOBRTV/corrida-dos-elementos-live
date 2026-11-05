// Lightweight video-style broadcast choreography. Only existing camera moves;
// adds zero geometry, zero draw calls, and never changes race state.
export const CAMERA_CYCLE_MS=50000;
function smoothstep(v){
  const t=Math.max(0,Math.min(1,v));return t*t*(3-2*t);
}
function pulse(t,enter,fullStart,fullEnd,exit){
  return Math.min(smoothstep((t-enter)/(fullStart-enter)),
    smoothstep((exit-t)/(exit-fullEnd)));
}
export function cameraShot(raceMs=0,overview=0){
  const seconds=(Math.max(0,Number(raceMs)||0)%CAMERA_CYCLE_MS)/1000;
  const drone=Math.max(
    pulse(seconds,14,18,23,28),
    pulse(seconds,34,38,44,49)
  );
  const closeChase=Math.max(
    pulse(seconds,5,7,11,14),
    pulse(seconds,28,30,33,36)
  );
  const curve=Math.max(0,Math.min(1,Number(overview)||0));
  return {
    back:Math.min(108,26+40*curve+52*drone-3*closeChase),
    height:Math.min(85,13+50*curve+34*drone-2*closeChase),
    ahead:12+13*curve+11*drone,
    lateral:drone*Math.sin(seconds*.47)*5.5,
    mode:drone>.7?"AÉREA":closeChase>.7?"PELOTÃO":"ACOMPANHAMENTO"
  };
}
