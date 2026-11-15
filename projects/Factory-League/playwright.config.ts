import {defineConfig} from "@playwright/test";
export default defineConfig({
  testDir:"e2e",fullyParallel:false,workers:1,timeout:30000,
  use:{baseURL:"http://127.0.0.1:4173",trace:"retain-on-failure",launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:["--no-sandbox"]}},
  webServer:{command:"NODE_ENV=test node --import tsx scripts/test-server.ts",url:"http://127.0.0.1:4173/health",reuseExistingServer:false,timeout:30000},
  projects:[{name:"desktop",use:{viewport:{width:1280,height:900}}},{name:"mobile",use:{viewport:{width:390,height:844}}}]
});
