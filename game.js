
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const livesEl = document.getElementById("lives");
const startScreen = document.getElementById("startScreen");
const gameOver = document.getElementById("gameOver");
const finalScore = document.getElementById("finalScore");
const resultTitle = document.getElementById("resultTitle");

let W=0,H=0,dpr=1;
let running=false;
let score=0,lives=3;
let leftPressed=false,rightPressed=false;
let shake=0;
let particles=[];
let enemies=[];
let bumpers=[];
let boss=null;
let last=0;
let elapsed=0;

const ball = {x:0,y:0,r:11,vx:0,vy:0,speed:1};

const flippers = {
  left:{x:0,y:0,len:86,angle:-0.3,rest:-0.3,active:-0.95},
  right:{x:0,y:0,len:86,angle:Math.PI+0.3,rest:Math.PI+0.3,active:Math.PI+0.95}
};

function resize(){
  dpr=Math.min(window.devicePixelRatio||1,2);
  const r=canvas.getBoundingClientRect();
  W=r.width; H=r.height;
  canvas.width=Math.floor(W*dpr);
  canvas.height=Math.floor(H*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  flippers.left.x=W*0.42; flippers.right.x=W*0.58;
  flippers.left.y=flippers.right.y=H-78;
  resetBall(true);
  buildLevel();
}
window.addEventListener("resize",resize);

function buildLevel(){
  bumpers = [
    {x:W*.25,y:H*.33,r:25,hp:999},
    {x:W*.72,y:H*.38,r:25,hp:999},
    {x:W*.48,y:H*.53,r:30,hp:999},
  ];
  enemies = [
    {x:W*.22,y:H*.17,r:18,hp:2,max:2,t:0},
    {x:W*.50,y:H*.23,r:19,hp:3,max:3,t:1.3},
    {x:W*.78,y:H*.17,r:18,hp:2,max:2,t:2.1},
  ];
  boss={x:W*.5,y:H*.08,r:35,hp:18,max:18,awake:false};
}

function resetBall(initial=false){
  ball.x=W*.5;
  ball.y=H-130;
  ball.vx=initial?0:(Math.random()>.5?1:-1)*110;
  ball.vy=initial?0:-310;
}

function startGame(){
  score=0;lives=3;elapsed=0;particles=[];
  buildLevel();resetBall(false);
  running=true;gameOver.classList.remove("show");startScreen.classList.remove("show");
  updateHud();
}
document.getElementById("startBtn").onclick=startGame;
document.getElementById("retryBtn").onclick=startGame;

function updateHud(){
  scoreEl.textContent="SCORE "+String(score).padStart(6,"0");
  livesEl.textContent="CORE × "+lives;
}

function setInput(side,val){
  if(side==="left")leftPressed=val;
  else rightPressed=val;
}
for (const [id,side] of [["leftBtn","left"],["rightBtn","right"]]){
  const el=document.getElementById(id);
  el.addEventListener("pointerdown",e=>{e.preventDefault();setInput(side,true)});
  ["pointerup","pointercancel","pointerleave"].forEach(ev=>el.addEventListener(ev,e=>setInput(side,false)));
}
canvas.addEventListener("pointerdown",e=>{
  if(!running)return;
  setInput(e.clientX<W/2?"left":"right",true);
});
canvas.addEventListener("pointerup",e=>{leftPressed=false;rightPressed=false});
canvas.addEventListener("pointercancel",e=>{leftPressed=false;rightPressed=false});

function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function dist(ax,ay,bx,by){return Math.hypot(ax-bx,ay-by)}

function addBurst(x,y,n=10){
  for(let i=0;i<n;i++){
    const a=Math.random()*Math.PI*2,s=40+Math.random()*120;
    particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.35+Math.random()*.35});
  }
}

function collideCircle(obj,power=1.08,points=50){
  let dx=ball.x-obj.x,dy=ball.y-obj.y;
  let d=Math.hypot(dx,dy);
  const min=ball.r+obj.r;
  if(d<min && d>0){
    const nx=dx/d,ny=dy/d;
    ball.x=obj.x+nx*min;ball.y=obj.y+ny*min;
    const dot=ball.vx*nx+ball.vy*ny;
    if(dot<0){
      ball.vx-=2*dot*nx;ball.vy-=2*dot*ny;
    }
    ball.vx*=power;ball.vy*=power;
    score+=points;
    shake=5;addBurst(ball.x,ball.y,7);
    return true;
  }
  return false;
}

function collideFlipper(f,pressed){
  const target=pressed?f.active:f.rest;
  f.angle += (target-f.angle)*0.34;
  const x2=f.x+Math.cos(f.angle)*f.len;
  const y2=f.y+Math.sin(f.angle)*f.len;
  const vx=x2-f.x,vy=y2-f.y;
  const wx=ball.x-f.x,wy=ball.y-f.y;
  const t=clamp((wx*vx+wy*vy)/(vx*vx+vy*vy),0,1);
  const px=f.x+t*vx,py=f.y+t*vy;
  const dx=ball.x-px,dy=ball.y-py;
  const d=Math.hypot(dx,dy),min=ball.r+7;
  if(d<min && d>0 && ball.vy> -600){
    const nx=dx/d,ny=dy/d;
    ball.x=px+nx*min;ball.y=py+ny*min;
    const boost=pressed?360:230;
    ball.vx += nx*boost + (f===flippers.left?90:-90)*(pressed?1:0);
    ball.vy = Math.min(ball.vy,-Math.abs(ny*boost)-180);
    score+=10;
  }
}

function update(dt){
  if(!running)return;
  elapsed+=dt;

  ball.vy += 520*dt;
  ball.x += ball.vx*dt;
  ball.y += ball.vy*dt;

  // walls
  if(ball.x-ball.r<12){ball.x=12+ball.r;ball.vx=Math.abs(ball.vx)*.92}
  if(ball.x+ball.r>W-12){ball.x=W-12-ball.r;ball.vx=-Math.abs(ball.vx)*.92}
  if(ball.y-ball.r<10){ball.y=10+ball.r;ball.vy=Math.abs(ball.vy)*.92}

  // slanted lower guides
  if(ball.y>H-135){
    const leftGuideY=H-126 + (ball.x-20)*.22;
    const rightGuideY=H-126 + (W-20-ball.x)*.22;
    if(ball.x<W*.36 && ball.y>leftGuideY && ball.vy>0){ball.vy=-260;ball.vx+=90}
    if(ball.x>W*.64 && ball.y>rightGuideY && ball.vy>0){ball.vy=-260;ball.vx-=90}
  }

  collideFlipper(flippers.left,leftPressed);
  collideFlipper(flippers.right,rightPressed);

  bumpers.forEach(b=>collideCircle(b,1.12,80));

  enemies.forEach(e=>{
    e.t+=dt;
    e.y+=Math.sin(e.t*2.2)*5*dt;
    if(e.hp>0 && collideCircle(e,1.05,120)){
      e.hp--;
      if(e.hp<=0){score+=500;addBurst(e.x,e.y,20)}
    }
  });

  if(enemies.every(e=>e.hp<=0)) boss.awake=true;
  if(boss.awake && boss.hp>0 && collideCircle(boss,1.07,200)){
    boss.hp--;
    if(boss.hp<=0){
      score+=5000;running=false;resultTitle.textContent="CORE RESTORED";finalScore.textContent="SCORE "+score;gameOver.classList.add("show");
    }
  }

  if(ball.y>H+40){
    lives--;updateHud();
    if(lives<=0){
      running=false;resultTitle.textContent="SYSTEM DOWN";finalScore.textContent="SCORE "+score;gameOver.classList.add("show");
    }else resetBall(false);
  }

  particles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=180*dt;p.life-=dt});
  particles=particles.filter(p=>p.life>0);
  shake*=.86;
  updateHud();
}

function roundRect(x,y,w,h,r){
  const rr=Math.min(r,w/2,h/2);
  ctx.beginPath();
  ctx.moveTo(x+rr,y);
  ctx.arcTo(x+w,y,x+w,y+h,rr);
  ctx.arcTo(x+w,y+h,x,y+h,rr);
  ctx.arcTo(x,y+h,x,y,rr);
  ctx.arcTo(x,y,x+w,y,rr);
  ctx.closePath();
}

function draw(){
  ctx.clearRect(0,0,W,H);
  ctx.save();
  ctx.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake);

  // board
  const g=ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,"#0d2237");g.addColorStop(1,"#06101d");
  ctx.fillStyle=g;ctx.fillRect(0,0,W,H);

  // grid
  ctx.strokeStyle="rgba(94,221,255,.08)";ctx.lineWidth=1;
  for(let y=30;y<H;y+=34){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}
  for(let x=20;x<W;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke()}

  // rails
  ctx.strokeStyle="rgba(101,233,255,.45)";ctx.lineWidth=4;
  ctx.beginPath();ctx.moveTo(12,H);ctx.lineTo(12,48);ctx.quadraticCurveTo(12,12,48,12);ctx.lineTo(W-48,12);ctx.quadraticCurveTo(W-12,12,W-12,48);ctx.lineTo(W-12,H);ctx.stroke();

  // boss gate
  ctx.strokeStyle=boss&&boss.awake?"#ff687a":"rgba(255,255,255,.15)";
  ctx.lineWidth=3;ctx.setLineDash([8,8]);
  ctx.beginPath();ctx.moveTo(W*.22,H*.135);ctx.lineTo(W*.78,H*.135);ctx.stroke();ctx.setLineDash([]);

  // boss
  if(boss){
    ctx.save();ctx.translate(boss.x,boss.y);
    ctx.shadowBlur=boss.awake?24:8;ctx.shadowColor=boss.awake?"#ff536e":"#33475f";
    ctx.fillStyle=boss.awake?"#64172d":"#263446";
    ctx.beginPath();ctx.arc(0,0,boss.r,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle=boss.awake?"#ff8ba0":"#506073";ctx.lineWidth=3;ctx.stroke();
    ctx.fillStyle="#eaf8ff";ctx.fillRect(-14,-4,8,8);ctx.fillRect(6,-4,8,8);
    if(boss.awake){
      ctx.fillStyle="rgba(255,255,255,.8)";ctx.font="10px system-ui";ctx.textAlign="center";ctx.fillText("AI CORE",0,-48);
      ctx.fillStyle="rgba(255,255,255,.16)";ctx.fillRect(-38,42,76,6);
      ctx.fillStyle="#ff7086";ctx.fillRect(-38,42,76*(boss.hp/boss.max),6);
    }
    ctx.restore();
  }

  // enemies
  enemies.forEach(e=>{
    if(e.hp<=0)return;
    ctx.save();ctx.translate(e.x,e.y);
    ctx.shadowBlur=12;ctx.shadowColor="#ffb14d";
    ctx.fillStyle="#8c4e18";ctx.beginPath();ctx.arc(0,0,e.r,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle="#ffbd62";ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle="#fff";ctx.fillRect(-8,-3,5,5);ctx.fillRect(3,-3,5,5);
    ctx.restore();
  });

  // bumpers
  bumpers.forEach((b,i)=>{
    const gg=ctx.createRadialGradient(b.x-6,b.y-7,4,b.x,b.y,b.r);
    gg.addColorStop(0,"#ffffff");gg.addColorStop(.12,"#a7f8ff");gg.addColorStop(.45,"#23cce7");gg.addColorStop(1,"#103b5e");
    ctx.fillStyle=gg;ctx.shadowBlur=18;ctx.shadowColor="#3de9ff";
    ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fill();
    ctx.shadowBlur=0;
    ctx.strokeStyle="rgba(255,255,255,.65)";ctx.lineWidth=2;ctx.stroke();
  });

  // bottom guides
  ctx.strokeStyle="#36759a";ctx.lineWidth=5;
  ctx.beginPath();ctx.moveTo(18,H-120);ctx.lineTo(W*.32,H-92);ctx.stroke();
  ctx.beginPath();ctx.moveTo(W-18,H-120);ctx.lineTo(W*.68,H-92);ctx.stroke();

  drawFlipper(flippers.left);
  drawFlipper(flippers.right);

  // ball
  const orb=ctx.createRadialGradient(ball.x-4,ball.y-5,2,ball.x,ball.y,ball.r);
  orb.addColorStop(0,"#fff");orb.addColorStop(.24,"#b5fbff");orb.addColorStop(.55,"#42d7ff");orb.addColorStop(1,"#2454d8");
  ctx.fillStyle=orb;ctx.shadowBlur=22;ctx.shadowColor="#66ecff";
  ctx.beginPath();ctx.arc(ball.x,ball.y,ball.r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;

  // particles
  particles.forEach(p=>{
    ctx.globalAlpha=Math.max(0,p.life/.7);
    ctx.fillStyle="#9bf5ff";ctx.fillRect(p.x,p.y,3,3);
  });
  ctx.globalAlpha=1;

  if(!boss?.awake && running){
    ctx.fillStyle="rgba(255,255,255,.7)";ctx.textAlign="center";ctx.font="700 12px system-ui";
    ctx.fillText("3 DRONESを破壊して上層ゲートを開け",W/2,H*.14);
  }
  ctx.restore();
}

function drawFlipper(f){
  const x2=f.x+Math.cos(f.angle)*f.len;
  const y2=f.y+Math.sin(f.angle)*f.len;
  ctx.strokeStyle="#75efff";ctx.lineWidth=15;ctx.lineCap="round";
  ctx.shadowBlur=14;ctx.shadowColor="#2bdcff";
  ctx.beginPath();ctx.moveTo(f.x,f.y);ctx.lineTo(x2,y2);ctx.stroke();
  ctx.shadowBlur=0;
  ctx.strokeStyle="rgba(255,255,255,.65)";ctx.lineWidth=3;
  ctx.beginPath();ctx.moveTo(f.x,f.y);ctx.lineTo(x2,y2);ctx.stroke();
}

function loop(ts){
  const dt=Math.min((ts-last)/1000 || 0,.025);last=ts;
  update(dt);draw();requestAnimationFrame(loop);
}

resize();
requestAnimationFrame(loop);
