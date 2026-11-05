-- Use em StarterPlayerScripts dentro da experiência Roblox.
local RunService=game:GetService("RunService")
local workspace=game:GetService("Workspace")
local cam=workspace.CurrentCamera
local folder=workspace:WaitForChild("RaceAvatars",30)
-- W circuit, 400m closed Catmull-Rom spline, matched to src/track-path.js.
local COURSE_LENGTH=400
local controls={
 {48,162},{72,165},{87,152},{89,127},{77,110},{64,91},
 {59,70},{62,53},{76,50},{85,58},{92,48},{89,27},
 {71,16},{46,20},{33,35},{35,57},{47,78},
 {47,101},{37,106},{31,91},{21,86},{15,108},
 {21,137},{34,157}
}
local density=64
local samples={}
local function pointAt(i) return controls[((i-1)%#controls)+1] end
for i=1,#controls do
 local a,b,c,d=pointAt(i-1),pointAt(i),pointAt(i+1),pointAt(i+2)
 for j=0,density-1 do
  local t=j/density;local t2=t*t;local t3=t2*t
  local function axis(k)
   return .5*(2*b[k]+(c[k]-a[k])*t+
    (2*a[k]-5*b[k]+4*c[k]-d[k])*t2+
    (-a[k]+3*b[k]-3*c[k]+d[k])*t3)
  end
  table.insert(samples,Vector2.new(axis(1),axis(2)))
 end
end
table.insert(samples,samples[1])
local distances={[1]=0}
for i=2,#samples do distances[i]=distances[i-1]+(samples[i]-samples[i-1]).Magnitude end
local factor=COURSE_LENGTH/distances[#distances]
local origin=samples[1]
local function xy(distance)
 local target=math.clamp(distance,0,COURSE_LENGTH)/factor
 local low,high=1,#samples
 while low+1<high do
  local middle=math.floor((low+high)/2)
  if distances[middle]<target then low=middle else high=middle end
 end
 local span=distances[high]-distances[low]
 local t=span>0 and math.clamp((target-distances[low])/span,0,1) or 0
 local p=samples[low]:Lerp(samples[high],t)
 return (p.X-origin.X)*factor,(origin.Y-p.Y)*factor
end
local function centerAt(distance)
 local d=math.max(0,tonumber(distance) or 0)%COURSE_LENGTH
 local x,z=xy(d)
 local bx,bz=xy((d-.35+COURSE_LENGTH)%COURSE_LENGTH)
 local ax,az=xy((d+.35)%COURSE_LENGTH)
 local angle=d/COURSE_LENGTH*math.pi*2
 return x,2*math.sin(angle)^2+1.2*math.sin(angle*2)^2,z,math.atan2(ax-bx,az-bz)
end

if not folder then return end
cam.CameraType=Enum.CameraType.Scriptable
cam.FieldOfView=62
-- Visual running animation, executed locally so no extra 50x animation network spam.
local animated=setmetatable({},{__mode="k"})
local function animator(model)
  local cached=animated[model]
  if cached then return cached end
  local names={"LeftHip","RightHip","LeftShoulder","RightShoulder",
               "Left Hip","Right Hip","Left Shoulder","Right Shoulder"}
  local found={}
  for _,node in ipairs(model:GetDescendants()) do
    if node:IsA("Motor6D") then
      for _,name in ipairs(names) do
        if node.Name==name then found[name]=node end
      end
    end
  end
  animated[model]=found
  return found
end
-- 0–10 seconds of random pause BETWEEN 3.2s camera close-ups.
-- Camera only: does not change race mechanics, NPC physics or chat events.
local lastRaceMs=-1
local previousPhase=nil
local syncClock=os.clock()
local currentRound=-1
local shotIndex=0
local shotStart=0
local shotSelected=false
local lastFeatured=nil
local featuredId=nil
local function randomWait(round,sequence)
  -- Same deterministic interval for every frame of the current local round.
  return Random.new(round*7937+sequence*10949+271828):NextInteger(0,10000)
end
local function smoothstep(x)
  local t=math.clamp(x,0,1)
  return t*t*(3-2*t)
end
local function chooseFeatured(models,center,slot,round)
  local candidates={}
  for _,model in ipairs(models) do
    local progress=model:GetAttribute("RaceProgress")
    local userId=model:GetAttribute("RobloxUserId")
    if model:GetAttribute("RunnerMoving")==true and type(progress)=="number"
       and type(userId)=="number" and math.abs(progress-center)<=115 then
      table.insert(candidates,model)
    end
  end
  table.sort(candidates,function(a,b)
    return a:GetAttribute("RobloxUserId")<b:GetAttribute("RobloxUserId")
  end)
  if #candidates==0 then return nil end
  local roll=Random.new(round*7937+slot*10949)
  local index=roll:NextInteger(1,#candidates)
  if #candidates>1 and candidates[index]:GetAttribute("RobloxUserId")==lastFeatured then
    index=index%#candidates+1
  end
  return candidates[index]:GetAttribute("RobloxUserId")
end
RunService:BindToRenderStep("RaceLiveCamera",Enum.RenderPriority.Camera.Value+1,function(dt)
  local positions={}
  local models=folder:GetChildren()
  for _,model in ipairs(models) do
    local z=model:GetAttribute("RaceProgress")
    if type(z)=="number" then table.insert(positions,z) end
    local motors=animator(model)
    local moving=model:GetAttribute("RunnerMoving")==true
    local t=os.clock()*11+(model:GetAttribute("RobloxUserId") or 0)%7
    local left=moving and math.sin(t)*.62 or 0
    local right=-left
    for _,name in ipairs({"LeftHip","Left Hip"}) do
      if motors[name] then motors[name].Transform=CFrame.Angles(left,0,0) end
    end
    for _,name in ipairs({"RightHip","Right Hip"}) do
      if motors[name] then motors[name].Transform=CFrame.Angles(right,0,0) end
    end
    for _,name in ipairs({"LeftShoulder","Left Shoulder"}) do
      if motors[name] then motors[name].Transform=CFrame.Angles(right,0,0) end
    end
    for _,name in ipairs({"RightShoulder","Right Shoulder"}) do
      if motors[name] then motors[name].Transform=CFrame.Angles(left,0,0) end
    end
  end
  table.sort(positions)
  local center=positions[math.max(1,math.floor(#positions*.48))] or 0
  local nx,ny,nz,nh=centerAt(center-65)
  local fx,fy,fz,fh=centerAt(center+75)
  local overview=math.clamp((math.abs(fh-nh)-.22)/1.3,0,1)
  local phase=folder:GetAttribute("RacePhase")
  local cx,cy,cz,heading=centerAt(center)
  local dx,dz=math.sin(heading),math.cos(heading)
  local back=26+overview*40
  local height=13+overview*50
  local desired=CFrame.lookAt(
    Vector3.new(cx-dx*back,cy+height,cz-dz*back),
    Vector3.new(cx+dx*12,cy+1.5,cz+dz*12)
  )
  if phase=="LOBBY" or phase=="COUNTDOWN" then
    local sx,sy,sz,sh=centerAt(0)
    local fx,fz=math.sin(sh),math.cos(sh)
    desired=CFrame.lookAt(
      Vector3.new(sx+fx*20,sy+8.5,sz+fz*20),
      Vector3.new(sx-fx*8,sy+1.5,sz-fz*8)
    )
  end
  local round=folder:GetAttribute("RaceRound") or 0
  local serverMs=folder:GetAttribute("RaceMs") or 0
  if round~=currentRound then
    currentRound=round;shotIndex=0;shotStart=randomWait(round,0)
    shotSelected=false;lastFeatured=nil;featuredId=nil
    lastRaceMs=-1
  end
  if serverMs~=lastRaceMs then
    lastRaceMs=serverMs
    syncClock=os.clock()
  end
  if phase=="RUNNING" then
    local raceMs=serverMs+math.min(2,os.clock()-syncClock)*1000
    while raceMs>=shotStart+3200 do
      shotIndex+=1
      shotStart+=3200+randomWait(round,shotIndex)
      shotSelected=false;featuredId=nil
    end
    local elapsed=raceMs-shotStart
    if elapsed>=0 and not shotSelected then
      shotSelected=true
      featuredId=chooseFeatured(models,center,shotIndex+1,round)
      if featuredId then lastFeatured=featuredId end
    end
    if featuredId and elapsed>=0 and elapsed<3200 then
      local focused
      for _,model in ipairs(models) do
        if model:GetAttribute("RobloxUserId")==featuredId and
          model:GetAttribute("RunnerMoving")==true then
          focused=model;break
        end
      end
      if focused then
        local progress=focused:GetAttribute("RaceProgress") or center
        local x,y,z,yaw=centerAt(progress)
        local lane=math.clamp(tonumber(focused:GetAttribute("RaceLane")) or 4,0,9)
        local side=(lane-4.5)*1.75
        local px=x+side*math.cos(yaw)
        local pz=z-side*math.sin(yaw)
        local fx=math.sin(yaw)
        local fz=math.cos(yaw)
        local angle=math.cos(yaw)
        local sid=-math.sin(yaw)
        local close=CFrame.lookAt(
          Vector3.new(px+fx*5.8+angle*2, y+3.65, pz+fz*5.8+sid*2),
          Vector3.new(px,y+1.8,pz)
        )
        local blend=math.min(smoothstep(elapsed/650),smoothstep((3200-elapsed)/750))
        desired=desired:Lerp(close,blend)
      end
    end
  else
    shotIndex=0;shotStart=randomWait(round,0)
    shotSelected=false;lastFeatured=nil;featuredId=nil
  end
  local alpha=1-math.exp(-5.8*math.min(.12,dt))
  -- Start at the video-style FRONT view; switch instantly BEHIND at GO.
  local started=(previousPhase=="LOBBY" or previousPhase=="COUNTDOWN") and phase=="RUNNING"
  if started or previousPhase==nil or
     (cam.CFrame.Position-desired.Position).Magnitude>180 then
    cam.CFrame=desired
  else
    cam.CFrame=cam.CFrame:Lerp(desired,alpha)
  end
  previousPhase=phase
end)
