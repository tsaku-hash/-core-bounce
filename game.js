
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const livesEl = document.getElementById("lives");
const stageEl = document.getElementById("stage");
const startScreen = document.getElementById("startScreen");
const gameOver = document.getElementById("gameOver");
const finalScore = document.getElementById("finalScore");
const resultTitle = document.getElementById("resultTitle");
const startBtn = document.getElementById("startBtn");
const retryBtn = document.getElementById("retryBtn");
const soundBtn = document.getElementById("soundBtn");

let W=0,H=0,dpr=1;
let running=false;
let score=0,lives=3,stage=1;
let leftPressed=false,rightPressed=false;
let shake=0,last=0;
let particles=[],debris=[],bumpers=[],bars=[],monsters=[];
let combo=0,comboTimer=0,stageMessageTimer=0;

const ball={x:0,y:0,r:11,vx:0,vy:0};
const flippers={
  left:{x:0,y:0,len:74,angle:-0.3,rest:-0.3,active:-0.95},
  right:{x:0,y:0,len:74,angle:Math.PI+0.3,rest:Math.PI+0.3,active:Math.PI+0.95}
};

// ------------ AUDIO ------------
let audioCtx=null, masterGain=null, musicTimer=null, audioEnabled=true;
function initAudio(){
  if(audioCtx){ if(audioCtx.state==="suspended") audioCtx.resume(); return; }
  audioCtx = new (window.AudioContext||window.webkitAudioContext)();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.22;
  masterGain.connect(audioCtx.destination);
}
function tone(freq=440,duration=.08,type="sine",volume=.18,slideTo=null){
  if(!audioEnabled) return;
  initAudio();
  const now=audioCtx.currentTime;
  const osc=audioCtx.createOscillator();
  const gain=audioCtx.createGain();
  osc.type=type;
  osc.frequency.setValueAtTime(freq, now);
  if(slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20,slideTo), now+duration);
  gain.gain.setValueAtTime(.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now+.01);
  gain.gain.exponentialRampToValueAtTime(.0001, now+duration);
  osc.connect(gain); gain.connect(masterGain);
  osc.start(now); osc.stop(now+duration+.03);
}
function noise(duration=.08, volume=.05){
  if(!audioEnabled) return;
  initAudio();
  const len=Math.floor(audioCtx.sampleRate*duration);
  const buf=audioCtx.createBuffer(1,len,audioCtx.sampleRate);
  const data=buf.getChannelData(0);
  for(let i=0;i<len;i++) data[i]=(Math.random()*2-1)*(1-i/len);
  const src=audioCtx.createBufferSource();
  const g=audioCtx.createGain();
  g.gain.value=volume;
  src.buffer=buf; src.connect(g); g.connect(masterGain); src.start();
}
const sfx={
  flip:()=>tone(145,.055,"square",.10,230),
  bumper:()=>{tone(620,.07,"sine",.13,900);setTimeout(()=>tone(930,.05,"sine",.08),35)},
  bar:()=>{tone(520,.06,"square",.09,820); setTimeout(()=>tone(340,.04,"square",.05),28)},
  hit:()=>{tone(240,.09,"sawtooth",.12,150);noise(.05,.035)},
  crack:()=>{tone(180,.07,"square",.11,90);noise(.06,.045)},
  down:()=>{tone(520,.09,"square",.11,760);setTimeout(()=>tone(780,.10,"square",.10,1100),70)},
  stage:()=>[523,659,784].forEach((f,i)=>setTimeout(()=>tone(f,.14,"triangle",.10),i*100)),
  lost:()=>{tone(330,.12,"sine",.11,220);setTimeout(()=>tone(220,.18,"sine",.09,110),110)},
  gameover:()=>[330,277,220,165].forEach((f,i)=>setTimeout(()=>tone(f,.23,"triangle",.10),i*140))
};
function stopMusic(){ if(musicTimer){ clearInterval(musicTimer); musicTimer=null; } }
function startMusic(){
  stopMusic();
  if(!audioEnabled) return;
  initAudio();
  let step=0;
  const notes=[110,0,165,0,147,0,196,0,110,0,220,0,165,0,147,0];
  musicTimer=setInterval(()=>{
    if(!running || !audioEnabled) return;
    const f=notes[step%notes.length];
    if(f) tone(f,.18,"triangle",.035);
    if(step%4===0) tone(55,.11,"sine",.025);
    step++;
  },230);
}
function setAudio(on){
  audioEnabled=on;
  soundBtn.textContent=on?"🔊":"🔇";
  if(on){ initAudio(); if(running) startMusic(); } else stopMusic();
}
soundBtn.onclick=()=>setAudio(!audioEnabled);

// ------------ UTILS ------------
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function rand(a,b){ return a + Math.random()*(b-a); }
function addGlowBurst(x,y,n=10,color="#9bf5ff"){
  for(let i=0;i<n;i++){
    const a=Math.random()*Math.PI*2, s=40+Math.random()*140;
    particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.35+Math.random()*.35,size:3+Math.random()*2,color});
  }
}
function addDebris(x,y,color,count=12,size=4){
  for(let i=0;i<count;i++){
    const a=Math.random()*Math.PI*2,s=60+Math.random()*190;
    debris.push({
      x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.45+Math.random()*.55,size:size*(.5+Math.random()*1.2),
      rot:Math.random()*Math.PI*2,vr:rand(-8,8),color
    });
  }
}
function speedUpBall(minSpeed){
  const sp = Math.hypot(ball.vx, ball.vy);
  if(sp < minSpeed && sp > 0){
    ball.vx = ball.vx / sp * minSpeed;
    ball.vy = ball.vy / sp * minSpeed;
  }
}

// ------------ SETUP ------------
function resize(){
  dpr=Math.min(window.devicePixelRatio||1,2);
  const r=canvas.getBoundingClientRect();
  W=r.width; H=r.height;
  canvas.width=Math.floor(W*dpr);
  canvas.height=Math.floor(H*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  flippers.left.x=W*.44; flippers.right.x=W*.56;
  flippers.left.y=flippers.right.y=H-78;
  resetBall(true);
  buildBoard();
  spawnStage(stage);
}
window.addEventListener("resize", resize);

function makeBar(x,y,len,angle,amp=0.16,speed=1.2){
  return {x,y,len,angle,baseAngle:angle,amp,speed,t:Math.random()*10,thickness:14};
}
function makeMonster(x,y,hp,type,index){
  return {
    x,y,baseX:x,baseY:y,hp,maxHp:hp,
    t:Math.random()*10,
    phase:Math.random()*Math.PI*2,
    type,
    index,
    hitFlash:0
  };
}
function buildBoard(){
  bumpers=[
    {x:W*.16,y:H*.28,r:22},
    {x:W*.84,y:H*.28,r:22},
    {x:W*.33,y:H*.44,r:24},
    {x:W*.67,y:H*.44,r:24},
    {x:W*.50,y:H*.58,r:28}
  ];
  bars=[];
}
function spawnStage(n){
  const configs = [
    {type:"slime",   color:"#f6a21a"},
    {type:"bat",     color:"#a86cff"},
    {type:"beetle",  color:"#55c66f"},
    {type:"ghost",   color:"#56d9ff"},
    {type:"golem",   color:"#e66d55"},
    {type:"horned",  color:"#ffd24f"}
  ];

  // Stageごとに少しずつ数を増やす。最大7体。
  const count = Math.min(3 + Math.floor((n-1)/2), 7);

  // HPは序盤は分かりやすく、後半ほどしっかり増える。
  const baseHp = n <= 2 ? n : 2 + Math.floor((n-1)*0.8);

  const slots = [
    [0.18,0.14],[0.50,0.17],[0.82,0.14],
    [0.30,0.30],[0.70,0.30],
    [0.20,0.43],[0.80,0.43]
  ];

  monsters = [];
  for(let i=0;i<count;i++){
    const cfg = configs[(n+i-1)%configs.length];
    let hp = baseHp;

    // 5ステージごとに強敵を混ぜる
    if(n>=5 && i===0) hp += Math.ceil(n*0.6);

    const [px,py]=slots[i];
    const m = makeMonster(W*px,H*py,hp,cfg.type,i);
    m.color = cfg.color;
    m.scale = (n>=5 && i===0) ? 1.28 : 1.0;
    m.moveMode = n<=1 ? "still" :
                 n<=3 ? (i%2===0 ? "horizontal":"still") :
                 n<=5 ? (i%3===0 ? "vertical":"horizontal") :
                         (i%3===0 ? "vertical" : i%3===1 ? "horizontal" : "orbit");
    monsters.push(m);
  }

  stageMessageTimer = 1.8;
  updateHud();
}
function resetBall(initial=false){
  ball.x=W*.5; ball.y=H-130;
  ball.vx=initial?0:(Math.random()>.5?1:-1)*115;
  ball.vy=initial?0:-325;
}
function startGame(){
  initAudio();
  score=0; lives=3; stage=1;
  particles=[]; debris=[]; combo=0; comboTimer=0;
  buildBoard(); spawnStage(stage); resetBall(false);
  running=true;
  startScreen.classList.remove("show");
  gameOver.classList.remove("show");
  updateHud(); startMusic();
}
startBtn.onclick=startGame;
retryBtn.onclick=startGame;

function updateHud(){
  stageEl.textContent="STAGE " + stage;
  scoreEl.textContent="SCORE " + String(score).padStart(6,"0");
  livesEl.textContent="CORE × " + lives;
}
function setInput(side,val){
  if(side==="left") leftPressed=val; else rightPressed=val;
}
for(const [id,side] of [["leftBtn","left"],["rightBtn","right"]]){
  const el=document.getElementById(id);
  el.addEventListener("pointerdown", e=>{ e.preventDefault(); setInput(side,true); sfx.flip(); });
  ["pointerup","pointercancel","pointerleave"].forEach(ev=>el.addEventListener(ev,()=>setInput(side,false)));
}
canvas.addEventListener("pointerdown", e=>{ if(!running) return; setInput(e.clientX<W/2?"left":"right", true); sfx.flip(); });
canvas.addEventListener("pointerup", ()=>{leftPressed=false; rightPressed=false;});
canvas.addEventListener("pointercancel", ()=>{leftPressed=false; rightPressed=false;});

// ------------ COLLISION ------------
function collideCircle(obj,power=1.08,points=50){
  let dx=ball.x-obj.x, dy=ball.y-obj.y;
  let d=Math.hypot(dx,dy);
  const min=ball.r+obj.r;
  if(d<min && d>0){
    const nx=dx/d, ny=dy/d;
    ball.x=obj.x+nx*min; ball.y=obj.y+ny*min;
    const dot=ball.vx*nx+ball.vy*ny;
    if(dot<0){ ball.vx-=2*dot*nx; ball.vy-=2*dot*ny; }
    ball.vx*=power; ball.vy*=power;
    score+=points; shake=5; addGlowBurst(ball.x,ball.y,8);
    return true;
  }
  return false;
}
function collideMonster(m){
  // circle-ish collision for monster body
  const r = 26 * (m.scale || 1);
  let dx=ball.x-m.x, dy=ball.y-m.y;
  let d=Math.hypot(dx,dy);
  const min=ball.r+r;
  if(d<min && d>0){
    const nx=dx/d, ny=dy/d;
    ball.x=m.x+nx*min; ball.y=m.y+ny*min;
    const dot=ball.vx*nx+ball.vy*ny;
    if(dot<0){ ball.vx-=2*dot*nx; ball.vy-=2*dot*ny; }
    ball.vx*=1.08; ball.vy*=1.08;
    speedUpBall(420);
    score += 100;
    shake = 6;
    addGlowBurst(ball.x,ball.y,10,"#ffe3ad");
    return true;
  }
  return false;
}
function collideSegmentBar(bar){
  const x1=bar.x - Math.cos(bar.angle)*bar.len/2;
  const y1=bar.y - Math.sin(bar.angle)*bar.len/2;
  const x2=bar.x + Math.cos(bar.angle)*bar.len/2;
  const y2=bar.y + Math.sin(bar.angle)*bar.len/2;
  const vx=x2-x1, vy=y2-y1;
  const wx=ball.x-x1, wy=ball.y-y1;
  const t=clamp((wx*vx+wy*vy)/(vx*vx+vy*vy),0,1);
  const px=x1+t*vx, py=y1+t*vy;
  let dx=ball.x-px, dy=ball.y-py;
  let d=Math.hypot(dx,dy);
  const min=ball.r+bar.thickness/2;
  if(d<min){
    if(d===0){ dx=0; dy=-1; d=1; }
    const nx=dx/d, ny=dy/d;
    ball.x=px+nx*min; ball.y=py+ny*min;

    // 補助バーは方向を変える程度。主役は下のメインフリッパー。
    const dot=ball.vx*nx+ball.vy*ny;
    if(dot<0){
      ball.vx-=2*dot*nx;
      ball.vy-=2*dot*ny;
    }
    ball.vx += nx*55;
    ball.vy += ny*55;
    speedUpBall(390);
    const sp=Math.hypot(ball.vx,ball.vy), maxSp=760;
    if(sp>maxSp){
      ball.vx = ball.vx/sp*maxSp;
      ball.vy = ball.vy/sp*maxSp;
    }

    score += 30;
    shake = 5;
    addGlowBurst(ball.x,ball.y,6,"#bdf8ff");
    sfx.bar();
    return true;
  }
  return false;
}
function collideFlipper(f,pressed){
  const target=pressed?f.active:f.rest;
  f.angle += (target-f.angle)*0.38;

  const x2=f.x+Math.cos(f.angle)*f.len;
  const y2=f.y+Math.sin(f.angle)*f.len;
  const vx=x2-f.x, vy=y2-f.y;
  const wx=ball.x-f.x, wy=ball.y-f.y;
  const t=clamp((wx*vx+wy*vy)/(vx*vx+vy*vy),0,1);
  const px=f.x+t*vx, py=f.y+t*vy;
  const dx=ball.x-px, dy=ball.y-py;
  const d=Math.hypot(dx,dy), min=ball.r+8;

  if(d<min && d>0 && ball.vy>-850){
    const nx=dx/d, ny=dy/d;
    ball.x=px+nx*min;
    ball.y=py+ny*min;

    // 先端で打つほど大きく飛ぶ。タップ中はさらに強い。
    const tipPower = 0.72 + t*0.95;
    const pressPower = pressed ? 1.0 : 0.62;
    const launch = 390 * tipPower * pressPower;

    // 基本は強く上方向へ。左右のフリッパーで少し横方向も付ける。
    const side = (f===flippers.left ? 1 : -1);
    ball.vx = ball.vx*0.35 + side*(150 + 170*t) + nx*launch*0.42;
    ball.vy = -Math.max(390, 440 + 180*t) - Math.abs(ny)*launch*0.18;

    // フリッパー先端なら画面上部まで届く速度を保証。
    const minLaunchSpeed = pressed ? (t>0.65 ? 520 : 470) : 400;
    speedUpBall(minLaunchSpeed);

    const sp=Math.hypot(ball.vx,ball.vy), maxSp=690;
    if(sp>maxSp){
      ball.vx=ball.vx/sp*maxSp;
      ball.vy=ball.vy/sp*maxSp;
    }

    score+=15;
    shake=pressed ? 7 : 4;
    addGlowBurst(ball.x,ball.y,pressed?9:5,"#c9fbff");
  }
}
function damageMonster(m){
  if(m.hp<=0) return;
  m.hp--;
  m.hitFlash=.14;
  combo++;
  comboTimer=1.25;
  score += 150 * combo;
  addDebris(m.x+rand(-8,8),m.y+rand(-8,8),"#ffca63",12,4);
  shake = 7;
  if(m.hp<=0){
    score += 600;
    addDebris(m.x,m.y,"#ffe7a8",26,7);
    addGlowBurst(m.x,m.y,24,"#fff1bd");
    sfx.down();
  }else{
    sfx.crack();
    sfx.hit();
  }
}

// ------------ UPDATE ------------
function update(dt){
  if(!running) return;

  comboTimer -= dt;
  if(comboTimer<=0){ comboTimer=0; combo=0; }
  if(stageMessageTimer>0) stageMessageTimer -= dt;

  monsters.forEach(m=>{
    m.t += dt;
    if(m.hitFlash>0) m.hitFlash -= dt;

    const difficulty = Math.min(stage,10);
    const ampX = 10 + difficulty*2.5;
    const ampY = 7 + difficulty*1.6;
    const speed = 0.9 + difficulty*0.09;

    if(m.moveMode==="horizontal"){
      m.x = m.baseX + Math.sin(m.t*speed + m.phase)*ampX;
      m.y = m.baseY;
    }else if(m.moveMode==="vertical"){
      m.x = m.baseX;
      m.y = m.baseY + Math.sin(m.t*speed + m.phase)*ampY;
    }else if(m.moveMode==="orbit"){
      m.x = m.baseX + Math.cos(m.t*speed + m.phase)*ampX*.8;
      m.y = m.baseY + Math.sin(m.t*speed + m.phase)*ampY*.8;
    }else{
      m.x = m.baseX;
      m.y = m.baseY;
    }
  });

  ball.vy += 485*dt;
  ball.x += ball.vx*dt;
  ball.y += ball.vy*dt;

  if(ball.x-ball.r<12){ ball.x=12+ball.r; ball.vx=Math.abs(ball.vx)*.94; }
  if(ball.x+ball.r>W-12){ ball.x=W-12-ball.r; ball.vx=-Math.abs(ball.vx)*.94; }
  if(ball.y-ball.r<10){ ball.y=10+ball.r; ball.vy=Math.abs(ball.vy)*.94; }

  // 下部ガイドは短め。左右にも落下できる隙間を作る。
  if(ball.y>H-150 && ball.y<H-74){
    const leftGuideY = H-134 + (ball.x-18)*0.18;
    const rightGuideY = H-134 + (W-18-ball.x)*0.18;

    // 左ガイドは画面左端〜約26%まで
    if(ball.x<W*.26 && ball.y>leftGuideY && ball.vy>0){
      ball.y=leftGuideY-2;
      ball.vy=-Math.abs(ball.vy)*0.52;
      ball.vx+=42;
    }

    // 右ガイドは約74%〜右端
    if(ball.x>W*.74 && ball.y>rightGuideY && ball.vy>0){
      ball.y=rightGuideY-2;
      ball.vy=-Math.abs(ball.vy)*0.52;
      ball.vx-=42;
    }
  }

  // 3つのドレインゾーン。
  // 左右はフリッパー外側、中央はフリッパー間。
  const leftDrainR=W*.36;
  const centerDrainL=W*.465;
  const centerDrainR=W*.535;
  const rightDrainL=W*.64;

  if(ball.y>H-70){
    const inLeftDrain = ball.x < leftDrainR;
    const inCenterDrain = ball.x > centerDrainL && ball.x < centerDrainR;
    const inRightDrain = ball.x > rightDrainL;
    if(inLeftDrain || inCenterDrain || inRightDrain){
      ball.y=H+60;
    }
  }

  collideFlipper(flippers.left,leftPressed);
  collideFlipper(flippers.right,rightPressed);
  bumpers.forEach(b=>{ if(collideCircle(b,1.12,80)) sfx.bumper(); });

  monsters.forEach(m=>{
    if(m.hp>0 && collideMonster(m)){
      damageMonster(m);
    }
  });

  if(monsters.every(m=>m.hp<=0)){
    stage++;
    sfx.stage();
    spawnStage(stage);
    resetBall(false);
  }

  if(ball.y>H+40){
    lives--;
    combo=0; comboTimer=0;
    sfx.lost();
    updateHud();
    if(lives<=0){
      running=false;
      stopMusic();
      sfx.gameover();
      resultTitle.textContent="SYSTEM DOWN";
      finalScore.textContent="SCORE "+score;
      gameOver.classList.add("show");
    }else{
      resetBall(false);
    }
  }

  particles.forEach(p=>{ p.x+=p.vx*dt; p.y+=p.vy*dt; p.vy+=180*dt; p.life-=dt; });
  particles = particles.filter(p=>p.life>0);

  debris.forEach(d=>{ d.x+=d.vx*dt; d.y+=d.vy*dt; d.vy+=220*dt; d.rot+=d.vr*dt; d.life-=dt; });
  debris = debris.filter(d=>d.life>0);

  shake *= .86;
  updateHud();
}

// ------------ DRAW ------------
function drawBoard(){
  const g=ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,"#0d2237");
  g.addColorStop(1,"#06101d");
  ctx.fillStyle=g;
  ctx.fillRect(0,0,W,H);

  ctx.strokeStyle="rgba(94,221,255,.08)";
  ctx.lineWidth=1;
  for(let y=30;y<H;y+=34){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
  for(let x=20;x<W;x+=40){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }

  ctx.strokeStyle="rgba(101,233,255,.45)";
  ctx.lineWidth=4;
  ctx.beginPath();
  ctx.moveTo(12,H); ctx.lineTo(12,48);
  ctx.quadraticCurveTo(12,12,48,12);
  ctx.lineTo(W-48,12);
  ctx.quadraticCurveTo(W-12,12,W-12,48);
  ctx.lineTo(W-12,H);
  ctx.stroke();
}
function drawFlipper(f){
  const x2=f.x+Math.cos(f.angle)*f.len, y2=f.y+Math.sin(f.angle)*f.len;
  ctx.strokeStyle="#75efff"; ctx.lineWidth=15; ctx.lineCap="round"; ctx.shadowBlur=14; ctx.shadowColor="#2bdcff";
  ctx.beginPath(); ctx.moveTo(f.x,f.y); ctx.lineTo(x2,y2); ctx.stroke();
  ctx.shadowBlur=0; ctx.strokeStyle="rgba(255,255,255,.65)"; ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(f.x,f.y); ctx.lineTo(x2,y2); ctx.stroke();
}
function drawBar(bar){
  const x1=bar.x - Math.cos(bar.angle)*bar.len/2;
  const y1=bar.y - Math.sin(bar.angle)*bar.len/2;
  const x2=bar.x + Math.cos(bar.angle)*bar.len/2;
  const y2=bar.y + Math.sin(bar.angle)*bar.len/2;
  ctx.strokeStyle="#66efff"; ctx.lineWidth=bar.thickness; ctx.lineCap="round"; ctx.shadowBlur=18; ctx.shadowColor="#2bdcff";
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  ctx.shadowBlur=0; ctx.strokeStyle="rgba(255,255,255,.75)"; ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  ctx.fillStyle="rgba(180,250,255,.9)";
  ctx.beginPath(); ctx.arc(bar.x,bar.y,4.5,0,Math.PI*2); ctx.fill();
}
function drawBumper(b){
  const gg=ctx.createRadialGradient(b.x-6,b.y-7,4,b.x,b.y,b.r);
  gg.addColorStop(0,"#ffffff");
  gg.addColorStop(.12,"#a7f8ff");
  gg.addColorStop(.45,"#23cce7");
  gg.addColorStop(1,"#103b5e");
  ctx.fillStyle=gg;
  ctx.shadowBlur=18; ctx.shadowColor="#3de9ff";
  ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,Math.PI*2); ctx.fill();
  ctx.shadowBlur=0;
  ctx.strokeStyle="rgba(255,255,255,.65)";
  ctx.lineWidth=2;
  ctx.stroke();
}
function drawMonster(m){
  if(m.hp<=0) return;

  const hpRatio = m.hp / m.maxHp;
  const damage = 1-hpRatio;
  const s = m.scale || 1;

  ctx.save();
  ctx.translate(m.x,m.y);
  ctx.scale(s,s);

  if(m.hitFlash>0){
    ctx.shadowBlur=30;
    ctx.shadowColor="#ffffff";
  }else{
    ctx.shadowBlur=16;
    ctx.shadowColor=m.color;
  }

  const c=m.color;

  // 種類ごとにシルエットを変える
  if(m.type==="slime"){
    ctx.fillStyle=c;
    ctx.beginPath();
    ctx.moveTo(-24,14);
    ctx.quadraticCurveTo(-28,-12,0,-24);
    ctx.quadraticCurveTo(28,-12,24,14);
    ctx.quadraticCurveTo(12,24,0,18);
    ctx.quadraticCurveTo(-12,24,-24,14);
    ctx.fill();
  }else if(m.type==="bat"){
    ctx.fillStyle=c;
    ctx.beginPath();
    ctx.moveTo(-8,-10);
    ctx.quadraticCurveTo(-22,-26,-32,-10);
    ctx.lineTo(-20,-4);
    ctx.lineTo(-30,8);
    ctx.quadraticCurveTo(-14,12,-5,6);
    ctx.quadraticCurveTo(0,18,5,6);
    ctx.quadraticCurveTo(14,12,30,8);
    ctx.lineTo(20,-4);
    ctx.lineTo(32,-10);
    ctx.quadraticCurveTo(22,-26,8,-10);
    ctx.closePath();
    ctx.fill();
  }else if(m.type==="beetle"){
    ctx.fillStyle=c;
    ctx.beginPath();
    ctx.ellipse(0,2,22,28,0,0,Math.PI*2);
    ctx.fill();
    ctx.strokeStyle="rgba(0,0,0,.3)";
    ctx.lineWidth=3;
    ctx.beginPath();ctx.moveTo(0,-24);ctx.lineTo(0,26);ctx.stroke();
    ctx.lineWidth=4;
    [-12,0,12].forEach(y=>{
      ctx.beginPath();ctx.moveTo(-18,y);ctx.lineTo(-31,y-7);ctx.stroke();
      ctx.beginPath();ctx.moveTo(18,y);ctx.lineTo(31,y-7);ctx.stroke();
    });
  }else if(m.type==="ghost"){
    ctx.fillStyle=c;
    ctx.beginPath();
    ctx.arc(0,-3,23,Math.PI,0);
    ctx.lineTo(23,18);
    ctx.lineTo(12,11);
    ctx.lineTo(3,20);
    ctx.lineTo(-7,11);
    ctx.lineTo(-18,20);
    ctx.lineTo(-23,18);
    ctx.closePath();
    ctx.fill();
  }else if(m.type==="golem"){
    ctx.fillStyle=c;
    ctx.fillRect(-23,-20,46,40);
    ctx.fillStyle="rgba(255,255,255,.15)";
    ctx.fillRect(-18,-15,14,10);
    ctx.fillRect(4,-15,14,10);
    ctx.strokeStyle="rgba(0,0,0,.25)";
    ctx.lineWidth=3;
    ctx.beginPath();ctx.moveTo(-22,0);ctx.lineTo(-10,8);ctx.lineTo(-2,2);ctx.lineTo(8,10);ctx.stroke();
  }else{
    // horned
    ctx.fillStyle=c;
    ctx.beginPath();
    ctx.moveTo(-22,15);
    ctx.lineTo(-18,-13);
    ctx.lineTo(-28,-28);
    ctx.lineTo(-7,-20);
    ctx.quadraticCurveTo(0,-25,7,-20);
    ctx.lineTo(28,-28);
    ctx.lineTo(18,-13);
    ctx.lineTo(22,15);
    ctx.quadraticCurveTo(0,25,-22,15);
    ctx.fill();
  }

  // damage chips
  if(damage>0.05){
    ctx.save();
    ctx.globalCompositeOperation="destination-out";
    const holes=Math.floor(damage*6);
    for(let i=0;i<holes;i++){
      const rx=-13+(i*9)%26;
      const ry=-10+(i%3)*10;
      ctx.beginPath();
      ctx.arc(rx,ry,3+(i%2),0,Math.PI*2);
      ctx.fill();
    }
    ctx.restore();
  }

  // eyes
  ctx.shadowBlur=0;
  ctx.fillStyle="#fff";
  ctx.fillRect(-10,-5,6,8);
  ctx.fillRect(4,-5,6,8);
  ctx.fillStyle="#1b2530";
  ctx.fillRect(-8,-2,2,4);
  ctx.fillRect(6,-2,2,4);

  // mouth
  ctx.strokeStyle="#2b1b16";
  ctx.lineWidth=3;
  ctx.beginPath();
  if(stage<4){
    ctx.moveTo(-8,9); ctx.quadraticCurveTo(0,14,8,9);
  }else{
    ctx.moveTo(-8,12); ctx.lineTo(-3,8); ctx.lineTo(2,12); ctx.lineTo(7,8);
  }
  ctx.stroke();

  // cracks
  ctx.strokeStyle="rgba(255,255,255,.75)";
  ctx.lineWidth=2;
  for(let i=0;i<Math.floor(damage*5);i++){
    const a=i*1.3+damage;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a)*5,Math.sin(a)*5);
    ctx.lineTo(Math.cos(a)*15,Math.sin(a)*15);
    ctx.stroke();
  }

  // HP
  ctx.fillStyle="rgba(255,255,255,.95)";
  ctx.font="bold 10px system-ui";
  ctx.textAlign="center";
  ctx.fillText(String(m.hp),0,-34);

  ctx.fillStyle="rgba(255,255,255,.16)";
  ctx.fillRect(-18,30,36,4);
  ctx.fillStyle=c;
  ctx.fillRect(-18,30,36*hpRatio,4);

  ctx.restore();
}
function drawBall(){
  const orb=ctx.createRadialGradient(ball.x-4,ball.y-5,2,ball.x,ball.y,ball.r);
  orb.addColorStop(0,"#fff"); orb.addColorStop(.24,"#b5fbff"); orb.addColorStop(.55,"#42d7ff"); orb.addColorStop(1,"#2454d8");
  ctx.fillStyle=orb; ctx.shadowBlur=22; ctx.shadowColor="#66ecff";
  ctx.beginPath(); ctx.arc(ball.x,ball.y,ball.r,0,Math.PI*2); ctx.fill();
  ctx.shadowBlur=0;
}
function drawParticles(){
  particles.forEach(p=>{
    ctx.globalAlpha=Math.max(0,p.life/.7);
    ctx.fillStyle=p.color || "#9bf5ff";
    ctx.fillRect(p.x,p.y,p.size,p.size);
  });
  debris.forEach(d=>{
    ctx.save();
    ctx.globalAlpha=Math.max(0,d.life/.9);
    ctx.translate(d.x,d.y);
    ctx.rotate(d.rot);
    ctx.fillStyle=d.color;
    ctx.fillRect(-d.size/2,-d.size/2,d.size,d.size*.78);
    ctx.restore();
  });
  ctx.globalAlpha=1;
}
function drawMessages(){
  if(stageMessageTimer>0){
    ctx.fillStyle="rgba(255,255,255,.92)";
    ctx.textAlign="center";
    ctx.font="900 26px system-ui";
    ctx.fillText("STAGE " + stage, W/2, H*.11);
    ctx.font="700 14px system-ui";
    ctx.fillStyle="rgba(255,235,180,.9)";
    ctx.fillText("ENEMIES " + monsters.length + " / HP " + monsters[0].maxHp, W/2, H*.145);
  }
  if(combo>1 && comboTimer>0){
    ctx.fillStyle="rgba(255,245,200,.95)";
    ctx.textAlign="center";
    ctx.font="900 22px system-ui";
    ctx.fillText(combo + " COMBO!", W/2, H*.72);
  }
}
function draw(){
  ctx.clearRect(0,0,W,H);
  ctx.save();
  ctx.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake);

  drawBoard();
  bumpers.forEach(drawBumper);
  monsters.forEach(drawMonster);

  // 下部ガイドを短くして、左右にも落下できる隙間を作る。
  ctx.strokeStyle="#36759a";
  ctx.lineWidth=5;
  ctx.beginPath();
  ctx.moveTo(18,H-128);
  ctx.lineTo(W*.26,H-103);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(W-18,H-128);
  ctx.lineTo(W*.74,H-103);
  ctx.stroke();

  // 落下可能エリアを薄く表示（左・中央・右）
  const drainZones=[
    [0,W*.36],
    [W*.465,W*.535],
    [W*.64,W]
  ];
  const dg=ctx.createLinearGradient(0,H-82,0,H);
  dg.addColorStop(0,"rgba(255,95,95,.05)");
  dg.addColorStop(1,"rgba(255,25,45,.22)");
  ctx.fillStyle=dg;
  drainZones.forEach(([x1,x2])=>{
    ctx.fillRect(x1,H-72,x2-x1,72);
  });
  ctx.beginPath(); ctx.moveTo(W-18,H-128); ctx.lineTo(W*.69,H-98); ctx.stroke();

  // 落下穴の表示
  const drainL=W*.35, drainR=W*.65;
  const dg=ctx.createLinearGradient(0,H-85,0,H);
  dg.addColorStop(0,"rgba(255,90,90,.12)");
  dg.addColorStop(1,"rgba(255,20,40,.30)");
  ctx.fillStyle=dg;
  ctx.fillRect(drainL,H-72,drainR-drainL,72);
  ctx.strokeStyle="rgba(255,105,105,.55)";
  ctx.lineWidth=2;
  ctx.beginPath();
  ctx.moveTo(drainL,H-72);ctx.lineTo(drainL,H-18);
  ctx.moveTo(drainR,H-72);ctx.lineTo(drainR,H-18);
  ctx.stroke();

  drawFlipper(flippers.left);
  drawFlipper(flippers.right);
  drawBall();
  drawParticles();
  drawMessages();

  ctx.restore();
}

function loop(ts){
  const dt=Math.min((ts-last)/1000 || 0, .025);
  last=ts;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}
resize();
requestAnimationFrame(loop);
