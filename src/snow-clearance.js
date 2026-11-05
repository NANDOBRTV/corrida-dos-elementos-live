// World-space winter dressing must never overlap the drivable asphalt.
// Values are in visual-world meters; physics and gift obstacles are unaffected.
import {trackCenter,trackPoint,COURSE_LENGTH} from "./track-path.js";
export const ROAD_HALF_WIDTH=9.45;
export const SNOW_BUFFER=2.4;
export const SNOW_NEAR_ROAD=ROAD_HALF_WIDTH+SNOW_BUFFER;
export function snowbankProfile(side,variation){
  const v=Math.max(0,Math.min(6,Math.trunc(variation)||0));
  const width=2.1+v*.2;
  const center=14.4+v*.38;
  return {x:(side<0?-1:1)*center,width,depth:5.3+v*.35,top:.14};
}
export function roadsideClearance(profile){
  return Math.abs(profile.x)-profile.width/2-ROAD_HALF_WIDTH;
}
// The track doubles back beside itself. Skip a snow mound when any OTHER arm
// of the winding road would pass under the mound's full footprint.
export function clearOfWTrack(distance,profile){
  const pos=trackPoint(distance,profile.x);
  const margin=ROAD_HALF_WIDTH+SNOW_BUFFER+
    Math.hypot(profile.width/2,profile.depth/2);
  for(let d=0;d<COURSE_LENGTH;d+=2){
    const center=trackCenter(d);
    if(Math.hypot(center.x-pos.x,center.z-pos.z)<margin)return false;
  }
  return true;
}
