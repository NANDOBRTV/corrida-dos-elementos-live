-- Use em StarterPlayerScripts dentro da experiência Roblox.
local RunService=game:GetService("RunService")
local workspace=game:GetService("Workspace")
local cam=workspace.CurrentCamera
local folder=workspace:WaitForChild("RaceAvatars",30)
if not folder then return end
cam.CameraType=Enum.CameraType.Scriptable
cam.FieldOfView=62
RunService:BindToRenderStep("RaceLiveCamera",Enum.RenderPriority.Camera.Value+1,function(dt)
  local positions={}
  for _,model in ipairs(folder:GetChildren()) do
    local z=model:GetAttribute("RaceProgress")
    if type(z)=="number" then table.insert(positions,z) end
  end
  table.sort(positions)
  local center=positions[math.max(1,math.floor(#positions*.48))] or 0
  local desired=CFrame.lookAt(Vector3.new(0,16,center-34),Vector3.new(0,2,center+12))
  local alpha=1-math.exp(-2.5*math.min(.12,dt))
  if (cam.CFrame.Position-desired.Position).Magnitude>180 then
    cam.CFrame=desired
  else
    cam.CFrame=cam.CFrame:Lerp(desired,alpha)
  end
end)
