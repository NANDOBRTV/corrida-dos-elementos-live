import test from "node:test";
import assert from "node:assert/strict";
import {pseudonymizeTikTokUser} from "../server/privacy.js";
import {normalizeTikTokChat,normalizeTikTokGift} from "../server/tiktok.js";

const secret="secret-only-kept-in-render-environment-01";
test("TikTok sender is hashed deterministically",()=>{
  const first=pseudonymizeTikTokUser("72999999888777666",secret);
  const second=pseudonymizeTikTokUser("72999999888777666",secret);
  assert.equal(first,second);
  assert.match(first,/^tt-[0-9a-f]{32}$/);
  assert.ok(!first.includes("72999999888777666"));
});
test("Different accounts produce different public IDs",()=>{
  const a=pseudonymizeTikTokUser("viewer-a",secret);
  const b=pseudonymizeTikTokUser("viewer-b",secret);
  assert.notEqual(a,b);
});
test("Changing Render identity secret rotates public IDs",()=>{
  assert.notEqual(pseudonymizeTikTokUser("viewer-a",secret),pseudonymizeTikTokUser("viewer-a",secret+"-rotated"));
});
test("Chat and gift from the same user refer to the same runner",()=>{
  const chat=normalizeTikTokChat({comment:"entrar",user:{userId:"actual-platform-id",nickname:"Ana"}});
  const gift=normalizeTikTokGift({
    user:{userId:"actual-platform-id",nickname:"Ana"},giftId:"5",
    gift:{type:2,name:"Coração"},repeatCount:1
  });
  assert.ok(chat);
  assert.ok(gift);
  assert.equal(pseudonymizeTikTokUser(chat.userId,secret),pseudonymizeTikTokUser(gift.userId,secret));
});
test("Identity hashing requires a meaningful secret and user ID",()=>{
  assert.throws(()=>pseudonymizeTikTokUser("viewer-a","short"));
  assert.throws(()=>pseudonymizeTikTokUser("",secret));
  assert.throws(()=>pseudonymizeTikTokUser("x".repeat(129),secret));
});
