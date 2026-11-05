import test from "node:test";
import assert from "node:assert/strict";
import {EventEmitter} from "node:events";
import {createStudioAvatarResolver,createStudioLiveBridge,
  normalizeStudioChat,normalizeStudioFollow} from "../server/studio-live.js";
import {createStudioRuntime} from "../server/studio-runtime.js";
import {createApp} from "../server/index.js";

const SALT="studio-v5-test-salt-with-at-least-32-characters";
const sample=(id,comment="entrar Builderman")=>({
  user:{userId:id,nickname:"Visitante "+id,uniqueId:"account"+id},
  comment,common:{msgId:"chat-"+id}
});
function mockRoblox(){
  let lookupCalls=0,avatarCalls=0;
  const lookup={async lookup(username){
    lookupCalls++;
    if(username.toLowerCase()==="unknownplayer")throw Error("not found");
    if(username.toLowerCase()==="offlineplayer")throw Error("network offline");
    return {id:156,username:"Builderman",displayName:"Builderman"};
  }};
  const fetchImpl=async(url)=>{
    avatarCalls++;
    assert.match(url,/^https:\/\/thumbnails\.roblox\.com\/v1\/users\/avatar-headshot\?/);
    return {ok:true,async json(){return {data:[{targetId:156,state:"Completed",
      imageUrl:"https://tr.rbxcdn.com/avatar/150/150/AvatarHeadshot/Png"}]};}};
  };
  return {lookup,fetchImpl,counts:()=>({lookupCalls,avatarCalls})};
}
class FakeTikTokConnection extends EventEmitter{
  connected=false;disconnected=false;
  async connect(){this.connected=true;}
  async disconnect(){this.disconnected=true;this.connected=false;}
}
test("Bare Roblox usernames and 'entrar' comments both join; unrelated chat ignored",()=>{
  assert.equal(normalizeStudioChat(sample("1","Builderman")).username,"Builderman");
  assert.equal(normalizeStudioChat(sample("1","entrar Builderman")).username,"Builderman");
  assert.equal(normalizeStudioChat(sample("1","entrar")).username,null);
  assert.equal(normalizeStudioChat(sample("1","Oi pessoal!")),null);
  assert.equal(normalizeStudioChat({comment:"Builderman"}),null);
  assert.equal(normalizeStudioFollow(sample("1")).raw,"1");
});
test("Public Roblox headshot, in-flight cache and fallback for missing usernames",async()=>{
  const mock=mockRoblox();
  const resolver=createStudioAvatarResolver(mock);
  const [a,b,c]=await Promise.all([
    resolver.resolve("Builderman"),resolver.resolve("builderman"),
    resolver.resolve("Builderman")
  ]);
  assert.equal(a.robloxUserId,156);
  assert.equal(a.avatarUrl,"https://tr.rbxcdn.com/avatar/150/150/AvatarHeadshot/Png");
  assert.deepEqual(a,b);assert.deepEqual(b,c);
  assert.deepEqual(mock.counts(),{lookupCalls:1,avatarCalls:1});
  const unavailable=await resolver.resolve("unknownplayer");
  assert.equal(unavailable.source,"starter");
  assert.equal(unavailable.avatarUrl,null);
  assert.equal((await resolver.resolve("unknownplayer")).source,"starter");
  assert.equal(mock.counts().lookupCalls,2);
  assert.equal((await resolver.resolve("invalid_name_too_long_over_20")).source,"starter");
});
test("Roblox thumbnail URLs must be trusted HTTPS CDN; untrusted URL becomes no photo",async()=>{
  const mock=mockRoblox();
  const resolver=createStudioAvatarResolver({lookup:mock.lookup,
    fetchImpl:async()=>({ok:true,json:async()=>({
      data:[{targetId:156,state:"Completed",imageUrl:"http://evil.example/photo.png"}]})})});
  const out=await resolver.resolve("Builderman");
  assert.equal(out.source,"roblox");assert.equal(out.avatarUrl,null);
});
test("TikTok comments map to pseudonymous ids, avatars and starter fallback",async()=>{
  const mock=mockRoblox();
  const runtime=createStudioRuntime({autoStart:false});
  const bridge=createStudioLiveBridge({studio:runtime,...mock,identitySalt:SALT,
    enabled:false,username:"examplelive"});
  const result=await bridge.chat(sample("raw-private-user","Builderman"));
  assert.equal(result.ok,true);
  assert.equal(runtime.state().active.length,1);
  assert.equal(runtime.state().active[0].robloxUserId,156);
  assert.equal(runtime.state().active[0].id.startsWith("tt-"),true);
  assert.equal(JSON.stringify(runtime.snapshot()).includes("raw-private-user"),false);
  assert.equal(bridge.avatars().profiles[0].robloxUsername,"Builderman");
  assert.ok(bridge.avatars().profiles[0].avatarUrl?.startsWith("https://tr.rbxcdn.com"));
  const fallback=await bridge.chat(sample("second-private","entrar Unknownplayer"));
  assert.equal(fallback.ok,true);
  assert.equal(runtime.state().active.length,2);
  assert.equal(bridge.avatars().profiles[1].source,"starter");
  await bridge.close();runtime.stop();
});
test("Gift amounts and follows are mapped to existing bounded engine rules",async()=>{
  const runtime=createStudioRuntime({autoStart:false});
  const bridge=createStudioLiveBridge({studio:runtime,identitySalt:SALT});
  await bridge.chat(sample("a","entrar"));
  await bridge.chat(sample("b","entrar"));
  runtime.act({action:"advance"});runtime.act({action:"advance"});
  const gift={user:{userId:"a",nickname:"A"},giftId:99,
    gift:{name:"Present",diamondCount:10,type:0},repeatCount:1,
    common:{msgId:"present-1"}};
  assert.equal(bridge.gift(gift).type,"jetpack");
  assert.equal(bridge.gift(gift).duplicate,true);
  gift.common.msgId="present-2";gift.repeatCount=3;
  assert.equal(bridge.gift(gift).type,"turbo-rain");
  gift.common.msgId="present-3";gift.repeatCount=8;
  assert.equal(bridge.gift(gift).type,"obstacle");
  const invalidGift={...gift,repeatCount:1,gift:{...gift.gift,type:1},
    repeatEnd:false};
  assert.equal(bridge.gift(invalidGift).ok,false);
  const follow={user:{userId:"a",nickname:"Follower"},common:{msgId:"follow-1"}};
  assert.equal(bridge.follow(follow).ok,true);
  assert.equal(bridge.follow(follow).duplicate,true);
  assert.equal(bridge.like({count:40,common:{msgId:"like-1"}}).ok,true);
  assert.equal(bridge.like({count:40,common:{msgId:"like-1"}}).duplicate,true);
  assert.equal(runtime.state().likesTotal,40);
  await bridge.close();runtime.stop();
});
test("Connector uses follow, handles disconnect, reconnect and deliberate close",async()=>{
  const runtime=createStudioRuntime({autoStart:false});
  const connections=[];
  const bridge=createStudioLiveBridge({studio:runtime,enabled:true,
    identitySalt:SALT,username:"@examplelive",retryBaseMs:8,retryMaxMs:15,
    connectionFactory:async()=>{
      const connection=new FakeTikTokConnection();
      connections.push(connection);
      return connection;
    }});
  await bridge.start();
  assert.equal(runtime.state().connected,true);
  assert.equal(bridge.status().connected,true);
  connections[0].emit("disconnected");
  assert.equal(runtime.state().connected,false);
  await new Promise(r=>setTimeout(r,35));
  assert.equal(connections.length>=2,true);
  assert.equal(runtime.state().connected,true);
  await bridge.close();
  assert.equal(bridge.status().connected,false);
  assert.equal(connections.at(-1).disconnected,true);
  runtime.stop();
});
test("Studio V5 avatar endpoint has no raw IDs and supports fallback while disconnected",async t=>{
  const storage={enabled:false,load:async()=>null,save:async()=>{},close:async()=>{}};
  const mock=mockRoblox();
  const app=await createApp({adminKey:"studio-secret-key-long",studioV5Enabled:true,
    storage,disableTikTok:false,studioLiveEnabled:false,
    studioUsername:"examplelive",studioAvatarFetch:mock.fetchImpl,
    robloxLookup:mock.lookup,seedDemo:false});
  const address=await app.listen(0);
  t.after(()=>app.close());
  const base="http://127.0.0.1:"+address.port;
  const registered=await app.studioLiveBridge.chat(sample("secret-user-239","Builderman"));
  assert.equal(registered.ok,true);
  const response=await fetch(base+"/api/studio/avatars");
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.profiles.length,1);
  assert.equal(data.profiles[0].source,"roblox");
  assert.equal(data.profiles[0].robloxUsername,"Builderman");
  assert.ok(data.profiles[0].id.startsWith("tt-"));
  assert.equal(JSON.stringify(data).includes("secret-user-239"),false);
  assert.equal((await fetch(base+"/api/studio/state")).status,200);
  assert.equal((await fetch(base+"/api/state")).status,200);
});
