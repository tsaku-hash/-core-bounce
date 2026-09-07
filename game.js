
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const livesEl = document.getElementById("lives");
const startScreen = document.getElementById("startScreen");
const gameOver = document.getElementById("gameOver");
const finalScore = document.getElementById("finalScore");
const resultTitle = document.getElementById("resultTitle");
const startBtn = document.getElementById("startBtn");
const retryBtn = document.getElementById("retryBtn");
const soundBtn = document.getElementById("soundBtn");

let W=0,H=0,dpr=1,running=false,score=0,lives=3,leftPressed=false,rightPressed=false,shake=0,last=0;
let particles=[],debris=[],enemies=[],bumpers=[],bars=[],boss=null,bossWasAwake=false,combo=0,comboTimer=0;

const ball={x:0,y:0,r:11,vx:0,vy:0};
const flippers={
  left:{x:0,y:0,len:86,angle:-0.3,rest:-0.3,active:-0.95},
  right:{x:0,y:0,len:86,angle:Math.PI+0.3,rest:Math.PI+0.3,active:Math.PI+0.95}
};

// audio
let audioCtx=null, masterGain=null, musicTimer=null, audioEnabled=true;
function initAudio(){
  if(audioCtx){ if(audioCtx.state==="suspended") audioCtx.resume(); return; }
  audioCtx=new (window.AudioContext||window.webkitAudioContext)();
  masterGain=audioCtx.createGain();
  masterGain.gain.value=.22;
  masterGain.connect(audioCtx.destination);
}
function tone(freq=440,duration=.08,type="sine",volume=.18,slideTo=null){
  if(!audioEnabled) return;
  initAudio();
  const now=audioCtx.currentTime, osc=audioCtx.createOscillator(), gain=audioCtx.createGain();
  osc.type=type; osc.frequency.setValueAtTime(freq, now);
  if(slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), now+duration);
  gain.gain.setValueAtTime(.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now+.01);
  gain.gain.exponentialRampToValueAtTime(.0001, now+duration);
  osc.connect(gain); gain.connect(masterGain); osc.start(now); osc.stop(now+duration+.03);
}
function noise(duration=.08, volume=.05){
  if(!audioEnabled) return;
  initAudio();
  const len=Math.floor(audioCtx.sampleRate*duration), buf=audioCtx.createBuffer(1,len,audioCtx.sampleRate), data=buf.getChannelData(0);
  for(let i=0;i<len;i++) data[i]=(Math.random()*2-1)*(1-i/len);
  const src=audioCtx.createBufferSource(), g=audioCtx.createGain();
  g.gain.value=volume; src.buffer=buf; src.connect(g); g.connect(masterGain); src.start();
}
const sfx={
  flip:()=>tone(145,.055,"square",.10,230),
  bumper:()=>{tone(620,.07,"sine",.13,900);setTimeout(()=>tone(930,.05,"sine",.08),35)},
  bar:()=>tone(410,.05,"square",.07,540),
  hit:()=>{tone(240,.09,"sawtooth",.12,150);noise(.05,.035)},
  crack:()=>{tone(180,.07,"square",.11,90);noise(.06,.045)},
  down:()=>{tone(520,.09,"square",.11,760);setTimeout(()=>tone(780,.10,"square",.10,1100),70)},
  boss:()=>{tone(110,.35,"sawtooth",.14,65);setTimeout(()=>tone(220,.25,"square",.08,440),220)},
  bossHit:()=>{tone(150,.12,"square",.13,75);noise(.08,.05)},
  lost:()=>{tone(330,.12,"sine",.11,220);setTimeout(()=>tone(220,.18,"sine",.09,110),110)},
  clear:()=>[523,659,784,1047].forEach((f,i)=>setTimeout(()=>tone(f,.22,"triangle",.12),i*115)),
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
    if(!running||!audioEnabled) return;
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

// util
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function rand(a,b){ return a + Math.random()*(b-a); }
function addGlowBurst(x,y,n=10){
  for(let i=0;i<n;i++){
    const a=Math.random()*Math.PI*2,s=40+Math.random()*120;
    particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.35+Math.random()*.35,size:3+Math.random()*2});
  }
}
function addDebris(x,y,color,count=12,size=4){
  for(let i=0;i<count;i++){
    const a=Math.random()*Math.PI*2,s=60+Math.random()*180;
    debris.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.45+Math.random()*.55,size:size*(.5+Math.random()*1.2),rot:Math.random()*Math.PI*2,vr:rand(-8,8),color});
  }
}

function resize(){
  dpr=Math.min(window.devicePixelRatio||1,2);
  const r=canvas.getBoundingClientRect();
  W=r.width; H=r.height;
  canvas.width=Math.floor(W*dpr);
  canvas.height=Math.floor(H*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  flippers.left.x=W*.42; flippers.right.x=W*.58;
  flippers.left.y=flippers.right.y=H-78;
  resetBall(true); buildLevel();
}
window.addEventListener("resize", resize);

function makeEnemy(x,y,r,hp){ return {x,y,baseY:y,r,hp,maxHp:hp,t:Math.random()*10}; }
function makeBar(x,y,len,angle,amp=0.16,speed=1.2){ return {x,y,len,angle,baseAngle:angle,amp,speed,t:Math.random()*10,thickness:14}; }

function buildLevel(){
  bumpers=[
    {x:W*.18,y:H*.27,r:22},{x:W*.80,y:H*.29,r:22},
    {x:W*.33,y:H*.45,r:24},{x:W*.67,y:H*.47,r:24},
    {x:W*.50,y:H*.58,r:28}
  ];
  bars=[
    makeBar(W*.28,H*.20,84,0.45,0.22,1.4),
    makeBar(W*.73,H*.22,78,-0.42,0.18,1.1),
    makeBar(W*.50,H*.31,86,0.05,0.14,1.7),
    makeBar(W*.23,H*.39,74,-0.75,0.20,1.3),
    makeBar(W*.77,H*.40,74,0.75,0.20,1.25),
    makeBar(W*.50,H*.50,92,-0.55,0.18,1.5),
    makeBar(W*.32,H*.63,70,0.55,0.16,1.6),
    makeBar(W*.68,H*.64,70,-0.55,0.16,1.45),
  ];
  enemies=[
    makeEnemy(W*.15,H*.12,20,4),
    makeEnemy(W*.50,H*.16,24,6),
    makeEnemy(W*.85,H*.12,20,4),
    makeEnemy(W*.28,H*.34,18,4),
    makeEnemy(W*.72,H*.34,18,4),
  ];
  boss={x:W*.5,y:H*.07,r:40,hp:18,maxHp:18,awake:false};
  bossWasAwake=false; combo=0; comboTimer=0;
}

function resetBall(initial=false){
  ball.x=W*.5; ball.y=H-130;
  ball.vx=initial?0:(Math.random()>.5?1:-1)*110;
  ball.vy=initial?0:-310;
}
function startGame(){
  initAudio();
  score=0; lives=3; particles=[]; debris=[];
  buildLevel(); resetBall(false); running=true;
  gameOver.classList.remove("show"); startScreen.classList.remove("show");
  updateHud(); startMusic();
}
startBtn.onclick=startGame; retryBtn.onclick=startGame;

function updateHud(){
  scoreEl.textContent="SCORE "+String(score).padStart(6,"0");
  livesEl.textContent="CORE × "+lives;
}
function setInput(side,val){ if(side==="left") leftPressed=val; else rightPressed=val; }
for(const [id,side] of [["leftBtn","left"],["rightBtn","right"]]){
  const el=document.getElementById(id);
  el.addEventListener("pointerdown", e=>{ e.preventDefault(); setInput(side,true); sfx.flip(); });
  ["pointerup","pointercancel","pointerleave"].forEach(ev=>el.addEventListener(ev,()=>setInput(side,false)));
}
canvas.addEventListener("pointerdown", e=>{ if(!running) return; setInput(e.clientX<W/2?"left":"right", true); sfx.flip(); });
canvas.addEventListener("pointerup", ()=>{leftPressed=false; rightPressed=false;});
canvas.addEventListener("pointercancel", ()=>{leftPressed=false; rightPressed=false;});

function collideCircle(obj,power=1.08,points=50){
  let dx=ball.x-obj.x, dy=ball.y-obj.y, d=Math.hypot(dx,dy), min=ball.r+obj.r;
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
function collideSegmentBar(bar){
  const x1=bar.x - Math.cos(bar.angle)*bar.len/2;
  const y1=bar.y - Math.sin(bar.angle)*bar.len/2;
  const x2=bar.x + Math.cos(bar.angle)*bar.len/2;
  const y2=bar.y + Math.sin(bar.angle)*bar.len/2;
  const vx=x2-x1, vy=y2-y1;
  const wx=ball.x-x1, wy=ball.y-y1;
  const t=clamp((wx*vx+wy*vy)/(vx*vx+vy*vy),0,1);
  const px=x1+t*vx, py=y1+t*vy;
  let dx=ball.x-px, dy=ball.y-py, d=Math.hypot(dx,dy);
  const min=ball.r+bar.thickness/2;
  if(d<min){
    if(d===0){ dx=0; dy=-1; d=1; }
    const nx=dx/d, ny=dy/d;
    ball.x=px+nx*min; ball.y=py+ny*min;
    const dot=ball.vx*nx+ball.vy*ny;
    if(dot<0){ ball.vx-=2*dot*nx; ball.vy-=2*dot*ny; }
    ball.vx += Math.cos(bar.angle+Math.PI/2)*60;
    ball.vy += Math.sin(bar.angle+Math.PI/2)*60;
    const sp=Math.hypot(ball.vx,ball.vy), maxSp=820;
    if(sp>maxSp){ ball.vx=ball.vx/sp*maxSp; ball.vy=ball.vy/sp*maxSp; }
    score += 25; shake=4; addGlowBurst(ball.x,ball.y,5); sfx.bar();
    return true;
  }
  return false;
}
function collideFlipper(f,pressed){
  const target=pressed?f.active:f.rest;
  f.angle += (target-f.angle)*0.34;
  const x2=f.x+Math.cos(f.angle)*f.len, y2=f.y+Math.sin(f.angle)*f.len;
  const vx=x2-f.x, vy=y2-f.y, wx=ball.x-f.x, wy=ball.y-f.y;
  const t=clamp((wx*vx+wy*vy)/(vx*vx+vy*vy),0,1), px=f.x+t*vx, py=f.y+t*vy;
  const dx=ball.x-px, dy=ball.y-py, d=Math.hypot(dx,dy), min=ball.r+7;
  if(d<min && d>0 && ball.vy>-600){
    const nx=dx/d, ny=dy/d;
    ball.x=px+nx*min; ball.y=py+ny*min;
    const boost=pressed?360:230;
    ball.vx += nx*boost + (f===flippers.left?90:-90)*(pressed?1:0);
    ball.vy = Math.min(ball.vy,-Math.abs(ny*boost)-180);
    score+=10;
  }
}
function hitDamage(target, pointsPerHit, chunkColor){
  if(target.hp<=0) return;
  target.hp--; combo++; comboTimer=1.2; score += pointsPerHit * combo;
  addDebris(target.x + rand(-8,8), target.y + rand(-8,8), chunkColor, 10 + (target.maxHp-target.hp)*2, 4);
  shake=7;
}

function update(dt){
  if(!running) return;
  comboTimer -= dt;
  if(comboTimer<=0){ comboTimer=0; combo=0; }

  bars.forEach(bar=>{ bar.t+=dt; bar.angle = bar.baseAngle + Math.sin(bar.t*bar.speed)*bar.amp; });
  enemies.forEach(e=>{ e.t+=dt; e.y = e.baseY + Math.sin(e.t*1.8)*6; });

  ball.vy += 520*dt;
  ball.x += ball.vx*dt;
  ball.y += ball.vy*dt;

  if(ball.x-ball.r<12){ ball.x=12+ball.r; ball.vx=Math.abs(ball.vx)*.92; }
  if(ball.x+ball.r>W-12){ ball.x=W-12-ball.r; ball.vx=-Math.abs(ball.vx)*.92; }
  if(ball.y-ball.r<10){ ball.y=10+ball.r; ball.vy=Math.abs(ball.vy)*.92; }

  if(ball.y>H-135){
    const leftGuideY=H-126+(ball.x-20)*.22, rightGuideY=H-126+(W-20-ball.x)*.22;
    if(ball.x<W*.36 && ball.y>leftGuideY && ball.vy>0){ ball.vy=-260; ball.vx+=90; }
    if(ball.x>W*.64 && ball.y>rightGuideY && ball.vy>0){ ball.vy=-260; ball.vx-=90; }
  }

  collideFlipper(flippers.left,leftPressed);
  collideFlipper(flippers.right,rightPressed);
  bumpers.forEach(b=>{ if(collideCircle(b,1.12,80)) sfx.bumper(); });
  bars.forEach(bar=>collideSegmentBar(bar));

  enemies.forEach(e=>{
    if(e.hp>0 && collideCircle(e,1.05,70)){
      sfx.crack();
      hitDamage(e,90,"#ffbd62");
      if(e.hp<=0){
        score+=500; addDebris(e.x,e.y,"#ffde9d",24,6); addGlowBurst(e.x,e.y,20); sfx.down();
      }else{
        sfx.hit();
      }
    }
  });

  if(enemies.every(e=>e.hp<=0)) boss.awake=true;
  if(boss.awake && !bossWasAwake){ bossWasAwake=true; sfx.boss(); }
  if(boss.awake && boss.hp>0 && collideCircle(boss,1.07,100)){
    hitDamage(boss,120,"#ff7086");
    sfx.bossHit();
    if(boss.hp<=0){
      score+=5000; addDebris(boss.x,boss.y,"#ffd2d8",40,8); addGlowBurst(boss.x,boss.y,28);
      running=false; stopMusic(); sfx.clear();
      resultTitle.textContent="CORE RESTORED";
      finalScore.textContent="SCORE "+score;
      gameOver.classList.add("show");
    }
  }

  if(ball.y>H+40){
    lives--; combo=0; comboTimer=0; sfx.lost(); updateHud();
    if(lives<=0){
      running=false; stopMusic(); sfx.gameover();
      resultTitle.textContent="SYSTEM DOWN";
      finalScore.textContent="SCORE "+score;
      gameOver.classList.add("show");
    }else{
      resetBall(false);
    }
  }

  particles.forEach(p=>{ p.x+=p.vx*dt; p.y+=p.vy*dt; p.vy+=180*dt; p.life-=dt; });
  particles=particles.filter(p=>p.life>0);
  debris.forEach(d=>{ d.x+=d.vx*dt; d.y+=d.vy*dt; d.vy+=220*dt; d.rot+=d.vr*dt; d.life-=dt; });
  debris=debris.filter(d=>d.life>0);

  shake *= .86;
  updateHud();
}

function drawDamageBar(x,y,w,h,pct,color){
  ctx.fillStyle="rgba(255,255,255,.16)"; ctx.fillRect(x,y,w,h);
  ctx.fillStyle=color; ctx.fillRect(x,y,w*Math.max(0,pct),h);
}
function drawCracks(ratio, r){
  const cracks=Math.floor((1-ratio)*6);
  ctx.strokeStyle="rgba(255,245,220,.75)";
  ctx.lineWidth=2;
  for(let i=0;i<cracks;i++){
    const a=i*1.13+ratio*2.5, len=r*(.35+i*.08);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a)*r*.15, Math.sin(a)*r*.15);
    ctx.lineTo(Math.cos(a+.1)*len*.55, Math.sin(a+.1)*len*.55);
    ctx.lineTo(Math.cos(a-.12)*len, Math.sin(a-.12)*len);
    ctx.stroke();
  }
}
function drawChippedShell(r, ratio, shellColor, coreColor){
  const body=ctx.createRadialGradient(-r*.2,-r*.25,r*.1,0,0,r);
  body.addColorStop(0,"#fff"); body.addColorStop(.12,shellColor.highlight); body.addColorStop(.48,shellColor.mid); body.addColorStop(1,shellColor.dark);
  ctx.fillStyle=body; ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.fill();

  const damage=1-ratio;
  if(damage>0.12){
    const core=ctx.createRadialGradient(-r*.18,-r*.12,2,0,0,r*.75);
    core.addColorStop(0,"#fff"); core.addColorStop(.2,coreColor.light); core.addColorStop(1,coreColor.dark);
    ctx.fillStyle=core; ctx.beginPath(); ctx.arc(-r*.05,r*.06,r*(.25 + damage*.18),0,Math.PI*2); ctx.fill();
  }

  ctx.save();
  ctx.globalCompositeOperation="destination-out";
  const chips=Math.floor(damage*8);
  for(let i=0;i<chips;i++){
    const a=-1.2+i*0.72+damage*0.8, cr=r*(.18 + (i%3)*.03), cx=Math.cos(a)*r*.8, cy=Math.sin(a)*r*.8;
    ctx.beginPath(); ctx.arc(cx,cy,cr,0,Math.PI*2); ctx.fill();
  }
  ctx.restore();

  ctx.strokeStyle=shellColor.rim; ctx.lineWidth=3; ctx.stroke();
  drawCracks(ratio, r);
}

function drawBoard(){
  const g=ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,"#0d2237"); g.addColorStop(1,"#06101d");
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);

  ctx.strokeStyle="rgba(94,221,255,.08)"; ctx.lineWidth=1;
  for(let y=30;y<H;y+=34){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
  for(let x=20;x<W;x+=40){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }

  ctx.strokeStyle="rgba(101,233,255,.45)"; ctx.lineWidth=4;
  ctx.beginPath();
  ctx.moveTo(12,H); ctx.lineTo(12,48);
  ctx.quadraticCurveTo(12,12,48,12);
  ctx.lineTo(W-48,12);
  ctx.quadraticCurveTo(W-12,12,W-12,48);
  ctx.lineTo(W-12,H);
  ctx.stroke();

  ctx.strokeStyle=boss && boss.awake ? "#ff687a" : "rgba(255,255,255,.15)";
  ctx.lineWidth=3; ctx.setLineDash([8,8]);
  ctx.beginPath(); ctx.moveTo(W*.22,H*.115); ctx.lineTo(W*.78,H*.115); ctx.stroke();
  ctx.setLineDash([]);
}
function drawEnemy(e){
  if(e.hp<=0) return;
  const ratio=e.hp/e.maxHp;
  ctx.save(); ctx.translate(e.x,e.y); ctx.shadowBlur=14; ctx.shadowColor="#ffb14d";
  drawChippedShell(e.r, ratio, {highlight:"#ffd08d", mid:"#d48a2b", dark:"#734112", rim:"#ffbd62"}, {light:"#fff6c7", dark:"#ff8d2f"});
  ctx.shadowBlur=0;
  ctx.fillStyle="#fff"; ctx.fillRect(-8,-3,5,5); ctx.fillRect(3,-3,5,5);
  ctx.fillStyle="rgba(255,255,255,.95)"; ctx.font="bold 10px system-ui"; ctx.textAlign="center"; ctx.fillText(String(e.hp),0,-e.r-10);
  drawDamageBar(-16,e.r+8,32,4,ratio,"#ffbd62");
  ctx.restore();
}
function drawBoss(){
  const ratio=Math.max(0,boss.hp/boss.maxHp);
  ctx.save(); ctx.translate(boss.x,boss.y); ctx.shadowBlur=boss.awake?22:8; ctx.shadowColor=boss.awake?"#ff536e":"#33475f";
  if(!boss.awake){
    const idle=ctx.createRadialGradient(-8,-8,4,0,0,boss.r);
    idle.addColorStop(0,"#5a6776"); idle.addColorStop(1,"#263446");
    ctx.fillStyle=idle; ctx.beginPath(); ctx.arc(0,0,boss.r,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle="#506073"; ctx.lineWidth=3; ctx.stroke();
  }else{
    drawChippedShell(boss.r, ratio, {highlight:"#ffb2be", mid:"#b8324c", dark:"#5b1524", rim:"#ff8ba0"}, {light:"#ffffff", dark:"#8df1ff"});
    const damage=1-ratio;
    const core=ctx.createRadialGradient(-5,-5,3,0,0,boss.r*.75);
    core.addColorStop(0,"#fff"); core.addColorStop(.22,"#d8ffff"); core.addColorStop(1,"#52ddff");
    ctx.fillStyle=core; ctx.globalAlpha=.2+damage*.5; ctx.beginPath(); ctx.arc(0,0,boss.r*(.18 + damage*.26),0,Math.PI*2); ctx.fill(); ctx.globalAlpha=1;
  }
  ctx.fillStyle="#eaf8ff"; ctx.fillRect(-14,-4,8,8); ctx.fillRect(6,-4,8,8); ctx.shadowBlur=0;
  if(boss.awake){
    ctx.fillStyle="rgba(255,255,255,.85)"; ctx.font="10px system-ui"; ctx.textAlign="center"; ctx.fillText("AI CORE",0,-boss.r-14);
    drawDamageBar(-38,boss.r+10,76,6,ratio,"#ff7086");
  }
  ctx.restore();
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
  ctx.fillStyle="rgba(180,250,255,.9)"; ctx.beginPath(); ctx.arc(bar.x,bar.y,4.5,0,Math.PI*2); ctx.fill();
}
function drawFlipper(f){
  const x2=f.x+Math.cos(f.angle)*f.len, y2=f.y+Math.sin(f.angle)*f.len;
  ctx.strokeStyle="#75efff"; ctx.lineWidth=15; ctx.lineCap="round"; ctx.shadowBlur=14; ctx.shadowColor="#2bdcff";
  ctx.beginPath(); ctx.moveTo(f.x,f.y); ctx.lineTo(x2,y2); ctx.stroke();
  ctx.shadowBlur=0; ctx.strokeStyle="rgba(255,255,255,.65)"; ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(f.x,f.y); ctx.lineTo(x2,y2); ctx.stroke();
}
function drawBall(){
  const orb=ctx.createRadialGradient(ball.x-4,ball.y-5,2,ball.x,ball.y,ball.r);
  orb.addColorStop(0,"#fff"); orb.addColorStop(.24,"#b5fbff"); orb.addColorStop(.55,"#42d7ff"); orb.addColorStop(1,"#2454d8");
  ctx.fillStyle=orb; ctx.shadowBlur=22; ctx.shadowColor="#66ecff"; ctx.beginPath(); ctx.arc(ball.x,ball.y,ball.r,0,Math.PI*2); ctx.fill(); ctx.shadowBlur=0;
}
function drawParticles(){
  particles.forEach(p=>{ ctx.globalAlpha=Math.max(0,p.life/.7); ctx.fillStyle="#9bf5ff"; ctx.fillRect(p.x,p.y,p.size,p.size); });
  debris.forEach(d=>{ ctx.save(); ctx.globalAlpha=Math.max(0,d.life/.9); ctx.translate(d.x,d.y); ctx.rotate(d.rot); ctx.fillStyle=d.color; ctx.fillRect(-d.size/2,-d.size/2,d.size,d.size*.78); ctx.restore(); });
  ctx.globalAlpha=1;
}
function drawHUDMessages(){
  if(!boss.awake && running){
    ctx.fillStyle="rgba(255,255,255,.72)"; ctx.textAlign="center"; ctx.font="700 12px system-ui";
    ctx.fillText("大量のBARSを使って敵を削り切れ",W/2,H*.10);
  }
  if(combo>1 && comboTimer>0){
    ctx.fillStyle="rgba(255,245,200,.95)"; ctx.textAlign="center"; ctx.font="900 22px system-ui";
    ctx.fillText(combo+" COMBO!", W/2, H*.70);
  }
}
function draw(){
  ctx.clearRect(0,0,W,H);
  ctx.save();
  ctx.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake);

  drawBoard();

  bumpers.forEach(b=>{
    const gg=ctx.createRadialGradient(b.x-6,b.y-7,4,b.x,b.y,b.r);
    gg.addColorStop(0,"#ffffff"); gg.addColorStop(.12,"#a7f8ff"); gg.addColorStop(.45,"#23cce7"); gg.addColorStop(1,"#103b5e");
    ctx.fillStyle=gg; ctx.shadowBlur=18; ctx.shadowColor="#3de9ff";
    ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur=0; ctx.strokeStyle="rgba(255,255,255,.65)"; ctx.lineWidth=2; ctx.stroke();
  });

  bars.forEach(drawBar);
  enemies.forEach(drawEnemy);
  drawBoss();

  ctx.strokeStyle="#36759a"; ctx.lineWidth=5;
  ctx.beginPath(); ctx.moveTo(18,H-120); ctx.lineTo(W*.32,H-92); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(W-18,H-120); ctx.lineTo(W*.68,H-92); ctx.stroke();

  drawFlipper(flippers.left); drawFlipper(flippers.right);
  drawBall(); drawParticles(); drawHUDMessages();
  ctx.restore();
}
function loop(ts){
  const dt=Math.min((ts-last)/1000 || 0, .025);
  last=ts; update(dt); draw(); requestAnimationFrame(loop);
}
resize();
requestAnimationFrame(loop);
