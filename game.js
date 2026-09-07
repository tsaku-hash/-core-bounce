
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
  left:{x:0,y:0,len:86,angle:-0.3,rest:-0.3,active:-0.95},
  right:{x:0,y:0,len:86,angle:Math.PI+0.3,rest:Math.PI+0.3,active:Math.PI+0.95}
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
  flippers.left.x=W*.42; flippers.right.x=W*.58;
  flippers.left.y=flippers.right.y=H-78;
  resetBall(true);
  buildBoard();
  spawnStage(stage);
}
window.addEventListener("resize", resize);

function makeBar(x,y,len,angle,amp=0.16,speed=1.2){
  return {x,y,len,angle,baseAngle:angle,amp,speed,t:Math.random()*10,thickness:14};
}
function makeMonster(x,y,hp){
  return {x,y,baseY:y,hp,maxHp:hp,t:Math.random()*10,wobble:Math.random()*10};
}
function buildBoard(){
  bumpers=[
    {x:W*.16,y:H*.28,r:22},
    {x:W*.84,y:H*.28,r:22},
    {x:W*.33,y:H*.44,r:24},
    {x:W*.67,y:H*.44,r:24},
    {x:W*.50,y:H*.58,r:28}
  ];
  bars=[
    makeBar(W*.26,H*.36,68,-0.62,0.08,1.0),
    makeBar(W*.74,H*.36,68, 0.62,0.08,1.0),
  ];
}
function spawnStage(n){
  monsters = [
    makeMonster(W*.20, H*.14, n),
    makeMonster(W*.50, H*.18, n),
    makeMonster(W*.80, H*.14, n),
  ];
  stageMessageTimer = 1.8;
  updateHud();
}
function resetBall(initial=false){
  ball.x=W*.5; ball.y=H-130;
  ball.vx=initial?0:(Math.random()>.5?1:-1)*120;
  ball.vy=initial?0:-360;
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
  const r = 26;
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

    // 途中バーでもかなり強く飛ぶように強化。
    const dot=ball.vx*nx+ball.vy*ny;
    if(dot<0){
      ball.vx-=2*dot*nx;
      ball.vy-=2*dot*ny;
    }

    // バーの向きに沿った勢いと、法線方向の跳ね返りを大きくする
    const tangentX = Math.cos(bar.angle);
    const tangentY = Math.sin(bar.angle);
    ball.vx += nx*170 + tangentX*120;
    ball.vy += ny*170 + tangentY*120;

    // 上方向へ飛びやすくする
    if(ball.vy > -320) ball.vy -= 240;

    // 最低速度をしっかり確保
    speedUpBall(620);
    const sp=Math.hypot(ball.vx,ball.vy), maxSp=980;
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
    const launch = 620 * tipPower * pressPower;

    // 基本は強く上方向へ。左右のフリッパーで少し横方向も付ける。
    const side = (f===flippers.left ? 1 : -1);
    ball.vx = ball.vx*0.35 + side*(150 + 170*t) + nx*launch*0.42;
    ball.vy = -Math.max(560, 640 + 320*t) - Math.abs(ny)*launch*0.28;

    // フリッパー先端なら画面上部まで届く速度を保証。
    const minLaunchSpeed = pressed ? (t>0.65 ? 760 : 680) : 520;
    speedUpBall(minLaunchSpeed);

    const sp=Math.hypot(ball.vx,ball.vy), maxSp=1080;
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

  bars.forEach(bar=>{ bar.t+=dt; bar.angle = bar.baseAngle + Math.sin(bar.t*bar.speed)*bar.amp; });
  monsters.forEach(m=>{ m.t += dt; m.y = m.baseY + Math.sin(m.t*1.7 + m.wobble)*6; });

  ball.vy += 520*dt;
  ball.x += ball.vx*dt;
  ball.y += ball.vy*dt;

  if(ball.x-ball.r<12){ ball.x=12+ball.r; ball.vx=Math.abs(ball.vx)*.94; }
  if(ball.x+ball.r>W-12){ ball.x=W-12-ball.r; ball.vx=-Math.abs(ball.vx)*.94; }
  if(ball.y-ball.r<10){ ball.y=10+ball.r; ball.vy=Math.abs(ball.vy)*.94; }

  if(ball.y>H-135){
    const leftGuideY=H-126+(ball.x-20)*.22;
    const rightGuideY=H-126+(W-20-ball.x)*.22;
    if(ball.x<W*.36 && ball.y>leftGuideY && ball.vy>0){ ball.vy=-290; ball.vx+=100; }
    if(ball.x>W*.64 && ball.y>rightGuideY && ball.vy>0){ ball.vy=-290; ball.vx-=100; }
  }

  collideFlipper(flippers.left,leftPressed);
  collideFlipper(flippers.right,rightPressed);
  bumpers.forEach(b=>{ if(collideCircle(b,1.12,80)) sfx.bumper(); });
  bars.forEach(bar=>collideSegmentBar(bar));

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

  ctx.save();
  ctx.translate(m.x,m.y);

  ctx.shadowBlur=18;
  ctx.shadowColor="#ffb14d";

  // body blob
  ctx.fillStyle = "#f1a128";
  ctx.beginPath();
  ctx.moveTo(-18,-18);
  ctx.quadraticCurveTo(0,-30,18,-18);
  ctx.quadraticCurveTo(28,-4,22,16);
  ctx.lineTo(12,24);
  ctx.lineTo(4,16);
  ctx.lineTo(-4,24);
  ctx.lineTo(-12,16);
  ctx.lineTo(-22,24);
  ctx.quadraticCurveTo(-30,2,-18,-18);
  ctx.closePath();
  ctx.fill();

  // horns / spikes
  ctx.fillStyle = "#ffd27a";
  for(let i=-1;i<=1;i++){
    const sx = i*10;
    ctx.beginPath();
    ctx.moveTo(sx-4,-20);
    ctx.lineTo(sx,-30-rand(0,2));
    ctx.lineTo(sx+4,-20);
    ctx.closePath();
    ctx.fill();
  }

  // damage chips
  if(damage>0.05){
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    const holes = Math.floor(damage*6);
    for(let i=0;i<holes;i++){
      const rx = -12 + i*8;
      const ry = -10 + (i%2)*12;
      ctx.beginPath();
      ctx.arc(rx,ry,3 + (i%2),0,Math.PI*2);
      ctx.fill();
    }
    ctx.restore();
  }

  // eyes
  ctx.fillStyle = "#fff";
  ctx.fillRect(-10,-4,5,8);
  ctx.fillRect(5,-4,5,8);

  // mouth
  ctx.strokeStyle = "#713f00";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-8,10);
  ctx.quadraticCurveTo(0,14+damage*8,8,10);
  ctx.stroke();

  // cracks
  ctx.strokeStyle = "rgba(255,245,220,.8)";
  ctx.lineWidth = 2;
  for(let i=0;i<Math.floor(damage*5);i++){
    const a = i*1.2 + damage*2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a)*4, Math.sin(a)*4);
    ctx.lineTo(Math.cos(a)*12, Math.sin(a)*12);
    ctx.lineTo(Math.cos(a+.2)*18, Math.sin(a+.2)*18);
    ctx.stroke();
  }

  ctx.shadowBlur=0;

  // HP number
  ctx.fillStyle="rgba(255,255,255,.95)";
  ctx.font="bold 10px system-ui";
  ctx.textAlign="center";
  ctx.fillText(String(m.hp),0,-34);

  // HP bar
  ctx.fillStyle="rgba(255,255,255,.16)";
  ctx.fillRect(-18,30,36,4);
  ctx.fillStyle="#ffbd62";
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
    ctx.fillText("MONSTER HP " + stage, W/2, H*.145);
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
  bars.forEach(drawBar);
  monsters.forEach(drawMonster);

  ctx.strokeStyle="#36759a"; ctx.lineWidth=5;
  ctx.beginPath(); ctx.moveTo(18,H-120); ctx.lineTo(W*.32,H-92); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(W-18,H-120); ctx.lineTo(W*.68,H-92); ctx.stroke();

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
