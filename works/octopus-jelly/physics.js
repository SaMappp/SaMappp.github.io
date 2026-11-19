export const add = (a, b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
export const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
export const scale = (a, s) => [a[0]*s, a[1]*s, a[2]*s];
export const dot = (a, b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
export const length = a => Math.hypot(...a);
export const unit = a => scale(a, 1 / (length(a) || 1));
export const mix = (a, b, t) => add(scale(a, 1-t), scale(b, t));
export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export const TAU = Math.PI * 2;
export const UP = [0, 1, 0];
export const DT = 1/60;
export const RINGS = 19;
export const SIDES = 10;
const METERS = .092;
const DENSITY = 1.035;
const step2 = DT * DT;
const smooth = t => { const x = clamp(t, 0, 1); return x*x*(3-2*x); };

function armCurve(arm, time, activity, beads) {
  const curve = [];
  let heading = arm.angle;
  let pitch = -.42;
  const delta = arm.length / (RINGS-1);
  let point = [Math.sin(heading)*.51, .55, Math.cos(heading)*.51];
  const curl = 2.65 + .87 * activity * Math.sin(time * 1.85 + arm.phase);
  const bait = beads.find(b => b.p[1] < .48 && length(sub(b.p, arm.lastTip)) < 1.85);
  for (let j=0; j<RINGS; j++) {
    const t = j / (RINGS-1);
    const radius = .36 * Math.pow(1-t, .83) + .013;
    // Integrate yaw and pitch along arc length. Each travelling strain wave is phase-shifted.
    const wave = Math.sin(t * 9.2 - time * 3.5 + arm.phase);
    const bias = bait ? clamp(dot(unit(sub(bait.p, point)), [Math.cos(heading),0,-Math.sin(heading)]), -.7, .7) : 0;
    heading += (arm.sweep + wave * .76 * activity + bias * 1.1) * delta;
    const wantedPitch = -.42 * (1-smooth(t/.35)) + curl * smooth((t-.55)/.42);
    pitch += wantedPitch - pitch;
    const tangent = [Math.sin(heading)*Math.cos(pitch), Math.sin(pitch), Math.cos(heading)*Math.cos(pitch)];
    const side = [Math.cos(heading),0,-Math.sin(heading)];
    const up = cross(tangent, side);
    point[1] = Math.max(point[1], radius + .045);
    curve.push({p:point, side, up, tangent, radius});
    point = add(point, scale(tangent, delta));
  }
  return curve;
}

function signedVolume(p, a,b,c,d) {
  const ax=p[b]-p[a], ay=p[b+1]-p[a+1], az=p[b+2]-p[a+2];
  const bx=p[c]-p[a], by=p[c+1]-p[a+1], bz=p[c+2]-p[a+2];
  const cx=p[d]-p[a], cy=p[d+1]-p[a+1], cz=p[d+2]-p[a+2];
  return (ax*(by*cz-bz*cy) + ay*(bz*cx-bx*cz) + az*(bx*cy-by*cx))/6;
}

export class Jelly {
  constructor() {
    this.rest = [];
    this.stiffness = [];
    this.tets = [];
    this.edges = [];
    this.edgeSet = new Set();
    this.time = 0;
    this.beads = [];
    this.frame = 0;
    this.base = this.lobe([0,.55,0], [.95,.52,.91], 0);
    this.head = this.lobe([0,1.13,.49], [.83,.70,.79], .11);
    this.mantle = this.lobe([0,1.34,-.73], [1.00,1.08,1.34], -.37);
    this.attach(this.base, this.head);
    this.attach(this.base, this.mantle);
    this.attach(this.head, this.mantle);
    const sizes = [3.21,3.74,3.36,3.16,2.94,3.46,3.57,3.25];
    const sweeps = [.29,-.25,.19,-.32,.27,.30,-.24,-.36];
    this.arms = sizes.map((len, i) => this.arm(i, len, sweeps[i]));
    for (let i=0; i<8; i++) {
      const a=this.arms[i], b=this.arms[(i+1)%8];
      for (let j=1; j<=4; j++) this.edge(a.rings[j][0], b.rings[j][0], .00018 * j);
    }
    this.p = new Float64Array(this.rest);
    this.prev = this.p.slice();
    this.mass = new Float64Array(this.p.length/3);
    for (const tet of this.tets) {
      for (let j=0;j<4;j++) this.mass[tet[j]/3] += Math.abs(tet[4]) / 4;
    }
    this.inv = Float64Array.from(this.mass, m => clamp(.042 / m, .13, 6));
    this.totalMass = this.mass.reduce((a,b)=>a+b,0) * METERS**3 * 1000 * DENSITY;
  }

  node(p, stiffness=0) {
    const offset = this.rest.length;
    this.rest.push(...p);
    this.stiffness.push(stiffness);
    return offset;
  }

  edge(a, b, compliance) {
    const key = Math.min(a,b) * 100000 + Math.max(a,b);
    if (this.edgeSet.has(key)) return;
    this.edgeSet.add(key);
    const d = Math.hypot(this.rest[a]-this.rest[b], this.rest[a+1]-this.rest[b+1], this.rest[a+2]-this.rest[b+2]);
    this.edges.push([a,b,d,compliance/step2,0]);
  }

  tet(a,b,c,d) {
    const volume = signedVolume(this.rest,a,b,c,d);
    if (Math.abs(volume) < 1e-9) return;
    const ids=[a,b,c,d];
    const firm = ids.reduce((sum,id)=>sum+this.stiffness[id/3],0)/4;
    this.tets.push([a,b,c,d,volume,Math.abs(volume)*.00024/step2,0]);
    for (let i=0;i<4;i++) {
      for (let j=i+1;j<4;j++) this.edge(ids[i],ids[j],.000042/(1+firm*5));
    }
  }

  lobe(origin, radii, tilt) {
    const center = this.node(origin);
    const bands = [], faces = [], shell = [];
    const sectors = 24, steps = 14;
    const point = (theta,phi) => {
      const y = Math.cos(theta)*radii[1];
      return this.node(add(origin,[Math.sin(theta)*Math.cos(phi)*radii[0],y,Math.sin(theta)*Math.sin(phi)*radii[2]+y*tilt]));
    };
    const top = point(0,0), bottom = point(Math.PI,0);
    for(let i=1;i<steps;i++) {
      bands.push(Array.from({length:sectors}, (_,j)=>point(Math.PI*i/steps, TAU*j/sectors)));
    }
    shell.push(top,bottom,...bands.flat());
    for(let j=0;j<sectors;j++){
      const k=(j+1)%sectors;
      faces.push([top,bands[0][k],bands[0][j]], [bottom,bands.at(-1)[j],bands.at(-1)[k]]);
      for(let i=0;i<bands.length-1;i++) {
        faces.push([bands[i][j],bands[i][k],bands[i+1][j]], [bands[i+1][j],bands[i][k],bands[i+1][k]]);
      }
    }
    for(const [a,b,c] of faces) this.tet(center,a,b,c);
    return {center,bands,faces,shell,radii,origin,tilt};
  }

  attach(a,b) {
    this.edge(a.center,b.center,.000064);
    for(let i=0;i<a.shell.length;i+=8) {
      const v=a.shell[i], q=this.rest.slice(v,v+3);
      if(length(sub(q,b.origin))<1.12) this.edge(v,b.center,.000064);
    }
    for(let i=0;i<b.shell.length;i+=8) {
      const v=b.shell[i], q=this.rest.slice(v,v+3);
      if(length(sub(q,a.origin))<1.08) this.edge(v,a.center,.000064);
    }
  }

  arm(i, len, sweep) {
    const arm = {angle: (i+.47)*TAU/8, length:len, sweep, phase:i*1.73, lastTip:[0,0,0], rings:[]};
    const curve = armCurve(arm, 0, 0, []);
    for (let j=0;j<RINGS;j++) {
      const {p,side,up,radius} = curve[j];
      const firm = smooth((j/(RINGS-1)-.66)/.34);
      const ring = [this.node(p,firm)];
      for(let k=0;k<SIDES;k++) {
        const theta=k/SIDES*TAU;
        ring.push(this.node(add(p,add(scale(side,radius*Math.cos(theta)),scale(up,radius*Math.sin(theta)*.86))),firm));
      }
      arm.rings.push(ring);
      if(j===0) {
        for (const node of ring) {
          this.edge(this.base.center,node,.000053);
          this.edge(this.head.center,node,.00013);
        }
        const closest = this.base.shell.map(id => [id,length(sub(this.rest.slice(id,id+3), p))]).sort((a,b)=>a[1]-b[1]);
        for(let k=0;k<6;k++) this.edge(closest[k][0],ring[0],.000055);
        continue;
      }
      const prev=arm.rings[j-1];
      // Each triangular capsule cross-section sweeps a prism, decomposed into three tetrahedra.
      for(let k=1;k<=SIDES;k++) {
        const n=k%SIDES+1;
        this.tet(prev[0],prev[k],prev[n],ring[n]);
        this.tet(prev[0],prev[k],ring[k],ring[n]);
        this.tet(prev[0],ring[0],ring[k],ring[n]);
      }
    }
    return arm;
  }

  point(id) { return [this.p[id],this.p[id+1],this.p[id+2]]; }

  reset() {
    this.p.set(this.rest);
    this.prev.set(this.rest);
    this.time=0;
    this.beads.length=0;
  }

  drop() {
    const theta = this.beads.length * 2.39 + .19;
    const pos = [Math.sin(theta)*2.15, 4.2, Math.cos(theta)*2.15];
    this.beads.push({p:pos, v:-.4, age:0});
    if(this.beads.length>9) this.beads.shift();
  }

  solveEdges() {
    const p=this.p, inv=this.inv;
    for(const e of this.edges) {
      const [a,b,rest,alpha,lambda]=e;
      const x=p[a]-p[b], y=p[a+1]-p[b+1], z=p[a+2]-p[b+2];
      const len=Math.sqrt(x*x+y*y+z*z);
      const wa=inv[a/3], wb=inv[b/3];
      const d=(-(len-rest)-alpha*lambda)/(wa+wb+alpha);
      const ma=d*wa/(len || 1), mb=d*wb/(len || 1);
      e[4]+=d;
      p[a]+=ma*x; p[a+1]+=ma*y; p[a+2]+=ma*z;
      p[b]-=mb*x; p[b+1]-=mb*y; p[b+2]-=mb*z;
    }
  }

  solveVolumes() {
    const p=this.p, inv=this.inv;
    for(const tet of this.tets) {
      const [a,b,c,d,rest,alpha,lambda]=tet;
      const ax=p[b]-p[a], ay=p[b+1]-p[a+1], az=p[b+2]-p[a+2];
      const bx=p[c]-p[a], by=p[c+1]-p[a+1], bz=p[c+2]-p[a+2];
      const cx=p[d]-p[a], cy=p[d+1]-p[a+1], cz=p[d+2]-p[a+2];
      const gx=by*cz-bz*cy, gy=bz*cx-bx*cz, gz=bx*cy-by*cx;
      const hx=cy*az-cz*ay, hy=cz*ax-cx*az, hz=cx*ay-cy*ax;
      const ix=ay*bz-az*by, iy=az*bx-ax*bz, iz=ax*by-ay*bx;
      const jx=-gx-hx-ix, jy=-gy-hy-iy, jz=-gz-hz-iz;
      const w0=inv[a/3], w1=inv[b/3], w2=inv[c/3], w3=inv[d/3];
      const sum=w0*(jx*jx+jy*jy+jz*jz)+w1*(gx*gx+gy*gy+gz*gz)+w2*(hx*hx+hy*hy+hz*hz)+w3*(ix*ix+iy*iy+iz*iz);
      const correction=(rest*6-(ax*gx+ay*gy+az*gz)-alpha*lambda)/(sum+alpha);
      tet[6]+=correction;
      p[a]+=w0*jx*correction; p[a+1]+=w0*jy*correction; p[a+2]+=w0*jz*correction;
      p[b]+=w1*gx*correction; p[b+1]+=w1*gy*correction; p[b+2]+=w1*gz*correction;
      p[c]+=w2*hx*correction; p[c+1]+=w2*hy*correction; p[c+2]+=w2*hz*correction;
      p[d]+=w3*ix*correction; p[d+1]+=w3*iy*correction; p[d+2]+=w3*iz*correction;
    }
  }

  step(activity, grab) {
    this.time+=DT;
    const p=this.p, prev=this.prev;
    for(let i=0;i<p.length;i++) {
      const current=p[i];
      p[i]+=(current-prev[i])*.81-(i%3===1 ? 5.3*step2 : 0);
      prev[i]=current;
    }
    for(const edge of this.edges) edge[4]=0;
    for(const tet of this.tets) tet[6]=0;
    const center = this.point(this.base.center);
    const drift = scale(sub(center,[0,.55,0]),.7);
    for(const lobe of [this.base,this.head,this.mantle]) {
      const id=lobe.center;
      for(let k=0;k<3;k++) p[id+k]+=(this.rest[id+k]-p[id+k])*.115;
      const swell = Math.sin(this.time*2.4)*activity*.026;
      for(const node of lobe.shell) {
        p[node+1]+=swell*(this.rest[node+1]-lobe.origin[1]);
        // Distributed elastic support keeps the resting sculpt while allowing a grab to pull a region.
        for(let k=0;k<3;k++) p[node+k]+=(this.rest[node+k]+drift[k]-p[node+k])*.048;
      }
    }
    for(const arm of this.arms) {
      arm.lastTip=this.point(arm.rings.at(-1)[0]);
      const curve = armCurve(arm,this.time,activity,this.beads);
      for(let j=1;j<RINGS;j++) {
        const ring = arm.rings[j];
        const goal=add(curve[j].p,drift);
        const rate=(.08+.12*activity)*(.48+.52*j/(RINGS-1));
        for(let k=0;k<3;k++) p[ring[0]+k]+=(goal[k]-p[ring[0]+k])*rate;
        for(let s=0;s<SIDES;s++) {
          const a=s/SIDES*TAU;
          const {radius,side,up}=curve[j];
          const id=ring[s+1];
          for(let k=0;k<3;k++) {
            const target=goal[k]+radius*(Math.cos(a)*side[k]+.86*Math.sin(a)*up[k]);
            p[id+k]+=(target-p[id+k])*rate*.75;
          }
        }
      }
    }
    for(let pass=0;pass<5;pass++) {
      if(grab) {
        for(const {id,offset,weight} of grab.nodes) {
          for(let k=0;k<3;k++) p[id+k]+=(grab.target[k]+offset[k]-p[id+k])*weight;
        }
      }
      this.solveEdges();
      this.solveVolumes();
      for(let i=1;i<p.length;i+=3) {
        if(p[i]<.016) {
          p[i]=.016;
          prev[i-1]+=(p[i-1]-prev[i-1])*.27;
          prev[i+1]+=(p[i+1]-prev[i+1])*.27;
        }
      }
    }
    for(const bead of this.beads) {
      bead.age+=DT;
      bead.v-=8*DT;
      bead.p[1]+=bead.v*DT;
      let floor=.126;
      for (const arm of this.arms) {
        for (let i=2;i<RINGS;i+=2) {
          const id=arm.rings[i][0];
          const distance=Math.hypot(p[id]-bead.p[0],p[id+2]-bead.p[2]);
          const r=.39*(1-i/RINGS)+.09;
          if(distance<r && p[id+1]<bead.p[1]+.1) floor=Math.max(floor,p[id+1]+r);
        }
      }
      if(bead.p[1]<floor) {
        bead.p[1]=floor;
        bead.v=Math.abs(bead.v)>.30 ? Math.abs(bead.v)*.34 : 0;
      }
    }
  }

  metrics() {
    let volume=0;
    for(const [a,b,c,d] of this.tets) volume+=Math.abs(signedVolume(this.p,a,b,c,d));
    const tips=this.arms.map(a=>this.point(a.rings.at(-1)[0]));
    let span=0;
    for(let i=0;i<tips.length;i++) {
      for(let j=0;j<i;j++) span=Math.max(span,Math.hypot(tips[i][0]-tips[j][0],tips[i][2]-tips[j][2]));
    }
    const ys=this.mantle.shell.map(id=>this.p[id+1]);
    return {mass:this.totalMass, volume:volume*METERS**3*1000, span:span*METERS*100, height:(Math.max(...ys)-Math.min(...ys))*METERS*100};
  }
}
