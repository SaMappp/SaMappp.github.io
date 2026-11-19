const lightBody = `
  vec3 n = normalize(normal);
  vec3 view = normalize(eye - position);
  vec3 key = normalize(vec3(-0.53,0.81,0.39));
  vec3 rim = normalize(vec3(0.46,0.42,-0.79));
  float diffuse = max(0.0,dot(n,key));
  float reverse = max(0.0,dot(n,rim));
  float fresnel = pow(1.0 - clamp(dot(n,view),0.0,1.0), 3.5);
  vec3 halfKey = normalize(key + view);
  vec3 halfRim = normalize(rim + view);
  float spec = pow(max(dot(n,halfKey),0.0),38.0);
  float fill = pow(max(dot(n,halfRim),0.0),22.0);
  if (material < 0.5) {
    float shadow = 1.0;
    float bounce = 0.0;
    for (int i=0; i<32; i++) {
      vec4 s = shadows[i];
      vec2 offset = (position.xz - s.xy) / max(s.z,0.02);
      float mask = exp(-1.67 * dot(offset,offset))*s.w;
      shadow = shadow * (1.0 - mask*.77);
      bounce = bounce + mask*.11;
    }
    float vignette = exp(-0.032*dot(position.xz,position.xz));
    float wash = exp(-0.045*dot(position.xz - vec2(-3.0,-3.5),position.xz - vec2(-3.0,-3.5)));
    float grain = hash(vec3(floor(position.xz*190.0),0.0)) * 0.013;
    vec3 table = vec3(.035,.059,.073) + vec3(.095,.113,.133) * vignette + vec3(.05,.075,.095)*wash;
    return table * (0.34 + 0.66*shadow) + primary*bounce*.13 + grain;
  }
  if (material < 1.5) {
    float cloud = noise(skin*4.2 + vec3(4.3,0.25,3.7));
    float spots = noise(skin*9.6 + vec3(0.0,5.0,2.5));
    float micro = noise(skin*31.0);
    float mottle = smoothstep(.29,.73,cloud*.73+spots*.27);
    vec3 pigmented = mix(primary,secondary,mottle*.88);
    float milk = smoothstep(.08,.92,tint.x);
    float transmission = .18 + .43*reverse + .28*fresnel;
    vec3 undercoat = mix(vec3(.79,.69,.54), primary, .047 + .13*(1.0-milk));
    vec3 outer = mix(pigmented, undercoat, transmission*.61 + milk*.84);
    vec3 shade = outer*(.42+.58*diffuse+.20*reverse) + primary*reverse*.105;
    return shade + vec3(.86,.92,1.0)*(spec*.49+fill*.33+fresnel*.17)*tint.y + (micro-.46)*.026;
  }
  if (material < 2.5) {
    return tint*(.42+.54*diffuse+.18*reverse) + vec3(1.0,.90,.86)*(spec*.43+fill*.28+fresnel*.19);
  }
  if (material < 3.5) {
    float ridge = .86+.14*sin(position.x*170.0 + position.y*60.0)*sin(position.y*104.0);
    return tint*(.57+.50*diffuse)*mix(1.0,ridge,tint.g) + (spec*.56+fill*.36)*tint.g;
  }
  if (material < 4.5) {
    return tint*(.40+diffuse*.66+reverse*.13) + vec3(1.0,.96,.72)*(spec*.63+fresnel*.24);
  }
  return tint*(.33+.38*diffuse)+spec*.065;
`;
const noiseBody = `
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 a = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),a.x),
    mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),a.x),a.y),
    mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),a.x),
    mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),a.x),a.y),a.z);
`;
const hash = "fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453123)";
const glLighting = `
float hash(vec3 p) { return ${hash}; }
float noise(vec3 p) {${noiseBody}}
vec3 shade(vec3 position,vec3 normal,vec3 tint,float material,vec3 skin) {${lightBody}}
`;
function wgslBody(src) {
  // Shared lighting uses a small common subset of WGSL and GLSL.
  return src
    .replace(/(vec[234]|float) (\w+) =/g, "var $2 =")
    .replaceAll("shadows[i]", "scene.shadows[i]")
    .replace(/\b(eye|primary|secondary)\b/g, "scene.$1.xyz")
    .replace("int i=0; i<32; i++", "var i=0; i<32; i++")
    .replaceAll("vec3(", "vec3f(").replaceAll("vec2(", "vec2f(")
    .replace(" + grain;", " + vec3f(grain);")
    .replace(" + (micro-.46)*.026;", " + vec3f((micro-.46)*.026);")
    .replace(" + (spec*.56+fill*.36)*tint.g;", " + vec3f((spec*.56+fill*.36)*tint.g);")
    .replace("+spec*.065;", "+vec3f(spec*.065);")
    .replace("3.0-2.0*f", "vec3f(3.0)-2.0*f");
}
const wgsl = `
struct Scene {
  matrix: mat4x4f,
  eye: vec4f,
  primary: vec4f,
  secondary: vec4f,
  shadows: array<vec4f,32>,
};
@group(0) @binding(0) var<uniform> scene: Scene;
struct Vertex {
  @builtin(position) clip: vec4f,
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) tint: vec3f,
  @location(3) @interpolate(flat) material: f32,
  @location(4) skin: vec3f,
};
@vertex fn vert(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) t: vec4f, @location(3) skin: vec3f) -> Vertex {
  return Vertex(scene.matrix * vec4f(p,1.0), p, n, t.xyz, t.w, skin);
}
fn hash(p: vec3f) -> f32 { return ${wgslBody(hash)}; }
fn noise(p: vec3f) -> f32 {${wgslBody(noiseBody)}}
fn shade(position: vec3f, normal: vec3f, tint: vec3f, material: f32, skin: vec3f) -> vec3f {${wgslBody(lightBody)}}
@fragment fn frag(v: Vertex) -> @location(0) vec4f {
  return vec4f(pow(clamp(shade(v.position,v.normal,v.tint,v.material,v.skin),vec3f(0.0),vec3f(1.0)),vec3f(.79)),1.0);
}
`;

async function webgpu(canvas, mesh, lost) {
  const adapter=await navigator.gpu?.requestAdapter();
  if(!adapter) return null;
  const device=await adapter.requestDevice();
  const format=navigator.gpu.getPreferredCanvasFormat();
  const code=device.createShaderModule({code:wgsl});
  const diagnostics=await code.getCompilationInfo();
  const errors=diagnostics.messages.filter(m=>m.type==="error");
  if(errors.length) {
    device.destroy();
    throw new Error(errors.map(e=>e.message).join("\n"));
  }
  const pipeline=await device.createRenderPipelineAsync({
    layout:"auto",
    vertex:{module:code,entryPoint:"vert",buffers:[{
      arrayStride:52,attributes:[
        {shaderLocation:0,offset:0,format:"float32x3"},
        {shaderLocation:1,offset:12,format:"float32x3"},
        {shaderLocation:2,offset:24,format:"float32x4"},
        {shaderLocation:3,offset:40,format:"float32x3"}
      ]
    }]},
    fragment:{module:code,entryPoint:"frag",targets:[{format}]},
    primitive:{topology:"triangle-list"},
    multisample:{count:4},
    depthStencil:{format:"depth24plus",depthWriteEnabled:true,depthCompare:"less"}
  });
  const context=canvas.getContext("webgpu");
  if(!context) { device.destroy(); return null; }
  context.configure({device,format,alphaMode:"opaque"});
  device.lost.then(lost);
  const vertices=device.createBuffer({size:mesh.vertices.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});
  const indices=device.createBuffer({size:mesh.indices.byteLength,usage:GPUBufferUsage.INDEX|GPUBufferUsage.COPY_DST});
  const uniform=new Float32Array(28+32*4);
  const params=device.createBuffer({size:uniform.byteLength,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  const bind=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:params}}]});
  let depth=null, color=null;
  return {
    name:"WebGPU",
    draw(cam,palette) {
      if(!depth || canvas.width!==depth.width || canvas.height!==depth.height) {
        depth?.destroy();
        color?.destroy();
        const surface={size:[canvas.width,canvas.height],sampleCount:4,usage:GPUTextureUsage.RENDER_ATTACHMENT};
        depth=device.createTexture({...surface,format:"depth24plus"});
        color=device.createTexture({...surface,format});
      }
      uniform.set(cam.matrix);
      uniform.set(cam.eye,16);
      uniform.set(palette[0],20);
      uniform.set(palette[1],24);
      uniform.set(mesh.samples,28);
      device.queue.writeBuffer(params,0,uniform);
      device.queue.writeBuffer(vertices,0,mesh.vertices,0,mesh.count*13);
      device.queue.writeBuffer(indices,0,mesh.indices,0,mesh.faces);
      const encoder=device.createCommandEncoder();
      const pass=encoder.beginRenderPass({
        colorAttachments:[{view:color.createView(),resolveTarget:context.getCurrentTexture().createView(),clearValue:[.03,.05,.07,1],loadOp:"clear",storeOp:"discard"}],
        depthStencilAttachment:{view:depth.createView(),depthClearValue:1,depthLoadOp:"clear",depthStoreOp:"discard"}
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0,bind);
      pass.setVertexBuffer(0,vertices);
      pass.setIndexBuffer(indices,"uint32");
      pass.drawIndexed(mesh.faces);
      pass.end();
      device.queue.submit([encoder.finish()]);
    }
  };
}

function webgl(canvas,mesh,lost) {
  const gl=canvas.getContext("webgl2",{antialias:true,alpha:false});
  if(!gl) return null;
  canvas.addEventListener("webglcontextlost",lost);
  function shader(type,src) {
    const object=gl.createShader(type);
    gl.shaderSource(object,src);
    gl.compileShader(object);
    if(!gl.getShaderParameter(object,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(object));
    return object;
  }
  const vs=shader(gl.VERTEX_SHADER,`#version 300 es
    layout(location=0) in vec3 p;
    layout(location=1) in vec3 n;
    layout(location=2) in vec4 t;
    layout(location=3) in vec3 s;
    uniform mat4 matrix;
    out vec3 position;
    out vec3 normal;
    out vec3 tint;
    out vec3 skin;
    flat out float material;
    void main() {
      vec4 clip=matrix*vec4(p,1.0);
      gl_Position=vec4(clip.xy,clip.z*2.0-clip.w,clip.w);
      position=p; normal=n; tint=t.xyz; material=t.w; skin=s;
    }
  `);
  const fs=shader(gl.FRAGMENT_SHADER,`#version 300 es
    precision highp float;
    in vec3 position;
    in vec3 normal;
    in vec3 tint;
    in vec3 skin;
    flat in float material;
    uniform vec3 eye;
    uniform vec3 primary;
    uniform vec3 secondary;
    uniform vec4 shadows[32];
    out vec4 color;
    ${glLighting}
    void main() {
      color=vec4(pow(clamp(shade(position,normal,tint,material,skin),0.0,1.0),vec3(.79)),1.0);
    }
  `);
  const program=gl.createProgram();
  gl.attachShader(program,vs);
  gl.attachShader(program,fs);
  gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  gl.useProgram(program);
  gl.enable(gl.DEPTH_TEST);
  const uniform=name=>gl.getUniformLocation(program,name);
  const matrix=uniform("matrix"),eye=uniform("eye"),primary=uniform("primary"),secondary=uniform("secondary"),shadows=uniform("shadows[0]");
  const vertices=gl.createBuffer(), indices=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,vertices);
  gl.bufferData(gl.ARRAY_BUFFER,mesh.vertices.byteLength,gl.DYNAMIC_DRAW);
  [3,3,4,3].forEach((size,i)=>{
    gl.enableVertexAttribArray(i);
    gl.vertexAttribPointer(i,size,gl.FLOAT,false,52,[0,12,24,40][i]);
  });
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,indices);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,mesh.indices.byteLength,gl.DYNAMIC_DRAW);
  return {
    name:"WebGL 2",
    draw(cam,palette) {
      gl.viewport(0,0,canvas.width,canvas.height);
      gl.clearColor(.03,.05,.07,1);
      gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      gl.uniformMatrix4fv(matrix,false,cam.matrix);
      gl.uniform3fv(eye,cam.eye);
      gl.uniform3fv(primary,palette[0]);
      gl.uniform3fv(secondary,palette[1]);
      gl.uniform4fv(shadows,mesh.samples);
      gl.bufferSubData(gl.ARRAY_BUFFER,0,mesh.vertices,0,mesh.count*13);
      gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER,0,mesh.indices,0,mesh.faces);
      gl.drawElements(gl.TRIANGLES,mesh.faces,gl.UNSIGNED_INT,0);
    }
  };
}

export async function createRenderer(canvas,mesh,lost) {
  try {
    const renderer=await webgpu(canvas,mesh,lost);
    if(renderer) return renderer;
  } catch(error) {
    console.warn("WebGPU renderer unavailable:",error);
  }
  return webgl(canvas,mesh,lost);
}
