-- Use SOMENTE em ServerScriptService de uma experiência Roblox autorizada.
-- Lê nomes/IDs e posições do backend. Cria avatares com Players API, dentro do Roblox.
local HttpService=game:GetService("HttpService")
local Players=game:GetService("Players")
local RunService=game:GetService("RunService")
local Lighting=game:GetService("Lighting")
local endpoint="https://corrida-dos-elementos-live.onrender.com/api/roblox/participants"
local INTERVAL=2
local MAX_RUNNERS=50

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
  addBlock(tile,0,0,150,22,.2,300,Color3.fromRGB(151,165,185),"Road")
  for _,side in ipairs({-1,1}) do
    addBlock(tile,side*11.2,.26,150,.4,.4,300,Color3.fromRGB(235,242,252),"Edge")
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
        item.part.Position=Vector3.new(item.x,item.y,base+(tile-1)*300+item.z)
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
      local progress=math.clamp(tonumber(entry.progress) or 0,0,latest.trackLength or 5000)
      local moving=entry.status=="running"
      local bob=moving and math.abs(math.sin(os.clock()*10+entry.userId%13))*.08 or 0
      model:SetAttribute("RaceProgress",progress)
      model:PivotTo(CFrame.new((lane-2)*4,2.8+bob,progress))
    end
  end
end)
