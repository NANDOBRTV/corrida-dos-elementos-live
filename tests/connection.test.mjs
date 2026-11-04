import test from "node:test";
import assert from "node:assert/strict";
import {createConnectionTracker,connectionMessage,STALE_AFTER_MS} from "../src/connection.js";

test("connection begins unverified and never claims online before a server snapshot",()=>{
  const tracker=createConnectionTracker();
  assert.equal(tracker.status(1500).phase,"connecting");
  assert.equal(tracker.status(1500).instanceId,null);
  assert.match(connectionMessage("connecting"),/AGUARDANDO/);
});
test("a fresh SSE frame switches to online; HTTP fallback stays degraded",()=>{
  const tracker=createConnectionTracker();
  tracker.receive({now:1000,source:"sse",instanceId:"instance-A"});
  assert.equal(tracker.status(1800).phase,"online");
  tracker.receive({now:3000,source:"http",instanceId:"instance-A"});
  assert.equal(tracker.status(3001).phase,"degraded");
  assert.equal(tracker.lastEventAt(),1000);
});
test("interrupted transport shows reconnecting and later stale",()=>{
  const tracker=createConnectionTracker();
  tracker.receive({now:1000,source:"sse"});
  tracker.interrupted();
  assert.equal(tracker.status(1001).phase,"reconnecting");
  assert.equal(tracker.status(1001+STALE_AFTER_MS+1).phase,"stale");
  assert.match(connectionMessage("stale"),/NÃO ATUALIZADO/);
});
test("successful fetch clears reconnecting without claiming SSE works",()=>{
  const tracker=createConnectionTracker();
  tracker.receive({now:1000,source:"sse"});
  tracker.interrupted();
  const incoming=tracker.receive({now:13000,source:"http"});
  assert.equal(incoming.restarted,false);
  assert.equal(tracker.status(13001).phase,"degraded");
});
test("a new Render process ID is detected once without resetting race state",()=>{
  const tracker=createConnectionTracker();
  assert.equal(tracker.receive({now:1000,source:"http",instanceId:"process-1"}).restarted,false);
  assert.equal(tracker.receive({now:2000,source:"sse",instanceId:"process-1"}).restarted,false);
  assert.equal(tracker.receive({now:3000,source:"http",instanceId:"process-2"}).restarted,true);
  assert.equal(tracker.receive({now:3100,source:"sse",instanceId:"process-2"}).restarted,false);
  assert.equal(tracker.status(3100).instanceId,"process-2");
});
test("missing or oversized process metadata cannot trigger a false restart",()=>{
  const tracker=createConnectionTracker();
  tracker.receive({now:1000,instanceId:"process-1"});
  assert.equal(tracker.receive({now:1100,instanceId:"x".repeat(100)}).restarted,false);
  assert.equal(tracker.receive({now:1200,instanceId:undefined}).restarted,false);
  assert.equal(tracker.status(1200).instanceId,"process-1");
});
test("staleness threshold is bounded and never driven by an invalid timestamp",()=>{
  const tracker=createConnectionTracker({staleAfterMs:100});
  tracker.receive({now:1000,source:"sse"});
  assert.equal(tracker.status(3999).phase,"online");
  assert.equal(tracker.status(4001).phase,"stale");
  tracker.receive({now:NaN,source:"sse"});
  assert.equal(tracker.status(4002).phase,"stale");
});
