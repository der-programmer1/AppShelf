import{test,expect,type Page}from"@playwright/test";
const password="factory-league-test-password";
test.beforeEach(async({request})=>{await request.post("/__test/reset");});
async function register(page:Page,name:string){
  await page.goto("/");await page.getByRole("button",{name:"Fabrik gründen",exact:true}).click();
  await page.getByLabel("Spielername",{exact:true}).fill(name);await page.getByLabel("Passwort",{exact:true}).fill(password);await page.getByLabel("Passwort wiederholen",{exact:true}).fill(password);
  await page.getByRole("button",{name:"Meine Fabrik gründen",exact:true}).click();
  const code=await page.getByTestId("recovery-code").textContent();expect(code).toMatch(/^FL-/);
  await page.getByLabel("Ich habe meinen Rettungscode sicher gespeichert.").check();await page.getByRole("button",{name:"Zu meiner Fabrik",exact:true}).click();
  await expect(page.getByText(`Schön, dass du da bist, ${name}. Was bauen wir heute?`)).toBeVisible();return code!;
}
test("register, build, reload, logout, login and recover preserve the real factory",async({page,request})=>{
  const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  const code=await register(page,"Patrice");
  await request.post("/__test/time",{data:{milliseconds:12000}});await page.reload();
  const smelter=page.locator(".machine-card").filter({has:page.getByRole("heading",{name:"Schmelze",exact:true})});
  await expect(smelter.getByRole("button",{name:/Ausbauen/})).toBeEnabled();await smelter.getByRole("button",{name:/Ausbauen/}).click();
  await expect(smelter.getByText("Stufe 2",{exact:true})).toBeVisible();await page.reload();await expect(smelter.getByText("Stufe 2",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Abmelden",exact:true}).click();await page.getByRole("button",{name:"Anmelden",exact:true}).click();
  await page.getByLabel("Spielername",{exact:true}).fill("Patrice");await page.getByLabel("Passwort",{exact:true}).fill(password);await page.getByRole("button",{name:"Fabrik öffnen",exact:true}).click();
  await expect(smelter.getByText("Stufe 2",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Abmelden",exact:true}).click();await page.getByRole("button",{name:"Anmelden",exact:true}).click();await page.getByRole("button",{name:"Passwort vergessen?",exact:true}).click();
  await page.getByLabel("Spielername",{exact:true}).fill("Patrice");await page.getByLabel("Rettungscode",{exact:true}).fill(code);await page.getByLabel("Neues Passwort",{exact:true}).fill("a-new-factory-password");await page.getByLabel("Passwort wiederholen",{exact:true}).fill("a-new-factory-password");await page.getByRole("button",{name:"Passwort erneuern",exact:true}).click();
  await expect(page.getByTestId("recovery-code")).not.toHaveText(code);await page.getByLabel("Ich habe meinen Rettungscode sicher gespeichert.").check();await page.getByRole("button",{name:"Zu meiner Fabrik",exact:true}).click();
  await expect(smelter.getByText("Stufe 2",{exact:true})).toBeVisible();expect(errors).toEqual([]);
});
test("two browser sessions share the leaderboard and overnight production remains capped",async({page,browser,request})=>{
  await register(page,"Alpha");
  const context=await browser.newContext({viewport:{width:390,height:844}}),second=await context.newPage();
  try{
    await register(second,"Beta");await request.post("/__test/time",{data:{milliseconds:20000}});await second.reload();
    await second.locator(".machine-card").filter({has:second.getByRole("heading",{name:"Schmelze",exact:true})}).getByRole("button",{name:/Ausbauen/}).click();
    await request.post("/__test/time",{data:{milliseconds:200000}});
    await page.goto("/leaderboard");await expect(page.locator(".ranking-row").filter({hasText:"Beta"})).toBeVisible();
    await expect(page.locator(".ranking-row").filter({hasText:"Beta"}).locator(".table-rank")).toHaveText("#1");
    await request.post("/__test/time",{data:{milliseconds:3*86400000}});await second.goto("/");await expect(second.getByText(/Nach 24 Stunden hat die Produktion pausiert/)).toBeVisible();
    await expect(second.getByText("Deine Fabrik war fleißig.")).toBeVisible();
  }finally{await context.close();}
});
test("responsive overview, tabs, public profiles and empty leaderboard work without fabricated players",async({page},testInfo)=>{
  await page.goto("/");await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(250);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await expect(page.getByRole("heading",{name:/Aus klein wird groß/})).toBeVisible();
  await page.getByRole("tab",{name:/Elektronik/}).click();await expect(page.getByRole("heading",{name:"Das nächste Kapitel deiner Fabrik."})).toBeVisible();
  await page.getByRole("tab",{name:/Metall/}).click();await expect(page.getByRole("heading",{name:"Schmelze",exact:true})).toBeVisible();
  await page.screenshot({path:testInfo.outputPath("factory-overview.png"),fullPage:true});
  await page.goto("/leaderboard");await expect(page.getByRole("heading",{name:/Die erste Fabrik/})).toBeVisible();await expect(page.locator(".ranking-row:not(.table-header)")).toHaveCount(0);
  await page.goto("/players/does-not-exist");await expect(page.getByRole("heading",{name:"Dieses Profil wurde nicht gefunden."})).toBeVisible();
});
