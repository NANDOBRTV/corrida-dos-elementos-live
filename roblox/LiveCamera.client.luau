-- Use em StarterPlayerScripts dentro da experiência Roblox.
local RunService=game:GetService("RunService")
local workspace=game:GetService("Workspace")
local cam=workspace.CurrentCamera
local folder=workspace:WaitForChild("RaceAvatars",30)
-- The spectator camera follows the exact same curve as the Roblox race track.
local function centerAt(distance)
  local s=math.clamp(tonumber(distance) or 0,0,5000)
  local t=math.min(1,s/140)
  local smooth=t*t*(3-2*t)
  local x=smooth*(27*math.sin(s/172)+10*math.sin(s/69))
  local y=.72*math.sin(s/115)^2+.32*math.sin(s/46)^2
  return x,y
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
RunService:BindToRenderStep("RaceLiveCamera",Enum.RenderPriority.Camera.Value+1,function(dt)
  local positions={}
  for _,model in ipairs(folder:GetChildren()) do
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
  local bx,by=centerAt(center-34)
  local fx,fy=centerAt(center+12)
  local desired=CFrame.lookAt(
    Vector3.new(bx,16+by,center-34),
    Vector3.new(fx,2+fy,center+12)
  )
  local alpha=1-math.exp(-2.5*math.min(.12,dt))
  if (cam.CFrame.Position-desired.Position).Magnitude>180 then
    cam.CFrame=desired
  else
    cam.CFrame=cam.CFrame:Lerp(desired,alpha)
  end
end)
