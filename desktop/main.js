const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, systemPreferences } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { getActiveWindow } = require('./active-window');
const { toIntegerPoint } = require('./position');

let petWindow, settingsWindow, tray, pollTimer, idleTimer, actionTimer;
let preferences, petState;
let paused = false;
let observing = false;
let moving = false;
let moveToken = 0;
let pendingWindow = null;
let lastDockedKey = '';
let currentWindow = null;

const defaults = { petName:'苔苔', petType:'moss', enabled:true, speech:true, launchAtLogin:false, workEnd:'18:00', personality:'淡人' };
const stateDefaults = { fullness:78, cleanliness:82, mood:80, energy:76, knowledge:0, coins:100, lastUpdated:Date.now() };
const profiles = [
  { id:'code', test:/Codex|Code|Terminal|Xcode|Cursor|Warp|iTerm|IntelliJ|WebStorm/i, actions:['type','inspect','coffee'] },
  { id:'chat', test:/微信|WeChat|飞书|Feishu|Slack|Teams|Messages|Telegram|Discord/i, actions:['peek','wave','listen'] },
  { id:'design', test:/Figma|Sketch|MasterGo|Photoshop|Illustrator|Affinity/i, actions:['admire','paint','measure'] },
  { id:'browser', test:/Chrome|Safari|Firefox|Arc|Edge|Opera/i, actions:['read','sleep','scroll'] },
  { id:'document', test:/Notes|Notion|Word|WPS|Pages|Excel|Numbers|语雀|Yuque/i, actions:['read','stamp','think'] },
  { id:'music', test:/Music|Spotify|网易云音乐|QQ音乐|YouTube Music/i, actions:['dance','listen','dance'] },
  { id:'default', test:/.*/, actions:['sit','look','stretch'] }
];

if (!app.requestSingleInstanceLock()) app.quit();

function profileFor(name='') { return profiles.find(p=>p.test.test(name)) || profiles.at(-1); }
function clamp(n,min,max) { return Math.min(max,Math.max(min,n)); }
function randomOf(items) { return items[Math.floor(Math.random()*items.length)]; }
function windowKey(win) { return win?.hasBounds ? `${win.name}|${win.x}|${win.y}|${win.width}|${win.height}` : win?.name || ''; }
function configPath() { return path.join(app.getPath('userData'),'preferences.json'); }
function statePath() { return path.join(app.getPath('userData'),'pet-state.json'); }
function loadPreferences() { try { return {...defaults,...JSON.parse(fs.readFileSync(configPath(),'utf8'))}; } catch { return {...defaults}; } }
function savePreferences(next) {
  preferences={...preferences,...next};
  fs.mkdirSync(path.dirname(configPath()),{recursive:true});
  fs.writeFileSync(configPath(),JSON.stringify(preferences,null,2));
  app.setLoginItemSettings({openAtLogin:Boolean(preferences.launchAtLogin)});
  petWindow?.webContents.send('preferences',preferences);
  rebuildTray();
}
function loadPetState() {
  let state;
  try { state={...stateDefaults,...JSON.parse(fs.readFileSync(statePath(),'utf8'))}; } catch { state={...stateDefaults}; }
  const hours=Math.min(24,Math.max(0,(Date.now()-state.lastUpdated)/3600000));
  state.fullness=clamp(state.fullness-hours*1.8,0,100);state.cleanliness=clamp(state.cleanliness-hours*1.2,0,100);state.energy=clamp(state.energy-hours*.8,0,100);state.lastUpdated=Date.now();
  return state;
}
function savePetState() { petState.lastUpdated=Date.now();fs.mkdirSync(path.dirname(statePath()),{recursive:true});fs.writeFileSync(statePath(),JSON.stringify(petState,null,2)); }
function statLabel(value){return value>=80?'很好':value>=50?'正常':value>=25?'有点低':'需要照顾';}
function performCare(action) {
  if(!petWindow)return;
  const effects={
    feed:{fullness:24,mood:3,coins:-8},bathe:{cleanliness:30,mood:2,energy:-2},exercise:{energy:-12,mood:12,fullness:-8},
    study:{knowledge:8,energy:-8,fullness:-4},work:{coins:18,energy:-12,fullness:-6,mood:-3},play:{mood:20,energy:-7,fullness:-4},travel:{mood:26,energy:-14,coins:-15}
  }[action]||{};
  for(const [key,delta] of Object.entries(effects))petState[key]=clamp((petState[key]||0)+delta,0,key==='coins'?9999:100);
  savePetState();
  petWindow.webContents.send('pet-action',{action,appName:currentWindow?.name||'桌面',profile:'care',speech:preferences.speech});
  rebuildTray();
}

function dockingPoint(win) {
  const display=screen.getDisplayNearestPoint({x:win.x+win.width/2,y:win.y+win.height/2});
  const area=display.workArea;
  const petW=230, petH=230, feetOffset=217;
  const hasTopSpace=win.y-area.y>=175;
  if(hasTopSpace) {
    const minX=Math.max(area.x-25,win.x-25);
    const maxX=Math.min(area.x+area.width-petW+25,win.x+win.width-petW+25);
    return {x:Math.round(clamp(win.x+win.width*.68-petW/2,minX,maxX)),y:Math.round(win.y-feetOffset),mode:'top'};
  }
  // When the title bar is too close to the screen top, land at a varied safe point inside this window.
  const inset=18;
  const candidates=[
    {x:win.x+inset,y:win.y+44},
    {x:win.x+win.width-petW-inset,y:win.y+44},
    {x:win.x+inset,y:win.y+win.height-petH-inset},
    {x:win.x+win.width-petW-inset,y:win.y+win.height-petH-inset}
  ];
  const p=randomOf(candidates);
  return {x:Math.round(clamp(p.x,area.x-25,area.x+area.width-petW+25)),y:Math.round(clamp(p.y,area.y,area.y+area.height-petH)),mode:'inside'};
}

function fallbackPoint() {
  const area=screen.getPrimaryDisplay().workArea;
  return {x:area.x+area.width-245,y:area.y+18,mode:'fallback'};
}

function setPetPosition(point) {
  const safePoint=toIntegerPoint(point);
  if(!petWindow||!safePoint)return false;
  try { petWindow.setPosition(safePoint.x,safePoint.y,false);return true; }
  catch { return false; }
}

function createPetWindow() {
  petWindow=new BrowserWindow({width:230,height:230,transparent:true,frame:false,resizable:false,hasShadow:false,alwaysOnTop:true,skipTaskbar:true,focusable:false,show:false,type:process.platform==='darwin'?'panel':undefined,webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false}});
  petWindow.setAlwaysOnTop(true,'floating');
  petWindow.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true});
  petWindow.loadFile(path.join(__dirname,'pet.html'));
  petWindow.once('ready-to-show',()=>{setPetPosition(fallbackPoint());if(preferences.enabled)petWindow.showInactive();petWindow.webContents.send('preferences',preferences);});
  petWindow.on('closed',()=>petWindow=null);
}

function createSettingsWindow() {
  if(settingsWindow){settingsWindow.show();return;}
  settingsWindow=new BrowserWindow({width:470,height:700,resizable:false,titleBarStyle:'hiddenInset',backgroundColor:'#e9e1d2',webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false}});
  settingsWindow.loadFile(path.join(__dirname,'settings.html'));
  settingsWindow.on('closed',()=>{settingsWindow=null;forceObserve();});
}

function createTray() {
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22"><path fill="#111" d="M4 9c0-4 3-7 7-7s7 3 7 7v6c0 3-2 5-5 5H9c-3 0-5-2-5-5V9Z"/><path fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" d="M7 10c1 1 2 1 3 0m2 0c1 1 2 1 3 0"/></svg>`;
  const icon=nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`).resize({width:18,height:18});icon.setTemplateImage(true);
  tray=new Tray(icon);tray.on('click',()=>petWindow?.showInactive());rebuildTray();
}
function setPaused(next) {
  paused=next;moveToken++;moving=false;pendingWindow=null;clearTimeout(actionTimer);clearTimeout(idleTimer);
  petWindow?.webContents.send('pet-action',{action:paused?'sleep':'wave',profile:'default',appName:'当前窗口'});
  rebuildTray();
  if(!paused) { lastDockedKey=''; setTimeout(()=>forceObserve(),120); }
}
function rebuildTray() {
  if(!tray)return;tray.setToolTip(`${preferences.petName} · 今天也没离职`);
  tray.setContextMenu(Menu.buildFromTemplate([
    {label:`${preferences.petName}正在工位上`,enabled:false},
    ...(process.platform==='darwin'&&!systemPreferences.isTrustedAccessibilityClient(false)?[{label:'⚠ 需要辅助功能权限',click:()=>systemPreferences.isTrustedAccessibilityClient(true)}]:[]),
    {type:'separator'},
    {label:`饱腹 ${statLabel(petState.fullness)} · 清洁 ${statLabel(petState.cleanliness)}`,enabled:false},
    {label:`心情 ${statLabel(petState.mood)} · 体力 ${statLabel(petState.energy)}`,enabled:false},
    {label:`知识 ${Math.round(petState.knowledge)} · 零花钱 ${Math.round(petState.coins)}`,enabled:false},
    {type:'separator'},
    {label:'和它玩',submenu:[
      {label:'🍙 喂点东西',click:()=>performCare('feed')},{label:'○ 洗个澡',click:()=>performCare('bathe')},{label:'◆ 运动一下',click:()=>performCare('exercise')},
      {label:'▤ 学习',click:()=>performCare('study')},{label:'$ 去打工',click:()=>performCare('work')},{label:'● 玩球',click:()=>performCare('play')},{label:'▣ 去旅行',click:()=>performCare('travel')}
    ]},
    {label:paused?'继续观察软件':'让它休息一下',click:()=>setPaused(!paused)},
    {label:petWindow?.isVisible()?'藏起来':'叫回来',click:()=>{petWindow?.isVisible()?petWindow.hide():petWindow?.showInactive();rebuildTray();if(petWindow?.isVisible())forceObserve();}},
    {label:'重新站到当前窗口',click:forceObserve},{label:'偏好设置…',click:createSettingsWindow},{type:'separator'},{label:'退出今天也没离职',role:'quit'}
  ]));
}

function playProfileAction(win) {
  if(paused||!petWindow)return;const profile=profileFor(win.name);const action=randomOf(profile.actions);
  petWindow.webContents.send('pet-action',{action,appName:win.name,profile:profile.id,speech:preferences.speech});
}
function chooseAutonomousAction() {
  if(petState.energy<24)return 'sleep';
  if(petState.fullness<30)return 'feed';
  if(petState.cleanliness<30)return randomOf(['bathe','swim']);
  const profile=currentWindow?profileFor(currentWindow.name):profiles.at(-1);
  return randomOf([...profile.actions,'wander','swim','feed','groom','exercise','play','sleep','stretch']);
}
function applyAutonomousEffect(action) {
  const effects={feed:{fullness:10,mood:2},bathe:{cleanliness:14},swim:{cleanliness:5,energy:-6,mood:8},groom:{cleanliness:6,mood:3},exercise:{energy:-7,fullness:-4,mood:6},play:{energy:-4,mood:8},sleep:{energy:16,fullness:-2},wander:{energy:-3,mood:3}}[action]||{};
  for(const [key,delta] of Object.entries(effects))petState[key]=clamp((petState[key]||0)+delta,0,100);
  savePetState();
}
function scheduleIdle() {
  clearTimeout(idleTimer);if(paused)return;
  idleTimer=setTimeout(()=>{
    if(currentWindow&&!moving){const action=chooseAutonomousAction();applyAutonomousEffect(action);petWindow?.webContents.send('pet-action',{action,appName:currentWindow.name,profile:profileFor(currentWindow.name).id,speech:preferences.speech});}
    scheduleIdle();
  },3200+Math.random()*3800);
}
function dockAt(win,force=false) {
  if(!petWindow||paused)return;
  const key=win.name;
  if(moving&&!force){pendingWindow=win;return;}
  if(!force&&key===lastDockedKey)return;
  moving=true;pendingWindow=null;clearTimeout(actionTimer);const token=++moveToken;let target=fallbackPoint();
  if(win.hasBounds){try{target=dockingPoint(win);}catch{target=fallbackPoint();}}
  const safeTarget=toIntegerPoint(target)||toIntegerPoint(fallbackPoint());if(!safeTarget){moving=false;return;}target={...target,...safeTarget};const profile=profileFor(win.name);
  const [sx,sy]=petWindow.getPosition();const started=Date.now();const distance=Math.hypot(target.x-sx,target.y-sy);const duration=clamp(560+distance*.14,620,1050);
  petWindow.webContents.send('pet-action',{action:'jump',appName:win.name,profile:profile.id,anchorMode:target.mode,speech:preferences.speech});
  const tick=()=>{if(!petWindow||token!==moveToken)return;const t=Math.min(1,(Date.now()-started)/duration),e=1-Math.pow(1-t,3),arc=Math.sin(t*Math.PI)*clamp(distance*.13,48,115);if(!setPetPosition({x:sx+(target.x-sx)*e,y:sy+(target.y-sy)*e-arc})){moving=false;lastDockedKey='';return;}if(t<1)return setTimeout(tick,16);
    moving=false;lastDockedKey=key;petWindow.webContents.send('pet-action',{action:'arrive',appName:win.name,profile:profile.id,anchorMode:target.mode,speech:preferences.speech});
    clearTimeout(actionTimer);actionTimer=setTimeout(()=>playProfileAction(win),850);scheduleIdle();
    if(pendingWindow){const next=pendingWindow;pendingWindow=null;setTimeout(()=>dockAt(next),80);}
  };tick();
}

async function observeDesktop(force=false) {
  if(observing||paused||!preferences.enabled||!petWindow?.isVisible())return;observing=true;
  try {
    const win=await getActiveWindow();if(!win?.name||['Electron','osascript','今天也没离职'].includes(win.name))return;
    const previousApp=currentWindow?.name;currentWindow=win;
    if(force||win.name!==previousApp||win.name!==lastDockedKey)dockAt(win,force);
  } finally { observing=false; }
}
function forceObserve(){lastDockedKey='';observeDesktop(true);}

ipcMain.on('pet-hover',()=>{});
ipcMain.on('pet-drag',(_e,p)=>{if(petWindow&&toIntegerPoint(p)){moveToken++;moving=false;setPetPosition({x:p.x-115,y:p.y-115});}});
ipcMain.handle('get-preferences',()=>preferences);
ipcMain.handle('save-preferences',(_e,next)=>{savePreferences(next);return preferences;});
ipcMain.on('pet-context-menu',()=>Menu.buildFromTemplate([
  {label:`${preferences.petName} · ${preferences.petType==='cat'?'小猫':preferences.petType==='dog'?'小狗':'苔精灵'}`,enabled:false},
  {label:`饱腹 ${Math.round(petState.fullness)}  清洁 ${Math.round(petState.cleanliness)}  心情 ${Math.round(petState.mood)}`,enabled:false},{type:'separator'},
  {label:'和它玩',submenu:[{label:'🍙 喂点东西',click:()=>performCare('feed')},{label:'○ 洗个澡',click:()=>performCare('bathe')},{label:'◆ 运动一下',click:()=>performCare('exercise')},{label:'▤ 学习',click:()=>performCare('study')},{label:'$ 去打工',click:()=>performCare('work')},{label:'● 玩球',click:()=>performCare('play')},{label:'▣ 去旅行',click:()=>performCare('travel')}]},
  {label:paused?'继续观察软件':'让它休息一下',click:()=>setPaused(!paused)},{label:'重新站到当前窗口',click:forceObserve},{label:'偏好设置…',click:createSettingsWindow},{type:'separator'},{label:'关闭宠物',click:()=>app.quit()}
]).popup({window:petWindow}));

app.whenReady().then(()=>{app.setName('今天也没离职');if(process.platform==='darwin')app.dock.hide();preferences=loadPreferences();petState=loadPetState();savePetState();createPetWindow();createTray();scheduleIdle();pollTimer=setInterval(()=>observeDesktop(false),700);});
app.on('second-instance',()=>{petWindow?.showInactive();forceObserve();});
app.on('before-quit',()=>{clearInterval(pollTimer);clearTimeout(idleTimer);clearTimeout(actionTimer);});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
