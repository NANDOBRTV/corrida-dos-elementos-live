-- Use em StarterPlayerScripts dentro da experiência Roblox.
local RunService=game:GetService("RunService")
local workspace=game:GetService("Workspace")
local cam=workspace.CurrentCamera
local folder=workspace:WaitForChild("RaceAvatars",30)
-- Same distance-profile, X/Z integration and elevation as the authoritative web renderer.
local COURSE_LENGTH=5000
local STEP=2
local turns={
  {0,420,.03},{420,790,-1.55},{790,1400,-.05},
  {1400,1770,3.10},{1770,2430,.08},
  {2430,2810,-3.10},{2810,3420,-.06},
  {3420,3790,3.10},{3790,4460,.07},
  {4460,4800,-1.18},{4800,5000,-.10}
}
local function headingAt(s)
  local a=0
  for _,turn in ipairs(turns) do
    if s<=turn[1] then break end
    local t=math.min(1,(s-turn[1])/(turn[2]-turn[1]))
    a+=turn[3]*(1-math.cos(math.pi*t))*.5
    if s<turn[2] then break end
  end
  return a
end
local xx,zz,hh={[1]=0},{[1]=0},{}
for i=0,COURSE_LENGTH/STEP do
  local s=i*STEP
  hh[i+1]=headingAt(s)
  if i>0 then
    local h=headingAt(s-STEP*.5)
    xx[i+1]=xx[i]+math.sin(h)*STEP
    zz[i+1]=zz[i]+math.cos(h)*STEP
  end
end
local function centerAt(distance)
  local s=math.clamp(tonumber(distance) or 0,0,COURSE_LENGTH)
  local i=math.min(COURSE_LENGTH/STEP-1,math.floor(s/STEP))
  local t=(s-i*STEP)/STEP
  local x=xx[i+1]+(xx[i+2]-xx[i+1])*t
  local z=zz[i+1]+(zz[i+2]-zz[i+1])*t
  local h=hh[i+1]+(hh[i+2]-hh[i+1])*t
  local y=2.5*math.sin(s/185)^2+13*math.sin(s/1500)^2+3*math.sin(s/430)^2
  return x,y,z,h
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
-- A different native avatar gets a close-up every 10 seconds of race time.
-- Camera only: does not change race mechanics, NPC physics or chat events.
local lastRaceMs=-1
local syncClock=os.clock()
local currentRound=-1
local lastSlot=0
local lastFeatured=nil
local featuredId=nil
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
  local bx,by,bz=centerAt(center-48-overview*45)
  local ax,ay,az=centerAt(center+38+overview*58)
  local desired=CFrame.lookAt(
    Vector3.new(bx,by+20+overview*72,bz),
    Vector3.new(ax,ay+1.8,az)
  )
  local phase=folder:GetAttribute("RacePhase")
  local round=folder:GetAttribute("RaceRound") or 0
  local serverMs=folder:GetAttribute("RaceMs") or 0
  if round~=currentRound then
    currentRound=round;lastSlot=0;lastFeatured=nil;featuredId=nil
    lastRaceMs=-1
  end
  if serverMs~=lastRaceMs then
    lastRaceMs=serverMs
    syncClock=os.clock()
  end
  if phase=="RUNNING" then
    local raceMs=serverMs+math.min(2,os.clock()-syncClock)*1000
    local slot=math.floor(raceMs/10000)
    if slot>=1 and slot~=lastSlot then
      lastSlot=slot
      featuredId=chooseFeatured(models,center,slot,round)
      if featuredId then lastFeatured=featuredId end
    end
    local elapsed=raceMs-slot*10000
    if slot>=1 and featuredId and elapsed>=0 and elapsed<3200 then
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
        local lane=math.clamp(tonumber(focused:GetAttribute("RaceLane")) or 2,0,4)
        local side=(lane-2)*4
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
    lastSlot=0;featuredId=nil
  end
  local alpha=1-math.exp(-5.8*math.min(.12,dt))
  if (cam.CFrame.Position-desired.Position).Magnitude>180 then
    cam.CFrame=desired
  else
    cam.CFrame=cam.CFrame:Lerp(desired,alpha)
  end
end)
