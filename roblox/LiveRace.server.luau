-- Use SOMENTE em ServerScriptService de uma experiência Roblox autorizada.
-- Lê nomes/IDs e posições do backend. Cria avatares com Players API, dentro do Roblox.
local HttpService=game:GetService("HttpService")
local Players=game:GetService("Players")
local RunService=game:GetService("RunService")
local Lighting=game:GetService("Lighting")
local endpoint="https://corrida-dos-elementos-live.onrender.com/api/roblox/participants"
local INTERVAL=2
local MAX_RUNNERS=50

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

local function coursePosition(distance,lateral,height)
  local cx,cy,z,yaw=centerAt(distance)
  local offset=lateral or 0
  return Vector3.new(cx+offset*math.cos(yaw),cy+(height or 0),z-offset*math.sin(yaw)),yaw
end


local folder=Instance.new("Folder")
folder.Name="RaceAvatars"
folder.Parent=workspace
local current={}
local loading={}
local latest
local lastRound=0
local lastUpdate=os.clock()

-- Circuito W Roblox em duas seções de 200 metros, reutilizadas a cada volta.
-- Não faz download de mapas, roupas ou modelos para fora da plataforma.
local scenery=Instance.new("Folder")
scenery.Name="RaceScenery"
scenery.Parent=workspace
local tileParts={{},{}}
local trackBase=-1
local currentMap=""
local function addBlock(tile,x,y,z,w,h,d,color,partName)
  local part=Instance.new("Part")
  part.Name=partName or "TrackDecoration"
  part.Anchored=true
  part.CanCollide=false
  part.CanTouch=false
  part.CanQuery=false
  part.Material=Enum.Material.SmoothPlastic
  part.Color=color
  part.Size=Vector3.new(w,h,d)
  part.Position=Vector3.new(x,y,z)
  part.Parent=scenery
  table.insert(tileParts[tile],{part=part,x=x,y=y,z=z,kind=partName})
  return part
end

for tile=1,2 do
  -- Terraces follow the centerline too; no giant straight ground slab.
  for z=10,190,20 do
    addBlock(tile,0,-2.9,z,126,5,26,Color3.fromRGB(234,241,249),"Ground")
    addBlock(tile,0,0,z,22,.2,20,Color3.fromRGB(151,165,185),"Road")
    for _,side in ipairs({-1,1}) do
      addBlock(tile,side*11.2,.26,z,.4,.4,20,Color3.fromRGB(235,242,252),"Edge")
      addBlock(tile,side*13.1,0,z,2,.12,20,Color3.fromRGB(230,239,248),"Shoulder")
      local offset=side*(30+(z%3)*5)
      addBlock(tile,offset,5+(z%4)*2,z,24,11+(z%4)*3,28,
        Color3.fromRGB(212,222,236),"Cliff")
      addBlock(tile,offset,11+(z%4)*2,z,27,2,28,
        Color3.fromRGB(249,251,254),"CliffSnow")
    end
  end
  for z=8,198,16 do
    for _,x in ipairs({-6,-2,2,6}) do
      addBlock(tile,x,.16,z,.11,.02,5,Color3.fromRGB(247,244,226),"Marking")
    end
  end
  for i=1,10 do
    local z=i*19+4
    local x=(i%2==0 and -1 or 1)*(16+i%3*4)
    addBlock(tile,x,1.6,z,1.2,3.2,1.2,Color3.fromRGB(83,65,49),"Trunk")
    addBlock(tile,x,4,z,4,3.5,4,Color3.fromRGB(41,87,65),"Leaves")
    addBlock(tile,x,5.8,z,2.8,2.7,2.8,Color3.fromRGB(60,107,79),"Leaves")
    addBlock(tile,x,7,z,1.5,1.6,1.5,Color3.fromRGB(226,239,250),"SnowCap")
  end
end

local function repositionTrack(snapshot)
  -- The complete W course stays fixed; laps reuse the same geometry.
  local base=0
  local changedMap=currentMap~=snapshot.mapId
  if base==trackBase and not changedMap then return end
  trackBase=base
  currentMap=snapshot.mapId
  Lighting.Brightness=2
  Lighting.ClockTime=12.5
  Lighting.Ambient=Color3.fromRGB(169,186,207)
  for tile=1,2 do
    for _,item in ipairs(tileParts[tile]) do
      if base~=nil then
        local pos,yaw=coursePosition(base+(tile-1)*200+item.z,item.x,item.y)
        item.part.CFrame=CFrame.new(pos)*CFrame.Angles(0,yaw,0)
      end
      if changedMap then
        if item.kind=="Ground" then
          item.part.Color=snapshot.mapId=="ice" and Color3.fromRGB(235,243,249) or Color3.fromRGB(82,136,91)
        elseif item.kind=="Road" then
          item.part.Color=snapshot.mapId=="ice" and Color3.fromRGB(151,165,185) or Color3.fromRGB(174,153,118)
        elseif item.kind=="Leaves" then
          item.part.Color=snapshot.mapId=="ice" and Color3.fromRGB(40,93,73) or Color3.fromRGB(55,146,74)
        elseif item.kind=="SnowCap" or item.kind=="CliffSnow" then
          item.part.Transparency=snapshot.mapId=="ice" and 0 or 1
        elseif item.kind=="Cliff" then
          item.part.Color=snapshot.mapId=="ice" and Color3.fromRGB(212,222,236) or Color3.fromRGB(89,121,83)
        end
      end
    end
  end
end

-- Permanent distance markers are placed along the physical curves, never recycled.
local markers=Instance.new("Folder")
markers.Name="RaceMilestones"
markers.Parent=workspace
local function staticBlock(distance,x,y,w,h,d,color,name)
  local pos,yaw=coursePosition(distance,x,y)
  local part=Instance.new("Part")
  part.Name=name
  part.Anchored=true
  part.CanCollide=false
  part.CanTouch=false
  part.CanQuery=false
  part.Material=Enum.Material.SmoothPlastic
  part.Size=Vector3.new(w,h,d)
  part.Color=color
  part.CFrame=CFrame.new(pos)*CFrame.Angles(0,yaw,0)
  part.Parent=markers
  return part
end
local function distanceSign(meters)
  local plate=staticBlock(meters,17,3.8,5,2.3,.3,
    Color3.fromRGB(45,65,80),"Marker_"..meters)
  staticBlock(meters,17,1.6,.35,3.2,.35,
    Color3.fromRGB(75,95,112),"MarkerPost_"..meters)
  local gui=Instance.new("SurfaceGui")
  gui.Face=Enum.NormalId.Front
  gui.Parent=plate
  local text=Instance.new("TextLabel")
  text.Size=UDim2.fromScale(1,1)
  text.BackgroundTransparency=1
  text.Text=tostring(meters).." m"
  text.Font=Enum.Font.GothamBold
  text.TextColor3=Color3.fromRGB(252,234,150)
  text.TextScaled=true
  text.Parent=gui
end
for dist=100,300,100 do
  distanceSign(dist)
  staticBlock(dist,0,.16,22,.03,.75,Color3.fromRGB(255,231,163),"Checkpoint_"..dist)
end
local finishColor=Color3.fromRGB(255,228,134)
staticBlock(400,0,.2,22,.08,1,finishColor,"FinishStripe")
for _,side in ipairs({-1,1}) do
  staticBlock(400,side*12.3,4.3,1,8.6,1,Color3.fromRGB(46,62,69),"FinishPillar")
end
staticBlock(400,0,8.6,25,1.3,1.2,finishColor,"FINISH_400")

local function fetchRound()
  local ok,reply=pcall(function()
    local secret=HttpService:GetSecret("RACE_BRIDGE_KEY")
    return HttpService:RequestAsync({
      Url=endpoint,
      Method="GET",
      Headers={["accept"]="application/json",["x-roblox-bridge-key"]=secret},
      Timeout=10
    })
  end)
  if not ok or not reply.Success then
    warn("[race] Fetch failed: verify HTTP requests + Roblox secret + Render key")
    return nil
  end
  local parsedOk,data=pcall(function() return HttpService:JSONDecode(reply.Body) end)
  if not parsedOk or type(data)~="table" or data.ok~=true
     or type(data.participants)~="table" then return nil end
  return data
end

local function spawnAvatar(entry,round)
  local key=tostring(entry.userId)
  if current[key] or loading[key] then return end
  loading[key]=true
  task.spawn(function()
    local ok,model=pcall(function()
      return Players:CreateHumanoidModelFromUserIdAsync(entry.userId)
    end)
    if not ok or not model then
      warn("[race] Avatar could not load",key)
      loading[key]=nil
      return
    end
    if lastRound~=round or not latest then
      model:Destroy()
      loading[key]=nil
      return
    end
    model.Name="Avatar_"..key
    model:SetAttribute("RobloxUserId",entry.userId)
    model:SetAttribute("RobloxUsername",entry.username)
    for _,part in ipairs(model:GetDescendants()) do
      if part:IsA("BasePart") then
        part.CanCollide=false
        part.CanTouch=false
        part.CanQuery=false
        if part.Name=="HumanoidRootPart" then part.Anchored=true end
      end
    end
    local hum=model:FindFirstChildOfClass("Humanoid")
    if hum then
      hum.DisplayName=entry.username
      hum.NameDisplayDistance=60
      hum.HealthDisplayType=Enum.HumanoidHealthDisplayType.AlwaysOff
    end
    model.Parent=folder
    current[key]=model
    loading[key]=nil
  end)
end

-- Optional native view mirrors ONLY gift-triggered obstacles from the private feed.
-- Collision results are decided by Node; these parts are decorative/CanCollide=false.
local giftObstacleFolder=Instance.new("Folder")
giftObstacleFolder.Name="GiftObstacles"
giftObstacleFolder.Parent=workspace
local giftObstacleParts={}
local function syncGiftObstacles(snapshot)
  local wanted={}
  if snapshot.phase=="RUNNING" and type(snapshot.obstacles)=="table" then
    for _,entry in ipairs(snapshot.obstacles) do
      if type(entry.id)=="string" and type(entry.z)=="number" and
         type(entry.lane)=="number" and entry.z>=0 and entry.z<=(snapshot.trackLength or COURSE_LENGTH) then
        wanted[entry.id]=true
        local piece=giftObstacleParts[entry.id]
        if not piece then
          piece=Instance.new("Part")
          piece.Name="GiftObstacle_"..entry.id
          piece.Anchored=true
          piece.CanCollide=false
          piece.CanTouch=false
          piece.CanQuery=false
          piece.CastShadow=false
          piece.Shape=entry.kind=="ice" and Enum.PartType.Ball or Enum.PartType.Block
          piece.Material=entry.kind=="ice" and Enum.Material.Ice or Enum.Material.Wood
          piece.Size=entry.kind=="ice" and Vector3.new(2.2,3,2.2) or Vector3.new(3,1.4,2.2)
          piece.Color=entry.simulated==true and Color3.fromRGB(205,148,251) or
            (entry.kind=="ice" and Color3.fromRGB(109,220,246) or Color3.fromRGB(140,98,55))
          piece:SetAttribute("Simulated",entry.simulated==true)
          piece.Parent=giftObstacleFolder
          giftObstacleParts[entry.id]=piece
        end
        local point,yaw=coursePosition(entry.z,(entry.lane-2)*4,.75)
        piece.CFrame=CFrame.new(point)*CFrame.Angles(0,yaw,0)
      end
    end
  end
  for id,piece in pairs(giftObstacleParts) do
    if not wanted[id] then
      piece:Destroy()
      giftObstacleParts[id]=nil
    end
  end
end

local function onRound(snapshot)
  repositionTrack(snapshot)
  syncGiftObstacles(snapshot)
  latest=snapshot
  lastUpdate=os.clock()
  -- This replicated state lets the Studio spectator trigger the same 10s cuts
  -- as the web viewer, with no client-side Roblox HTTP credentials.
  folder:SetAttribute("RaceMs",snapshot.raceMs)
  folder:SetAttribute("RacePhase",snapshot.phase)
  folder:SetAttribute("RaceRound",snapshot.round)
  if lastRound~=snapshot.round then
    lastRound=snapshot.round
    for key,model in pairs(current) do
      model:Destroy()
      current[key]=nil
    end
  end
  local present={}
  for index,entry in ipairs(snapshot.participants) do
    if index>MAX_RUNNERS then break end
    if type(entry.userId)=="number" and entry.userId>0 then
      local key=tostring(entry.userId)
      present[key]=true
      if not current[key] then spawnAvatar(entry,snapshot.round) end
    end
  end
  for key,model in pairs(current) do
    if not present[key] then model:Destroy();current[key]=nil end
  end
end

task.spawn(function()
  while true do
    local snapshot=fetchRound()
    if snapshot then onRound(snapshot) end
    task.wait(INTERVAL)
  end
end)

RunService.Heartbeat:Connect(function(dt)
  if not latest then return end
  for _,entry in ipairs(latest.participants) do
    local model=current[tostring(entry.userId)]
    if model then
      local lane=math.clamp(tonumber(entry.lane) or 2,0,4)
      local moving=entry.status=="running"
      -- Predict only visual motion between two authorized 2-second snapshots.
      -- This never alters the Render result or accumulated race distance.
      local elapsed=math.clamp(os.clock()-lastUpdate,0,INTERVAL)
      local predicted=(tonumber(entry.progress) or 0)+(moving and math.max(0,tonumber(entry.speed) or 0)*elapsed or 0)
      local progress=math.clamp(predicted,0,latest.trackLength or COURSE_LENGTH)
      local bob=moving and math.abs(math.sin(os.clock()*10+entry.userId%13))*.08 or 0
      model:SetAttribute("RaceProgress",progress%COURSE_LENGTH)
      model:SetAttribute("RaceTotalProgress",progress)
      model:SetAttribute("RunnerMoving",moving)
      model:SetAttribute("RaceLane",lane)
      local pos,yaw=coursePosition(progress,(lane-2)*4,2.8+bob)
      -- Roblox characters face -Z locally; +pi points them toward the finish.
      model:PivotTo(CFrame.new(pos)*CFrame.Angles(0,yaw+math.pi,0))
    end
  end
end)
