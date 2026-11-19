import {Jelly,DT,add,sub,scale,dot,length,clamp} from "./physics.js";
import {Surface,camera} from "./geometry.js";
import {createRenderer} from "./renderer.js";

const $ = id=>document.getElementById(id);
const canvas=$("specimen"), activity=$("muscle"), status=$("engine"), notice=$("notice");
const palette = {
  coral: [[.93,.245,.168],[.29,.041,.074],"#ffac88"],
  plum: [[.63,.29,.63],[.19,.039,.27],"#e1a8e2"],
  mint: [[.31,.82,.61],[.031,.32,.29],"#91e6c3"]
};
const jelly=new Jelly(), mesh=new Surface();
const views=[[.27,.59],[.88,.72],[.20,1.34],[-.50,.42]];
let selected="coral", view=0, [azimuth,elevation]=views[0];
let cam, grab, pointer, renderer, visible=true, dirty=true;
let paused=matchMedia("(prefers-reduced-motion: reduce)").matches;
let last=0, accumulated=0, measured=0, animation=0;

function choose(name) {
  selected=name;
  for(const button of document.querySelectorAll("[data-palette]")) {
    button.setAttribute("aria-pressed", String(button.dataset.palette===name));
  }
  document.documentElement.style.setProperty("--accent",palette[name][2]);
  dirty=true;
}
for(const button of document.querySelectorAll("[data-palette]")) {
  button.addEventListener("click",()=>choose(button.dataset.palette));
}
function setPause(value) {
  paused=value;
  $("pause").textContent=paused ? "继续" : "暂停";
  $("pause").setAttribute("aria-pressed",String(paused));
}
$("pause").addEventListener("click",()=>setPause(!paused));
setPause(paused);
$("bait").addEventListener("click",()=>{
  jelly.drop();
  setPause(false);
  dirty=true;
});
$("reset").addEventListener("click",()=>{
  grab=null;
  pointer=null;
  jelly.reset();
  view=0;
  [azimuth,elevation]=views[view];
  activity.value="64";
  $("activity").textContent="64%";
  dirty=true;
});
activity.addEventListener("input",()=>{
  $("activity").textContent=activity.value+"%";
});
$("angle").addEventListener("click",()=>{
  view=(view+1)%views.length;
  [azimuth,elevation]=views[view];
  dirty=true;
});

const coords = event => {
  const rect=canvas.getBoundingClientRect();
  return [(event.clientX-rect.left)/rect.width*2-1, 1-(event.clientY-rect.top)/rect.height*2];
};

canvas.addEventListener("pointerdown",event=>{
  if(!cam || pointer || event.button!==0) return;
  const direction=cam.ray(...coords(event));
  let best=null, depth=Infinity;
  for(const hit of mesh.hit) {
    const delta=sub(hit.p,cam.eye), along=dot(delta,direction);
    if(along<0 || along>=depth || length(sub(delta,scale(direction,along)))>hit.r*1.20) continue;
    best=hit;
    depth=along;
  }
  canvas.setPointerCapture(event.pointerId);
  pointer={id:event.pointerId,x:event.clientX,y:event.clientY};
  if(best) {
    const p=jelly.point(best.id), nodes=[];
    const radius=.31+best.r*.70;
    for(let id=0;id<jelly.p.length;id+=3) {
      const offset=sub(jelly.point(id),p), d=length(offset);
      if(d<radius) nodes.push({id,offset,weight:.71*(1-d/radius)**1.6});
    }
    const depth=dot(sub(p,cam.eye),cam.front);
    const pointerOnPlane=add(cam.eye,scale(direction,depth/dot(direction,cam.front)));
    grab={target:p,nodes,origin:p,depth,offset:sub(p,pointerOnPlane)};
    setPause(false);
  }
});
canvas.addEventListener("pointermove",event=>{
  if(pointer?.id!==event.pointerId) return;
  if(grab) {
    const ray=cam.ray(...coords(event));
    const target=add(add(cam.eye,scale(ray,grab.depth/dot(ray,cam.front))),grab.offset);
    const delta=sub(target,grab.origin);
    grab.target=add(grab.origin,scale(delta,Math.min(1,2.65/(length(delta)||1))));
    grab.target[1]=Math.max(.12,grab.target[1]);
  } else {
    azimuth-=(event.clientX-pointer.x)*.009;
    elevation=clamp(elevation+(event.clientY-pointer.y)*.008,.19,1.42);
  }
  pointer.x=event.clientX;
  pointer.y=event.clientY;
  dirty=true;
});
for(const name of ["pointerup","pointercancel","lostpointercapture"]) {
  canvas.addEventListener(name,event=>{
    if(pointer?.id!==event.pointerId) return;
    grab=null;
    pointer=null;
  });
}

function readouts() {
  const metrics=jelly.metrics();
  for(const [id,n] of Object.entries(metrics)) $(id).textContent=n.toFixed(id==="mass" || id==="volume" ? 2 : 1);
}

const observer=new IntersectionObserver(([entry])=>{
  visible=entry.isIntersecting;
  last=0;
  dirty=true;
});
observer.observe(canvas);
new ResizeObserver(()=>{ dirty=true; }).observe(canvas);
document.addEventListener("visibilitychange",()=>{
  last=0;
  dirty=true;
});

function frame(now) {
  animation=requestAnimationFrame(frame);
  const delta=last ? Math.min(.04,(now-last)/1000) : 0;
  last=now;
  if(document.hidden || !visible) return;
  if(!paused) {
    accumulated=Math.min(DT*2,accumulated+delta);
    while(accumulated>=DT) {
      jelly.step(+activity.value/100,grab);
      accumulated-=DT;
      dirty=true;
    }
  }
  if(!dirty) return;
  dirty=false;
  const rect=canvas.getBoundingClientRect();
  if(!rect.width || !rect.height) return;
  const ratio=Math.min(renderer.name==="WebGPU" ? 1.65 : 1.1,devicePixelRatio,1080/rect.height);
  const w=Math.round(rect.width*ratio), h=Math.round(rect.height*ratio);
  if(canvas.width!==w) canvas.width=w;
  if(canvas.height!==h) canvas.height=h;
  cam=camera(azimuth,elevation,w/h);
  mesh.build(jelly);
  renderer.draw(cam,palette[selected]);
  if(now-measured>110) {
    measured=now;
    readouts();
  }
}

function blocked() {
  cancelAnimationFrame(animation);
  status.removeAttribute("data-ready");
  status.textContent="图形渲染不可用";
  notice.hidden=false;
  notice.textContent="请使用支持 WebGPU 或 WebGL 2 的浏览器，并开启图形加速。";
}
try {
  renderer=await createRenderer(canvas,mesh,blocked);
  if(renderer) {
    status.textContent=renderer.name+" · XPBD";
    status.dataset.ready="";
    readouts();
    animation=requestAnimationFrame(frame);
  } else {
    blocked();
  }
} catch(error) {
  console.error(error);
  blocked();
}
