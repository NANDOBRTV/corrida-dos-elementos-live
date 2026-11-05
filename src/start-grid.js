// Reference-video inspired 10-wide front-row grid. This never modifies official race progress.
import {trackCenter,trackPoint} from "./track-path.js";
export const GRID_COLUMNS=10;
export const GRID_ROW_GAP=2.85;
export function gridPosition(r,index=0){
  return Number.isInteger(r?.gridPosition)&&r.gridPosition>=1&&r.gridPosition<=50?
    r.gridPosition:index+1;
}
export function gridRow(r,index=0){
  return Math.floor((gridPosition(r,index)-1)/GRID_COLUMNS);
}
export function visualStartingDistance(r,index=0){
  const progress=Math.max(0,Number(r?.progress)||0);
  // The first ten are on the front line; rows of ten follow behind.
  // Easing the staging offsets over the first 80m preserves authoritative pace.
  const staging=Math.max(0,1-progress/80);
  return progress-gridRow(r,index)*GRID_ROW_GAP*staging;
}
export function gridTrackPoint(distance,lateral=0,height=0){
  if(distance>=0)return trackPoint(distance,lateral,height);
  // Extrapolate BEFORE the 0m line. Normal trackPoint clamps at zero, which
  // previously stacked all 50 runners into one position at the start.
  const start=trackCenter(0),sin=Math.sin(start.heading),cos=Math.cos(start.heading);
  return {x:start.x+sin*distance+lateral*cos,
    y:start.y+(Number.isFinite(height)?height:0),
    z:start.z+cos*distance-lateral*sin,
    heading:start.heading};
}
export function startingGrid(runners){
  return [...runners].sort((a,b)=>a.id.localeCompare(b.id)).map((r,i)=>({
    id:r.id,position:i+1,row:Math.floor(i/GRID_COLUMNS),
    lane:i%GRID_COLUMNS
  }));
}
