/* Seekable floral crest, sharing the startup's clock. */
(() => {
  const canvas=document.querySelector('.sakura-field'),ctx=canvas.getContext('2d'),tau=Math.PI*2;
  const ease=n=>{const t=Math.max(0,Math.min(1,n));return t*t*(3-2*t);};
  const noise=n=>{const t=Math.sin(n*127.1+31.7)*43758.5453;return t-Math.floor(t);};
  const petals=Array.from({length:54},(_,i)=>({phase:noise(i+1)*tau,depth:.3+noise(i+41)*.7,offset:noise(i+91),size:4+noise(i+11)*10}));
  const petalShape=new Path2D('M0 -1 C1 -.75 .9 .45 0 1 C-.5 .35 -.75 -.4 0 -1');
  const petalVein=new Path2D('M0 -.7 Q.2 0 0 .8');
  const flowerShape=new Path2D(),flowerBlade=new Path2D('M0 0 C-.56 -.35 -.62 -.95 -.18 -1 L0 -.83 L.18 -1 C.62 -.95 .56 -.35 0 0');
  for(let j=0;j<5;j++){const a=(j+1)*tau/5;flowerShape.addPath(flowerBlade,{a:Math.cos(a),b:Math.sin(a),c:-Math.sin(a),d:Math.cos(a),e:0,f:0});}
  const rosetteOutline=new Path2D(),rosettePetals=new Path2D();
  for(let k=0;k<=360;k++){const a=k*tau/360,r=.9+.1*Math.cos(a*6),x=Math.cos(a)*r,y=Math.sin(a)*r;k?rosetteOutline.lineTo(x,y):rosetteOutline.moveTo(x,y);}
  rosetteOutline.closePath();
  const crestPetal=new Path2D('M0 -.68 C.14 -.83 .13 -1.02 0 -1.12 C-.13 -1.02 -.14 -.83 0 -.68');
  for(let k=0;k<12;k++){const a=k*tau/12;rosettePetals.addPath(crestPetal,{a:Math.cos(a),b:Math.sin(a),c:-Math.sin(a),d:Math.cos(a),e:0,f:0});}
  const glowTexture=document.createElement('canvas');glowTexture.width=glowTexture.height=256;
  const glowInk=glowTexture.getContext('2d'),glow=glowInk.createRadialGradient(128,128,12,128,128,128);
  glow.addColorStop(0,'#e9a5bc00');glow.addColorStop(.48,'#b987ca21');glow.addColorStop(1,'#bb77b600');glowInk.fillStyle=glow;glowInk.fillRect(0,0,256,256);
  let anchor,cleared=false;
  function measure(){
    const b=canvas.getBoundingClientRect(),r=document.querySelector('.radar').getBoundingClientRect(),scale=Math.max(b.width/1536,b.height/864);
    anchor={x:(r.left+r.width/2-b.left-(b.width-1536*scale)/2)/scale,y:(r.top+r.height/2-b.top-(b.height-864*scale)/2)/scale,r:r.width*.49/scale};
  }
  window.addEventListener('resize',()=>{anchor=null;});
  function petal(x,y,size,angle,opacity){
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(size,size);ctx.globalAlpha=opacity;ctx.fillStyle='#f3bacd';
    ctx.fill(petalShape);
    ctx.strokeStyle='#ffe0e7';ctx.lineWidth=.07;ctx.stroke(petalVein);ctx.restore();
  }
  function blossom(x,y,r,angle,alpha){
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(r,r);ctx.globalAlpha=alpha;ctx.strokeStyle='#efbbd3';ctx.fillStyle='#b978a721';ctx.lineWidth=1.15/r;
    ctx.fill(flowerShape);ctx.stroke(flowerShape);
    ctx.fillStyle='#ffe5cd';ctx.beginPath();ctx.arc(0,0,2.2/r,0,tau);ctx.fill();ctx.restore();
  }
  function arcRing(radius,phase,count,coverage,color,alpha,width=1){
    ctx.strokeStyle=color;ctx.globalAlpha=alpha;ctx.lineWidth=width;
    for(let j=0;j<count;j++){const a=phase+j*tau/count;ctx.beginPath();ctx.arc(0,0,radius,a,a+tau/count*coverage);ctx.stroke();}
  }
  function rosette(radius,phase,alpha){
    ctx.save();ctx.rotate(phase);ctx.scale(radius,radius);ctx.strokeStyle='#c9b1df';ctx.globalAlpha=alpha;ctx.lineWidth=1.2/radius;ctx.stroke(rosetteOutline);
    ctx.globalAlpha=alpha*.58;ctx.stroke(rosettePetals);
    ctx.restore();
  }
  function render(s,reduced){
    ctx.setTransform(1,0,0,1,0,0);if(s>=11){if(!cleared)ctx.clearRect(0,0,1536,864);cleared=true;return;}cleared=false;ctx.clearRect(0,0,1536,864);if(!anchor)measure();
    const {x,y,r}=anchor,appear=ease((s-.28)/1.05),open=ease((s-4.0)/1.2),fade=1-ease((s-5.15)/1.6),spin=reduced?0:s;
    const radius=r*(.92+.08*ease(s/1.6)+open*.55);
    if(fade>0&&appear>0){
      ctx.save();ctx.translate(x,y);ctx.scale(1+.018*Math.sin(spin*1.4),1+.018*Math.sin(spin*1.4));
      ctx.globalAlpha=appear*fade;ctx.drawImage(glowTexture,-r*1.7,-r*1.7,r*3.4,r*3.4);
      rosette(radius*1.26,spin*.1,appear*fade*.75);rosette(radius*1.12,-spin*.13,appear*fade*.26);
      ctx.shadowColor='#d896bd';ctx.shadowBlur=7;arcRing(radius*.98,spin*.2,8,.77,'#f1c3d6',appear*fade*.85,1.7);ctx.shadowBlur=0;
      arcRing(radius*1.08,-spin*.1,3,.72,'#baa5d9',appear*fade*.65,1.2);arcRing(radius*.79,-spin*.34,12,.52,'#f5dcc3',appear*fade*.6,.8);
      for(let k=0;k<72;k++){
        const a=k*tau/72+spin*.07,inner=radius*1.38,outer=inner+(k%6===0?11:4);ctx.globalAlpha=appear*fade*(k%6===0?.72:.2);ctx.strokeStyle='#f4cee0';ctx.lineWidth=k%6===0?1.3:.8;
        ctx.beginPath();ctx.moveTo(Math.cos(a)*inner,Math.sin(a)*inner);ctx.lineTo(Math.cos(a)*outer,Math.sin(a)*outer);ctx.stroke();
      }
      for(let k=0;k<6;k++){const a=k*tau/6-spin*.12;blossom(Math.cos(a)*radius*1.4,Math.sin(a)*radius*1.4,9,a,appear*fade*.88);}
      for(let side of [-1,1]){
        ctx.globalAlpha=appear*fade*.32;ctx.strokeStyle='#bb97cf';ctx.lineWidth=.8;
        for(let k=0;k<3;k++){ctx.beginPath();ctx.moveTo(side*radius*1.14,-radius*.23);ctx.bezierCurveTo(side*radius*1.7,-radius*.6,side*(radius*2.3+k*18),radius*.58,side*(radius*2.8+k*20),radius*.08);ctx.stroke();}
        blossom(side*radius*2.25,radius*.19,17,spin*side*.09,appear*fade*.75);ctx.globalAlpha=appear*fade*.52;ctx.fillStyle='#f3c4d7';
        for(let k=0;k<3;k++){const q=side*(radius*2.53+k*20),v=radius*.02;ctx.beginPath();ctx.moveTo(q,v-3);ctx.lineTo(q+3,v);ctx.lineTo(q,v+3);ctx.lineTo(q-3,v);ctx.closePath();ctx.fill();}
      }
      ctx.restore();
    }
    if(!reduced){
      const scene=ease((s-7.2)/.6);
      for(let i=0;i<petals.length;i++){
        const p=petals[i],a=p.phase+spin*(.11+.08*p.depth),orbit=radius*(1.05+p.depth*.85)+open*(260+p.offset*380);
        const px=x+Math.cos(a)*orbit,py=y+Math.sin(a)*orbit*.74+Math.sin(spin+p.phase)*11,dx=(p.offset*1536+spin*(7+p.depth*9))%1636-50,dy=(p.depth*864+spin*(5+p.offset*12))%964-50;
        const alpha=appear*fade*(.22+p.depth*.46)*(1-scene)+scene*(.12+p.depth*.21);
        petal(px*(1-scene)+dx*scene,py*(1-scene)+dy*scene,p.size*(.55+.45*p.depth),a+spin*.7,alpha);
      }
    }
    ctx.globalAlpha=1;ctx.setTransform(1,0,0,1,0,0);
  }
  window.personalEffects={render};
})();
