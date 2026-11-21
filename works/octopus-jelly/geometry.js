import {add,sub,scale,dot,cross,unit,mix,clamp,TAU,UP,RINGS,SIDES} from "./physics.js?v=20261121";

const JELLY = 1, CUP = 2, EYE = 3, BEAD = 4, CAVITY = 5;
const CREAM = [.94,.80,.67], PEACH = [.78,.48,.40];
const local = (p,a,b,c,x,y,z) => [
  p[0]+a[0]*x+b[0]*y+c[0]*z, p[1]+a[1]*x+b[1]*y+c[1]*z, p[2]+a[2]*x+b[2]*y+c[2]*z
];
const basis = axis => {
  const side = unit(cross(Math.abs(axis[1])>.94 ? [0,0,1] : UP,axis));
  return [side,cross(axis,side),axis];
};

export class Surface {
  constructor() {
    this.vertices = new Float32Array(52000 * 13);
    this.indices = new Uint32Array(180000);
    this.samples = new Float32Array(32*4);
    this.hit = [];
  }

  v(p,n,tint,type,texture=p) {
    const i=this.count++;
    const a=this.vertices, at=i*13;
    a[at]=p[0]; a[at+1]=p[1]; a[at+2]=p[2];
    a[at+3]=n[0]; a[at+4]=n[1]; a[at+5]=n[2];
    a[at+6]=tint[0]; a[at+7]=tint[1]; a[at+8]=tint[2]; a[at+9]=type;
    a[at+10]=texture[0]; a[at+11]=texture[1]; a[at+12]=texture[2];
    return i;
  }

  tri(a,b,c) {
    this.indices[this.faces++]=a;
    this.indices[this.faces++]=b;
    this.indices[this.faces++]=c;
  }

  join(a,b) {
    for(let k=0;k<a.length;k++) {
      const n=(k+1)%a.length;
      this.tri(a[k],b[k],a[n]);
      this.tri(a[n],b[k],b[n]);
    }
  }

  profile(p,[u,v,w],rings,tint,type,segments=16) {
    let prev;
    for(const [r,y,nr,ny] of rings) {
      const row=[];
      for(let i=0;i<segments;i++) {
        const theta=i*TAU/segments, c=Math.cos(theta), s=Math.sin(theta);
        row.push(this.v(local(p,u,v,w,c*r,s*r,y), unit(local([0,0,0],u,v,w,c*nr,s*nr,ny)),tint,type));
      }
      if(prev) this.join(prev,row);
      prev=row;
    }
  }

  ellipsoid(p,[u,v,w],radii,tint,type,segments=20,bands=12) {
    let prev;
    for(let j=0;j<=bands;j++) {
      const t=Math.PI*j/bands, s=Math.sin(t), c=Math.cos(t);
      const ring=[];
      for(let k=0;k<segments;k++) {
        const phi=TAU*k/segments, x=s*Math.cos(phi), y=s*Math.sin(phi);
        const n=unit(local([0,0,0],u,v,w,x/radii[0],y/radii[1],c/radii[2]));
        ring.push(this.v(local(p,u,v,w,x*radii[0],y*radii[1],c*radii[2]),n,tint,type));
      }
      if(prev) this.join(prev,ring);
      prev=ring;
    }
  }

  lobe(jelly,lobe) {
    const center=jelly.point(lobe.center), first=this.count;
    const ids=new Map();
    for(const id of lobe.shell) {
      const p=jelly.point(id), d=sub(p,center), rr=lobe.radii;
      const z=d[2]-d[1]*lobe.tilt;
      const normal=unit([d[0]/rr[0]**2,d[1]/rr[1]**2-lobe.tilt*z/rr[2]**2,z/rr[2]**2]);
      ids.set(id,this.v(p,normal,[clamp(.22-d[1]*1.2,0,.8),.93,0],JELLY,jelly.rest.slice(id,id+3)));
      if((this.count-first)%19===0) this.hit.push({id,p,r:.125});
    }
    for (const [a,b,c] of lobe.faces) this.tri(ids.get(a),ids.get(b),ids.get(c));
  }

  arm(jelly,arm) {
    const skin=[], frames=[];
    for(let j=0;j<RINGS;j++) {
      const ids=arm.rings[j], p=jelly.point(ids[0]);
      const t=unit(sub(jelly.point(arm.rings[Math.min(j+1,RINGS-1)][0]),jelly.point(arm.rings[Math.max(j-1,0)][0])));
      const side=unit(sub(jelly.point(ids[1]),p));
      const up=unit(cross(t,side));
      const r=arm.rings[j].slice(1).map(id=>jelly.point(id));
      const thick= Math.max(.013, r.reduce((sum,q)=>sum+Math.hypot(...sub(q,p)),0)/SIDES);
      frames.push({p,t,side,up,r:thick});
      const ring=r.map((q,k)=>{
        const n=unit(sub(q,p));
        const belly=clamp((-.08-Math.sin(k*TAU/SIDES))/.68,0,1);
        return this.v(q,n,[belly,.95,0],JELLY,jelly.rest.slice(ids[k+1],ids[k+1]+3));
      });
      skin.push(ring);
      this.hit.push({id:ids[0],p,r:Math.max(.09,thick)});
      if(j) this.join(skin[j-1],ring);
      if(j===RINGS-1) {
        const cap=this.v(p,t,[.44,.9,0],JELLY);
        ring.forEach((id,k)=>this.tri(cap,id,ring[(k+1)%SIDES]));
      }
    }
    for(let row=0;row<2;row++) {
      for(let i=2;i<RINGS-1;i++) {
        const f=frames[i], next=frames[i+1], offset=row*.46;
        const center=mix(f.p,next.p,offset);
        const down=unit(add(scale(f.up,-.90),scale(f.side,row ? -.44 : .44)));
        const p=add(center,scale(down,f.r*.91));
        const r=f.r*(.49 + .025*(i%3));
        this.profile(p,basis(down),[
          [r*.72,-r*.12,.57,.82],
          [r*1.03,r*.26,.7,.7],
          [r*.84,r*.42,0,1],
          [r*.63,r*.38,-.6,.8]
        ],CREAM,CUP,10);
        this.profile(p,basis(down),[
          [r*.65,r*.38,-.5,.86],
          [r*.43,r*.21,-.6,.8],
          [0,r*.15,0,1]
        ],PEACH,CAVITY,10);
      }
    }
    for(let i=2;i<16;i++) {
      const f=frames[i], a=Math.sin(i*2.6+arm.phase)*.77;
      const normal=unit(add(f.up,scale(f.side,a)));
      const q=add(f.p,scale(normal,f.r*.91));
      this.ellipsoid(q,basis(normal),[f.r*.19,f.r*.18,f.r*.15],[0,.91,0],JELLY,8,4);
    }
    return frames;
  }

  web(a,b) {
    const last=7, rows=[];
    for(let i=1;i<=last;i++) {
      const left=a[i],right=b[i];
      const la=add(left.p,scale(left.side,left.r*.84));
      const rb=add(right.p,scale(right.side,-right.r*.84));
      const row=[];
      for(let j=0;j<=6;j++) {
        const t=j/6, p=mix(la,rb,t), bow=Math.sin(t*Math.PI);
        p[1]=Math.max(.045,p[1]+.08-.075*bow);
        const radial=unit([p[0],0,p[2]]);
        const q=add(p,scale(radial,-bow*.46*Math.pow(i/last,2)));
        row.push(this.v(q,unit([0,1,-.11]),[.12,.77,0],JELLY));
      }
      rows.push(row);
      if(i>1) {
        for(let j=0;j<6;j++) {
          this.tri(rows.at(-2)[j],row[j],row[j+1]);
          this.tri(rows.at(-2)[j],row[j+1],rows.at(-2)[j+1]);
        }
      }
    }
  }

  features(jelly) {
    const head=jelly.point(jelly.head.center);
    for(const sign of [-1,1]) {
      const axis=unit([.46*sign,.26,.88]);
      const frame=basis(axis);
      const socket=add(head,[sign*.62,.22,.39]);
      this.ellipsoid(socket,frame,[.33,.28,.30],[.04,1,0],JELLY);
      this.ellipsoid(add(socket,scale(axis,.225)),frame,[.225,.161,.112],[.32,.145,.067],EYE);
      this.ellipsoid(add(socket,scale(axis,.305)),frame,[.175,.131,.055],[1,.68,.18],EYE,22,9);
      this.ellipsoid(add(socket,scale(axis,.35)),frame,[.138,.040,.022],[.035,.013,.03],EYE,20,8);
      this.ellipsoid(add(add(socket,scale(axis,.377)),[-.045,.048,.012]),frame,[.031,.022,.012],[1,.94,.8],EYE,12,7);
      const hornDirection=unit([sign*.36,.93,-.17]);
      const hornFrame=basis(hornDirection);
      const horn=add(socket,[.02*sign,.20,-.055]);
      this.profile(horn,hornFrame,[
        [.20,-.09,.92,.2],[.177,.07,1,.25],[.107,.20,.82,.55],
        [.045,.305,.7,.68],[0,.36,0,1]
      ],[0,.89,0],JELLY,20);
    }
    const headSide=add(head,[.74,-.34,.08]);
    const axis=unit([.77,-.18,.50]);
    const funnel=basis(axis);
    this.profile(headSide,funnel,[
      [.25,-.20,1,0],[.20,.04,1,.23],[.145,.32,1,.26],[.146,.37,.56,.81],[.109,.39,0,1]
    ],[.33,.9,0],JELLY,24);
    this.profile(headSide,funnel,[
      [.109,.39,-1,0],[.085,.33,-1,0],[0,.25,0,1]
    ],[.27,.079,.089],CAVITY,24);

    for(const [lobe,count] of [[jelly.mantle,54],[jelly.head,24]]) {
      for(let i=0;i<count;i++) {
        const u=i/count;
        const y=.14+.84*u, a=i*2.39996, d=Math.sqrt(1-y*y);
        const [rx,ry,rz]=lobe.radii;
        const phi=(a%TAU+TAU)%TAU;
        const row=clamp(Math.round(Math.acos(y)*14/Math.PI)-1,0,lobe.bands.length-1);
        const col=Math.round(phi/TAU*24)%24;
        const center=jelly.point(lobe.bands[row][col]);
        const n=unit([d*Math.cos(a)/rx,y/ry,d*Math.sin(a)/rz]);
        const r=.024 + (i%7)*.004;
        this.ellipsoid(center,basis(n),[r,r*.8,r*.75],[0,.85,0],JELLY,8,5);
      }
    }
  }

  shadow(p,r,depth) {
    if(this.shadowCount>=32) return;
    const [x,y,z]=p;
    const offset=this.shadowCount++*4;
    this.samples[offset]=x-y*.18; this.samples[offset+1]=z-y*.22;
    this.samples[offset+2]=r+y*.29; this.samples[offset+3]=depth/(1+y*.65);
  }

  build(jelly) {
    this.count=0; this.faces=0; this.shadowCount=0;
    this.hit.length=0;
    this.samples.fill(0);
    const a=this.v([-65,-.027,-65],UP,[0,0,0],0);
    this.v([-65,-.027,65],UP,[0,0,0],0);
    this.v([65,-.027,-65],UP,[0,0,0],0);
    this.v([65,-.027,65],UP,[0,0,0],0);
    this.tri(a,a+1,a+2); this.tri(a+2,a+1,a+3);
    this.lobe(jelly,jelly.base);
    this.lobe(jelly,jelly.mantle);
    this.lobe(jelly,jelly.head);
    this.shadow(jelly.point(jelly.base.center),.91,.86);
    this.shadow(jelly.point(jelly.mantle.center),1.06,.62);
    const frames=jelly.arms.map(arm=>this.arm(jelly,arm));
    for(let i=0;i<frames.length;i++) {
      this.web(frames[i],frames[(i+1)%frames.length]);
      for(const j of [4,9,14]) this.shadow(frames[i][j].p,.20+frames[i][j].r,.57);
    }
    this.features(jelly);
    for(const b of jelly.beads) {
      this.ellipsoid(b.p,basis(UP),[.118,.118,.118],[.92,.66,.24],BEAD,15,9);
      this.shadow(b.p,.16,.56);
    }
  }
}

export function camera(azimuth,elevation,aspect) {
  const focus=[0,.88,.07], zoom=8.1*Math.max(1,1.56/aspect);
  const eye=add(focus,[Math.sin(azimuth)*Math.cos(elevation)*zoom,Math.sin(elevation)*zoom,Math.cos(azimuth)*Math.cos(elevation)*zoom]);
  const front=unit(sub(focus,eye)), right=unit(cross(front,UP)), up=cross(right,front);
  const lens=1/Math.tan(.339);
  const rowMatrix=[
    scale(right,lens/aspect), scale(up,lens),
    scale(front, 85/(85-.08)), front
  ];
  const matrix=new Float32Array(16);
  rowMatrix.forEach((row,i)=>{
    for(let j=0;j<3;j++) matrix[j*4+i]=row[j];
    matrix[12+i]=-dot(row,eye)-(i===2 ? .08*85/(85-.08) : 0);
  });
  return {
    eye,matrix,right,up,front,
    ray(x,y) { return unit(add(front,add(scale(right,x*aspect/lens),scale(up,y/lens)))); }
  };
}
