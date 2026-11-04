-- Use SOMENTE em ServerScriptService de uma experiência Roblox autorizada.
-- Lê nomes/IDs e posições do backend. Cria avatares com Players API, dentro do Roblox.
local HttpService=game:GetService("HttpService")
local Players=game:GetService("Players")
local RunService=game:GetService("RunService")
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
