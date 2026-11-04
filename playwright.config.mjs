import {defineConfig} from "@playwright/test";

export default defineConfig({
  testDir:"./e2e",
  timeout:90_000,
  expect:{timeout:25_000},
  workers:1,
  retries:process.env.CI?1:0,
  reporter:[["list"],["html",{open:"never",outputFolder:"playwright-report"}]],
  outputDir:"test-results",
  use:{
    baseURL:"http://127.0.0.1:4173",
    viewport:{width:390,height:844},
    deviceScaleFactor:1,
    isMobile:true,
    hasTouch:true,
    screenshot:"only-on-failure",
    trace:"retain-on-failure",
    headless:true,
    launchOptions:{args:[
      "--enable-webgl",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--ignore-gpu-blocklist",
      "--disable-dev-shm-usage"
    ]}
  },
  webServer:{
    command:"npm start",
    url:"http://127.0.0.1:4173/health",
    reuseExistingServer:!process.env.CI,
    timeout:90_000,
    env:{
      NODE_ENV:"test",
      PORT:"4173",
      ADMIN_KEY:"integration-test-only-not-for-real-render",
      TIKTOK_LIVE_MODE:"disabled",
      TIKTOK_USERNAME:""
    }
  }
});
