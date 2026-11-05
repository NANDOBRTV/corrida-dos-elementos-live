-- Use SOMENTE em ServerScriptService de uma experiência Roblox autorizada.
-- Lê nomes/IDs e posições do backend. Cria avatares com Players API, dentro do Roblox.
local HttpService=game:GetService("HttpService")
local Players=game:GetService("Players")
local RunService=game:GetService("RunService")
local Lighting=game:GetService("Lighting")
local endpoint="https://corrida-dos-elementos-live.onrender.com/api/roblox/participants"
local INTERVAL=2
local MAX_RUNNERS=50

-- Same parametric visual course as src/track-path.js; physics stays in Render.
local function centerAt(distance)
  local d=math.clamp(tonumber(distance) or 0,0,5000)
  local function xAt(p)
    local s=math.clamp(p,0,5000)
    local start=math.min(1,s/140)
    local ease=start*start*(3-2*start)
    return ease*(27*math.sin(s/172)+10*math.sin(s/69))
  end
  local low=math.max(0,d-.5)
  local high=math.min(5000,d+.5)
  local angle=math.atan((xAt(high)-xAt(low))/math.max(.001,high-low))
  local y=.72*math.sin(d/115)^2+.32*math.sin(d/46)^2
  return xAt(d),y,d,angle
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

-- Cenário original montado nativamente NO ROBLOX: duas peças de pista de 300 studs.
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
  addBlock(tile,0,-.6,150,130,1,300,Color3.fromRGB(234,241,249),"Ground")
  -- 20-stud road sections can turn; one 300-stud rectangle cannot.
  for z=10,290,20 do
    addBlock(tile,0,0,z,22,.2,20,Color3.fromRGB(151,165,185),"Road")
    for _,side in ipairs({-1,1}) do
      addBlock(tile,side*11.2,.26,z,.4,.4,20,Color3.fromRGB(235,242,252),"Edge")
      addBlock(tile,side*13.1,0,z,2,.12,20,Color3.fromRGB(230,239,248),"Shoulder")
    end
  end
  for z=8,298,16 do
    for _,x in ipairs({-6,-2,2,6}) do
      addBlock(tile,x,.16,z,.11,.02,5,Color3.fromRGB(247,244,226),"Marking")
    end
  end
  for i=1,14 do
    local z=i*19+4
    local x=(i%2==0 and -1 or 1)*(16+i%3*4)
    addBlock(tile,x,1.6,z,1.2,3.2,1.2,Color3.fromRGB(83,65,49),"Trunk")
    addBlock(tile,x,4,z,4,3.5,4,Color3.fromRGB(41,87,65),"Leaves")
    addBlock(tile,x,5.8,z,2.8,2.7,2.8,Color3.fromRGB(60,107,79),"Leaves")
    addBlock(tile,x,7,z,1.5,1.6,1.5,Color3.fromRGB(226,239,250),"SnowCap")
  end
end

local function repositionTrack(snapshot)
  local positions={}
  for _,runner in ipairs(snapshot.participants) do
    table.insert(positions,tonumber(runner.progress) or 0)
  end
  table.sort(positions)
  local focus=positions[math.max(1,math.floor(#positions*.45))] or 0
  local base=math.max(0,math.floor(math.max(0,focus-170)/300)*300)
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
        if item.kind=="Ground" then
          -- Wide, straight ground remains below the sinuous road.
          item.part.CFrame=CFrame.new(0,item.y,base+(tile-1)*300+item.z)
        else
          local pos,yaw=coursePosition(base+(tile-1)*300+item.z,item.x,item.y)
          item.part.CFrame=CFrame.new(pos)*CFrame.Angles(0,yaw,0)
        end
      end
      if changedMap then
        if item.kind=="Ground" then
          item.part.Color=snapshot.mapId=="ice" and Color3.fromRGB(235,243,249) or Color3.fromRGB(82,136,91)
        elseif item.kind=="Road" then
          item.part.Color=snapshot.mapId=="ice" and Color3.fromRGB(151,165,185) or Color3.fromRGB(174,153,118)
        elseif item.kind=="Leaves" then
          item.part.Color=snapshot.mapId=="ice" and Color3.fromRGB(40,93,73) or Color3.fromRGB(55,146,74)
        elseif item.kind=="SnowCap" then
          item.part.Transparency=snapshot.mapId=="ice" and 0 or 1
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
for dist=500,4500,500 do
  distanceSign(dist)
  staticBlock(dist,0,.16,22,.03,.75,Color3.fromRGB(255,231,163),"Checkpoint_"..dist)
end
local finishColor=Color3.fromRGB(255,228,134)
staticBlock(5000,0,.2,22,.08,1,finishColor,"FinishStripe")
for _,side in ipairs({-1,1}) do
  staticBlock(5000,side*12.3,4.3,1,8.6,1,Color3.fromRGB(46,62,69),"FinishPillar")
end
staticBlock(5000,0,8.6,25,1.3,1.2,finishColor,"FINISH_5000")

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

local function onRound(snapshot)
  repositionTrack(snapshot)
  latest=snapshot
  lastUpdate=os.clock()
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
      local progress=math.clamp(predicted,0,latest.trackLength or 5000)
      local bob=moving and math.abs(math.sin(os.clock()*10+entry.userId%13))*.08 or 0
      model:SetAttribute("RaceProgress",progress)
      model:SetAttribute("RunnerMoving",moving)
      local pos,yaw=coursePosition(progress,(lane-2)*4,2.8+bob)
      -- Roblox characters face -Z locally; +pi points them toward the finish.
      model:PivotTo(CFrame.new(pos)*CFrame.Angles(0,yaw+math.pi,0))
    end
  end
end)
