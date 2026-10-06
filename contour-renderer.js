/* Upload contours once; one GPU draw moves all the line fragments each frame. */
(() => {
  const vertex=`#version 300 es
  precision highp float;
  in vec4 segment;
  in vec4 target;
  in vec4 source;
  in vec4 corner;
  in vec2 direction;
  uniform vec3 clock;
  out vec2 linePoint;
  out float lineLength;
  vec2 rotatePoint(vec2 p,float a){float c=cos(a),s=sin(a);return vec2(p.x*c-p.y*s,p.x*s+p.y*c);}
  void main(){
    float p=clock.x,drift=clock.y,spread=clock.z;
    float arrival=smoothstep(0.,1.,(p*1.5-.25-target.x/1536.+.16)/.32);
    float loose=1.-arrival,size=.16+.84*arrival,angle=target.z*loose;
    vec2 start=mix(source.zw,source.xy,spread);
    vec2 center=mix(start,target.xy,arrival)+vec2(sin(drift*.8+target.w),cos(drift*.6+target.w))*7.*loose*spread;
    float extent=1.45,signEnd=corner.x*2.-1.;
    vec2 offset=direction*signEnd*extent+segment.zw*corner.y*extent;
    vec2 position=center+rotatePoint(segment.xy*size+offset,angle);
    gl_Position=vec4(position/vec2(768.,-432.)+vec2(-1.,1.),0.,1.);
    lineLength=corner.z*size;
    linePoint=vec2(corner.x*lineLength+signEnd*extent,corner.y*extent);
  }`;
  const fragment=`#version 300 es
  precision highp float;
  in vec2 linePoint;
  in float lineLength;
  uniform float opacity;
  out vec4 color;
  void main(){
    float endDistance=max(-linePoint.x,linePoint.x-lineLength);
    float distance=length(vec2(max(endDistance,0.),linePoint.y));
    float coverage=1.-smoothstep(.125,1.125,distance);
    color=vec4(vec3(200.,192.,205.)/255.,coverage*opacity);
  }`;
  window.createContourRenderer=(original,fragments)=>{
    const canvas=document.createElement('canvas');canvas.className='line-art contour-gpu';canvas.width=1536;canvas.height=864;canvas.style.opacity='0';
    const gl=canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:true,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:false});
    if(!gl)return null;
    let program,buffer,disposed=false;
    try{
      function compile(type,text){const shader=gl.createShader(type);gl.shaderSource(shader,text);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){const error=gl.getShaderInfoLog(shader);gl.deleteShader(shader);throw Error(error);}return shader;}
      const shaders=[compile(gl.VERTEX_SHADER,vertex),compile(gl.FRAGMENT_SHADER,fragment)];
      program=gl.createProgram();for(const shader of shaders)gl.attachShader(program,shader);gl.linkProgram(program);for(const shader of shaders)gl.deleteShader(shader);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
      const values=[],corners=[[0,-1],[1,-1],[0,1],[0,1],[1,-1],[1,1]];
      for(const piece of fragments)for(let i=1;i<piece.points.length;i++){
        const a=piece.points[i-1],b=piece.points[i],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);if(!length)continue;
        const nx=-dy/length,ny=dx/length;
        for(const [end,side] of corners){const point=end?b:a;values.push(point[0],point[1],nx,ny,piece.x,piece.y,piece.angle,piece.seed,piece.sx,piece.sy,piece.ix??piece.sx,piece.iy??piece.sy,end,side,length,0,dx/length,dy/length);}
      }
      const data=new Float32Array(values),count=data.length/18;
      buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);gl.useProgram(program);
      for(const [name,size,offset] of [['segment',4,0],['target',4,4],['source',4,8],['corner',4,12],['direction',2,16]]){const index=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(index);gl.vertexAttribPointer(index,size,gl.FLOAT,false,72,offset*4);}
      const clock=gl.getUniformLocation(program,'clock'),opacity=gl.getUniformLocation(program,'opacity');
      gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.clearColor(0,0,0,0);gl.viewport(0,0,1536,864);
      original.after(canvas);original.dataset.renderer='webgl2';
      return {
        canvas,
        draw(p,drift,spread,alpha){if(disposed||gl.isContextLost())return false;gl.clear(gl.COLOR_BUFFER_BIT);gl.uniform3f(clock,p,drift,spread);gl.uniform1f(opacity,alpha);gl.drawArrays(gl.TRIANGLES,0,count);return true;},
        hide(){canvas.style.opacity='0';},
        dispose(){if(disposed)return;disposed=true;gl.deleteBuffer(buffer);gl.deleteProgram(program);gl.getExtension('WEBGL_lose_context')?.loseContext();canvas.remove();}
      };
    }catch(error){if(buffer)gl.deleteBuffer(buffer);if(program)gl.deleteProgram(program);gl.getExtension('WEBGL_lose_context')?.loseContext();console.warn('Contour GPU fallback:',error.message);return null;}
  };
})();
