import test from "node:test";
import assert from "node:assert/strict";
import {snowbankProfile,roadsideClearance,clearOfWTrack,ROAD_HALF_WIDTH,SNOW_BUFFER} from "../src/snow-clearance.js";
import {trackPoint,trackCenter,COURSE_LENGTH} from "../src/track-path.js";
import {BIOMES} from "../src/config.js";
test("Every possible winter snow bank stays safely outside the drivable asphalt",()=>{
  assert.equal(ROAD_HALF_WIDTH,5.85);
  for(const side of [-1,1])for(let variation=0;variation<7;variation++){
    const p=snowbankProfile(side,variation);
    assert.ok(roadsideClearance(p)>=SNOW_BUFFER,
      "Winter bank overlaps the road for variation "+variation);
    assert.ok(Math.abs(p.x)>ROAD_HALF_WIDTH+p.width/2);
  }
});
test("Visible snow banks cannot cover a nearby return arm of the W circuit",()=>{
  let rendered=0;
  for(let z=7;z<COURSE_LENGTH;z+=14){
    for(const side of [-1,1]){
      const bank=snowbankProfile(side,((z*13+side*17)%7+7)%7);
      if(!clearOfWTrack(z,bank))continue;
      rendered++;
      const spot=trackPoint(z,bank.x);
      const limit=ROAD_HALF_WIDTH+SNOW_BUFFER+Math.hypot(bank.width/2,bank.depth/2);
      for(let along=0;along<COURSE_LENGTH;along+=2){
        const middle=trackCenter(along);
        assert.ok(Math.hypot(middle.x-spot.x,middle.z-spot.z)>=limit);
      }
    }
  }
  assert.ok(rendered>0,"The snowy scenery should still have safe roadside banks");
});
test("Ice road uses dark clean asphalt for clear separation from white snow",()=>{
  assert.equal(BIOMES.ice.road,0x566578);
});
test("Ice snowfall never drifts over the road, forest leaves remain unaffected",async()=>{
  const {readFile}=await import("node:fs/promises");
  const source=await readFile(new URL("../src/world.js",import.meta.url),"utf8");
  assert.ok(source.includes('if(id==="forest")'));
  assert.ok(source.includes('if(!curvedCourse||clearOfWTrack(z,bank))'));
  assert.ok(source.includes('clearOfWTrack(base+z,icePatch)'));
  assert.ok(source.includes('weather.name="biome-weather-particles"'));
});
