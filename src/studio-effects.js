// Studio V5: deterministic, allocation-bounded voxel effect descriptions.
// All events come from the authoritative race state. No client-generated gifts.
import {studioPositionOnCourse,studioCrowdPoses} from "./studio-camera.js";

export const STUDIO_EFFECT_LIMITS=Object.freeze({
  maxParts:192,maxEvents:60,visibilityBehind:92,visibilityAhead:158,
  maxParticlesPerEvent:8
});
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const num=(x,fallback=0)=>Number.isFinite(Number(x))?Number(x):fallback;
const PALETTE=Object.freeze({
  flame:[0xff642b,0xffcf4b,0xfff2a0],
  turboRain:[0xfff669,0x8cf1ff,0xff6d82],
  smoke:[0xf1f9ff,0xb4d3e2,0x7793a8],
  torpedo:[0x7ff7fb,0x49b9ff,0xffae55],
  explosion:[0xfff29b,0xffae41,0xf95a3a],
  impact:[0x8dfbff,0x4ad4fb,0xf8ffff],
  obstacleIce:[0x7ddaf2,0xd8f6ff,0x4d9abc],
  obstacleForest:[0x886040,0xa47747,0x4a8855],
  like:[0xffe46f,0x96f2ec,0xf8a04e]
});
function clampParts(value){
  const x=Math.trunc(num(value,STUDIO_EFFECT_LIMITS.maxParts));
  return clamp(x,0,STUDIO_EFFECT_LIMITS.maxParts);
}
function clockMs(state){return Math.max(0,num(state?.raceMs));}
function ageFraction(effect,now){
  const start=num(effect?.createdAt);
  const end=num(effect?.expiresAt,start+1);
  return clamp((now-start)/Math.max(1,end-start),0,1);
}
function positionBehind(p,distance,side=0,height=0){
  const heading=num(p?.heading);
  return {
    x:num(p?.x)-Math.sin(heading)*distance+Math.cos(heading)*side,
    y:num(p?.y)+height,
    z:num(p?.z)-Math.cos(heading)*distance-Math.sin(heading)*side,
    heading
  };
}
function inView(progress,center){
  const m=num(progress,-1);
  return m>=center-STUDIO_EFFECT_LIMITS.visibilityBehind &&
    m<=center+STUDIO_EFFECT_LIMITS.visibilityAhead;
}
export function buildStudioEffectParts(state,{centerMeters=0,maxParts,
  poses=null}={}){
  if(state?.phase!=="RUNNING")return [];
  const cap=clampParts(maxParts);
  if(cap===0)return [];
  const now=clockMs(state),center=Math.max(0,num(centerMeters));
  const runners=Array.isArray(state.active)?state.active.slice(0,100):[];
  const runnerMap=new Map(runners.map(r=>[r.id,r]));
  const positions=poses instanceof Map?poses:studioCrowdPoses(state);
  const effects=Array.isArray(state.effects)?state.effects.slice(0,STUDIO_EFFECT_LIMITS.maxEvents):[];
  const parts=[];
  const runningPose=id=>{
    const r=runnerMap.get(id);
    if(!r||r.status!=="running"||!inView(r.progress,center))return null;
    return positions.get(id)??studioPositionOnCourse(r.progress,r.lane);
  };
  const append=(kind,p,scale,color,index=0)=>{
    if(parts.length>=cap)return false;
    if(!p||![p.x,p.y,p.z,p.heading].every(Number.isFinite))return false;
    if(!Array.isArray(scale)||scale.some(x=>!(Number.isFinite(x)&&x>0)))return false;
    parts.push({kind,position:{x:p.x,y:p.y,z:p.z},
      heading:p.heading,scale,color:color>>>0,index});
    return true;
  };
  const eventTypes=new Set(["turbo-flame","jetpack-smoke","torpedo",
    "torpedo-explosion","ice-impact","obstacle","turbo-rain","like-boost"]);
  const visibleEvents=effects.filter(e=>
    e&&eventTypes.has(e.type)&&
    now>=num(e.createdAt)&&now<num(e.expiresAt,now+1));
  // Prioritize actual gift-driven track objects and explosions over ambient trails.
  visibleEvents.sort((a,b)=>{
    const priority={obstacle:0,"torpedo-explosion":1,torpedo:2,
      "ice-impact":3,"jetpack-smoke":4,"turbo-flame":5,
      "turbo-rain":6,"like-boost":7};
    return priority[a.type]-priority[b.type]||
      String(a.id??"").localeCompare(String(b.id??""));
  });
  const explicitTurbo=new Set(),explicitJet=new Set();
  for(const event of visibleEvents){
    if(parts.length>=cap)break;
    const type=event.type,t=ageFraction(event,now);
    if(type==="obstacle"){
      const meters=num(event.meters,-999);
      if(!inView(meters,center)||meters<0)continue;
      const lane=clamp(Math.trunc(num(event.lane,4)),0,9);
      const at=studioPositionOnCourse(meters,lane);
      const palette=state.mapId==="forest"?PALETTE.obstacleForest:PALETTE.obstacleIce;
      append(type,positionBehind(at,0,0,.53),[1.5,1.1,.95],palette[0]);
      append(type,positionBehind(at,0,0,1.12),[1.22,.25,.75],palette[1],1);
      continue;
    }
    if(type==="torpedo"){
      if(event.impacted)continue;
      const r=runnerMap.get(event.targetId);
      if(!r||r.status!=="running"||!inView(r.progress,center))continue;
      const pos=positions.get(r.id);
      if(!pos)continue;
      // Forward movement from behind the target. Only a visual torpedo.
      const fraction=clamp((now-num(event.createdAt))/1800,0,1);
      const at=positionBehind(pos,16*(1-fraction)+1,.0,1.3+Math.sin(fraction*Math.PI)*1);
      append(type,at,[.85,.32,.5],PALETTE.torpedo[0]);
      append(type,positionBehind(at,.45,0,0),[.33,.23,.23],PALETTE.torpedo[1],1);
      append(type,positionBehind(at,.8,0,0),[.45,.18,.18],PALETTE.torpedo[2],2);
      continue;
    }
    const runnerId=event.runnerId;
    const p=runningPose(runnerId);
    if(!p)continue;
    if(type==="turbo-flame"){
      explicitTurbo.add(runnerId);
      for(let i=0;i<3;i++){
        const wobble=.13*Math.sin(now*.015+i*2.1);
        append(type,positionBehind(p,1.0+i*.53,wobble,.48-i*.10),
          [.46-i*.07,.45-i*.06,.75],PALETTE.flame[i],i);
      }
    }else if(type==="jetpack-smoke"){
      explicitJet.add(runnerId);
      for(let i=0;i<4;i++){
        const phase=now*.002+i*1.7;
        const at=positionBehind(p,.8+i*.4,.35*Math.sin(phase),
          .55+i*.45+(t*.25));
        const size=.28+i*.12;
        append(type,at,[size,size,size],PALETTE.smoke[i%3],i);
      }
    }else if(type==="torpedo-explosion"||type==="ice-impact"){
      const palette=type==="ice-impact"?PALETTE.impact:PALETTE.explosion;
      const radius=.65+1.35*t;
      for(let i=0;i<6;i++){
        const angle=i*Math.PI/3;
        const at=positionBehind(p,-Math.cos(angle)*radius,
          Math.sin(angle)*radius,1.15+Math.sin(angle*2)*.55);
        const size=clamp(.50*(1-t)+.17,.17,.5);
        append(type,at,[size,size,size],palette[i%3],i);
      }
    }else if(type==="turbo-rain"||type==="like-boost"){
      const palette=type==="like-boost"?PALETTE.like:PALETTE.turboRain;
      const amount=type==="like-boost"?3:5;
      for(let i=0;i<amount;i++){
        const x=.65*Math.sin(i*2.7+now*.001),z=.65*Math.cos(i*2.4+now*.002);
        const at=positionBehind(p,z,x,1.3+((now*.001+i*.3)%2));
        append(type,at,[.24,.45,.24],palette[i%3],i);
      }
    }
  }
  // State fields are also available in local simulation; emitted event
  // descriptors provide the remote Live bridge fallback where turbo fields
  // are intentionally omitted from the compact spectator snapshot.
  const sortedRunners=runners.filter(r=>r.status==="running"&&inView(r.progress,center))
    .sort((a,b)=>Math.abs(num(a.progress)-center)-Math.abs(num(b.progress)-center)||
      String(a.id).localeCompare(String(b.id)));
  for(const r of sortedRunners){
    if(parts.length>=cap)break;
    const p=positions.get(r.id);
    if(!p)continue;
    if(num(r.turboUntil)>now&&!explicitTurbo.has(r.id)){
      for(let i=0;i<2;i++){
        append("turbo-flame",positionBehind(p,1+i*.5,0,.36),
          [.38,.36,.64],PALETTE.flame[i],i);
      }
    }
    if(num(r.jetpackUntil)>now&&!explicitJet.has(r.id)){
      for(let i=0;i<3;i++){
        append("jetpack-smoke",positionBehind(p,.8+i*.35,
          Math.sin(now*.002+i)*.2,.5+i*.4),
          [.32+i*.08,.32+i*.08,.32+i*.08],PALETTE.smoke[i],i);
      }
    }
  }
  return parts;
}
