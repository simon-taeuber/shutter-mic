/* Shutter Mic: measurement core, ported from the Minolta Workbench Shutter Tester (v72).
   Keep ALL_SPEEDS, DIAL, speedsFor and analyse() in step with the Workbench so the speed labels and results match on import. */
"use strict";
const MODELS=[["srt101","SR-T 101","SR-T"],["srt202","SR-T 202","SR-T"],["srt303","SR-T 303","SR-T"],["xe","XE / XE-7","XE"],["xe1","XE-1","XE"],["xe5","XE-5","XE"],["xd7","XD-7","XD"],["xd11","XD-11","XD"],["xd","XD / XD-s","XD"],["xd5","XD-5","XD"],["xg2","XG-2 / XG-7 / XG-E","XG"],["xg1","XG-1","XG"],["xgse","XG-SE","XG"],["xg9","XG-9 / XG-S","XG"],["xga","XG-A / X-7","XG"],["xgm","XG-M / X-70","XG"],["x300","X-300 / X-370","X"],["x300s","X-300s / X-370s","X"],["x500","X-500","X"],["x700","X-700","X"],["himatic7s","Hi-Matic 7s","Hi-Matic"],["himatics","Hi-Matic S / Hi-Matic SD","Hi-Matic"],["himaticaf2","Hi-Matic AF2","Hi-Matic"],["af7000","7000 / Maxxum 7000","AF"],["af9000","9000 / Maxxum 9000","AF"],["af5000","5000 / Maxxum 5000","AF"],["af7000i","Dynax 7000i / Maxxum 7000i","AF"],["af3000i","Dynax 3000i / Maxxum 3000i","AF"],["af5000i","Dynax 5000i / Maxxum 5000i","AF"],["af8000i","Dynax 8000i / Maxxum 8000i","AF"],["af7xi","Dynax 7xi / Maxxum 7xi","AF"],["af3xi","Dynax 3xi / Maxxum 3xi","AF"],["af2xi","Dynax 2xi / Dynax SPxi / Maxxum 2xi / Maxxum SPxi","AF"],["af5xi","Dynax 5xi / Maxxum 5xi","AF"],["af9xi","Dynax 9xi / Maxxum 9xi","AF"],["af700si","Dynax 700si / Maxxum 700si","AF"],["af500si","Dynax 500si / Dynax 505si / Maxxum 500si","AF"],["af300si","Dynax 300si / Dynax 303si / Maxxum 300si","AF"],["af400si","Dynax 400si / Dynax 404si / Maxxum 400si","AF"],["af600si","Dynax 600si Classic / Maxxum 600si Classic","AF"],["af800si","Dynax 800si / Maxxum 800si","AF"],["af9","Dynax 9 / Maxxum 9","AF"],["af9ti","Dynax 9Ti / Maxxum 9Ti","AF"],["af7","Dynax 7 / Maxxum 7","AF"],["af5","Dynax 5 / Maxxum 5","AF"],["af4","Dynax 4 / Maxxum 4","AF"],["af3l","Dynax 3L / Maxxum 3","AF"],["af60","Dynax 60 / Maxxum 70","AF"],["af40","Dynax 40 / Maxxum 50","AF"]];
const ALL_SPEEDS=[[1/1000,"1/1000"],[1/500,"1/500"],[1/250,"1/250"],[1/125,"1/125"],[1/60,"1/60"],[1/30,"1/30"],[1/15,"1/15"],[1/8,"1/8"],[1/4,"1/4"],[1/2,"1/2"],[1,"1 s"],[2,"2 s"],[4,"4 s"]];
/* Settings on each body's speed dial (manual mode), from the model pages. Mechanical positions: XD "O" = 1/100, XE "X" = 1/90. */
const DIAL={srt101:[1],srt202:[1],srt303:[1],xe:[4,[1/90,"X (1/90)"]],xe1:[4,[1/90,"X (1/90)"]],xe5:[4],
  xd7:[1,[1/100,"O (1/100)"]],xd11:[1,[1/100,"O (1/100)"]],xd:[1,[1/100,"O (1/100)"]],xd5:[1],x300:[4],x300s:[4],x500:[1],x700:[4],
  xg2:[1],xg1:[1],xgse:[1],xg9:[1],xgm:[1],xga:[0,[1/60,"X (1/60)"]],
  af7000:[4,[1/2000,"1/2000"]],af9000:[4,[1/4000,"1/4000"],[1/2000,"1/2000"]],af5000:[1,[1/2000,"1/2000"]],af7000i:[4,[1/4000,"1/4000"],[1/2000,"1/2000"]],af5000i:[4,[1/2000,"1/2000"]],af8000i:[4,[1/8000,"1/8000"],[1/2000,"1/2000"],[1/4000,"1/4000"]],af7xi:[4,[1/8000,"1/8000"],[1/2000,"1/2000"],[1/4000,"1/4000"]],af5xi:[4,[1/4000,"1/4000"],[1/2000,"1/2000"]],af9xi:[4,[1/12000,"1/12000"],[1/2000,"1/2000"],[1/4000,"1/4000"],[1/8000,"1/8000"]],af700si:[4,[1/4000,"1/4000"],[1/2000,"1/2000"]],af500si:[4,[1/2000,"1/2000"]],af400si:[4,[1/2000,"1/2000"]],af600si:[4,[1/4000,"1/4000"],[1/2000,"1/2000"]],af800si:[4,[1/8000,"1/8000"],[1/2000,"1/2000"],[1/4000,"1/4000"]],af9:[4,[1/12000,"1/12000"],[1/2000,"1/2000"],[1/4000,"1/4000"],[1/8000,"1/8000"]],af9ti:[4,[1/12000,"1/12000"],[1/2000,"1/2000"],[1/4000,"1/4000"],[1/8000,"1/8000"]],af7:[4,[1/8000,"1/8000"],[1/2000,"1/2000"],[1/4000,"1/4000"]],af5:[4,[1/4000,"1/4000"],[1/2000,"1/2000"]],af4:[4,[1/2000,"1/2000"]],af3l:[4,[1/2000,"1/2000"]],af60:[4,[1/4000,"1/4000"],[1/2000,"1/2000"]],af40:[4,[1/2000,"1/2000"]],
  himatic7s:[0,[1/500,"1/500"],[1/250,"1/250"],[1/125,"1/125"],[1/60,"1/60"],[1/30,"1/30"],[1/15,"1/15"],[1/8,"1/8"],[1/4,"1/4"]],himatics:[0,[1/4,"Cell covered (≈1/4)"],[1/450,"Bright lamp (≈1/450)"]],himaticaf2:[0,[1/8,"Cell covered (≈1/8)"],[1/430,"Bright lamp (≈1/430)"]]}; // AF bodies: slow end capped at 4 s (the tester list stops there), fast speeds added // XG-A dial has only A, X and B // Hi-Matic S: programmed leaf shutter, time the two ends of the program (light sensor at the film gate, lamp in front of the lens)
const speedsFor=key=>{const d=key&&DIAL[key];const slow=d?d[0]:1;const list=ALL_SPEEDS.filter(([v])=>v<=slow);
  for(const extra of (d||[]).slice(1))list.push(extra);return list.sort((p,q)=>p[0]-q[0])};
const fmtSec=s=>!isFinite(s)||s<=0?"—":s>=0.95?s.toFixed(2)+" s":`1/${Math.round(1/s)} · ${(s*1000).toFixed(s<0.01?2:1)} ms`;
const stopsOff=(meas,nom)=>Math.log2(meas/nom);
const devClass=d=>Math.abs(d)<=1/3?"ok":Math.abs(d)<=2/3?"warn":"bad";
const verdict=d=>Math.abs(d)<=1/3?"OK":Math.abs(d)<=2/3?(d>0?"Borderline, slow":"Borderline, fast"):(d>0?"Correct: too slow":"Correct: too fast");
const fmtStops=d=>(d>=0?"+":"−")+Math.abs(d).toFixed(2)+" EV";
function speedStats(list,label,nom){
  const xs=list.filter(s=>s.set===label&&s.measured>0);if(!xs.length)return null;
  const ms=xs.map(s=>s.measured),avg=ms.reduce((a,b)=>a+b,0)/ms.length,ev=ms.map(m=>stopsOff(m,nom));
  return {n:xs.length,avg,stops:stopsOff(avg,nom),spread:Math.max(...ev)-Math.min(...ev),min:Math.min(...ms),max:Math.max(...ms),last:xs[0],trace:xs.find(s=>s.trace)};
}
async function decodeRecording(file){
  const AC=window.AudioContext||window.webkitAudioContext;const ctx=new AC();
  try{const ab=await ctx.decodeAudioData(await file.arrayBuffer());
    const n=ab.length,ch=ab.numberOfChannels,x=new Float32Array(n);
    for(let c=0;c<ch;c++){const d=ab.getChannelData(c);for(let i=0;i<n;i++)x[i]+=d[i]/ch}
    return {x,sr:ab.sampleRate};
  }finally{ctx.close?.()}
}
function envelope(x,sr,winSec,fromStart){
  let mean=0;
  if(fromStart){const k=Math.max(1,Math.min(x.length,Math.round(sr*0.05)));const head=Array.from(x.subarray(0,k)).sort((a,b)=>a-b);mean=head[k>>1]} // light: baseline is the dark level before the shot
  else{for(let i=0;i<x.length;i++)mean+=x[i];mean/=x.length||1}
  const w=Math.max(1,Math.round(sr*winSec)),n=x.length,env=new Float32Array(n);let acc=0;
  for(let i=0;i<n;i++){acc+=Math.abs(x[i]-mean);if(i>=w)acc-=Math.abs(x[i-w]-mean);env[i]=acc/Math.min(i+1,w)}
  // centre the window
  const h=w>>1;return {env:env.subarray(h).length?Float32Array.from({length:n},(_,i)=>env[Math.min(n-1,i+h)]):env,mean};
}
function analyse({x,sr},mode,nominal){
  const light=mode==="light";
  const {env}=envelope(x,sr,light?0.0002:0.001,light);
  const step=Math.max(1,Math.floor(env.length/20000)),samp=[];for(let i=0;i<env.length;i+=step)samp.push(env[i]);samp.sort((a,b)=>a-b);
  const peak=samp[samp.length-1]||0;let floor=samp[Math.floor(samp.length*0.5)]||0;
  if(light){const k=Math.max(1,Math.round(sr*0.05));let m=0;for(let i=0;i<k&&i<env.length;i++)m=Math.max(m,env[i]);floor=Math.min(floor,m)}
  if(peak<=floor*3||peak<1e-4)return {error:"No clear shutter event found. Record closer to the camera, or check the sensor and lamp."};
  const thr=floor+(light?0.5:0.25)*(peak-floor),gap=Math.round(sr*(light?0.001:0.004));
  const bursts=[];let cur=null;
  for(let i=0;i<env.length;i++){
    if(env[i]>thr){if(cur&&i-cur.end<=gap){cur.end=i;if(env[i]>cur.peak)cur.peak=env[i]}else{cur={start:i,end:i,peak:env[i]};bursts.push(cur)}}
  }
  const strong=bursts.filter(b=>b.peak>=floor+(light?0.5:0.3)*(peak-floor));
  if(!strong.length)return {error:"No clear shutter event found."};
  let a,b,method;
  if(light){
    if(strong.length===1){a=strong[0].start;b=strong[0].end;method="pulse width at half height"}
    else{a=strong[0].start;b=strong[1].start;method="time between the open and close edges"}
  }else{
    // An SLR shot makes four sounds: mirror up, first curtain, second curtain, mirror down.
    // Mirror up and first curtain are ~30-50 ms apart on every speed, so the exposure is the
    // longest quiet stretch in the shot: from the first-curtain click to the second-curtain click.
    const lowThr=Math.max(floor*4,floor+0.06*(peak-floor)),mg=Math.round(sr*0.004);
    const ev=[];let c=null;
    for(let i=0;i<env.length;i++){if(env[i]>lowThr){if(c&&i-c.end<=mg){c.end=i;if(env[i]>c.peak)c.peak=env[i]}else{c={start:i,end:i,peak:env[i]};ev.push(c)}}}
    let clicks=ev.filter(b=>b.peak>=floor+0.12*(peak-floor));
    if(clicks.length){const t0=clicks[0].start;clicks=clicks.filter(b=>b.start-t0<=sr*6)}
    if(clicks.length<2)return {error:"Only one sound found. Record closer to the camera in a quiet room.",env,sr,floor,thr:lowThr,a:clicks[0]?.start||0,b:clicks[0]?.end||0};
    let gi=0,gl=-1;for(let i=0;i<clicks.length-1;i++){const q=clicks[i+1].start-clicks[i].end;if(q>gl){gl=q;gi=i}}
    a=clicks[gi].start;b=clicks[gi+1].start;method="longest quiet gap: first curtain to second curtain";
    const out={measured:(b-a)/sr,a,b,env,sr,thr:lowThr,floor,method,events:clicks.length,clicks:clicks.map(c=>c.start)};
    if(nominal&&nominal<1/20)out.error="Audio can't time this speed: the mirror-to-curtain delay (about 40 ms on Minolta X and XD bodies) is longer than the exposure, so the gap you hear isn't the exposure. Use the light sensor.";
    else if(nominal&&Math.abs(Math.log2(out.measured/nominal))>2)out.warn="Unusually far off. Check that the two markers sit on the curtain clicks, not on mirror sounds.";
    return out;
  }
  return {measured:(b-a)/sr,a,b,env,sr,thr,floor,method,events:strong.length,clicks:strong.map(c=>c.start)};
}
/* A trace is a small, storable picture of one measurement: envelope bins plus the marker times in seconds. */
function makeTrace(r){
  if(!r||!r.env)return null;
  const sr=r.sr,span=Math.max(r.b-r.a,1),pad=Math.max(span*0.6,Math.round(sr*0.06));
  const s0=Math.max(0,Math.floor(r.a-pad)),s1=Math.min(r.env.length,Math.ceil(r.b+pad)),N=320,per=(s1-s0)/N;
  let mx=0;for(let i=s0;i<s1;i++)if(r.env[i]>mx)mx=r.env[i];
  const v=[];for(let k=0;k<N;k++){let m=0;const i0=Math.floor(s0+k*per),i1=Math.max(i0+1,Math.floor(s0+(k+1)*per));for(let i=i0;i<i1&&i<s1;i++)if(r.env[i]>m)m=r.env[i];v.push(Math.round(255*m/(mx||1)))}
  const r3=x=>+x.toFixed(5);
  return {t0:r3(s0/sr),t1:r3(s1/sr),v,start:r3(r.a/sr),stop:r3(r.b/sr),thr:Math.round(255*(r.thr||0)/(mx||1)),clicks:(r.clicks||[]).map(c=>r3(c/sr)).filter(t=>t>=s0/sr&&t<=s1/sr)};
}
function drawTrace(cv,tr){
  if(!cv||!tr)return;
  const css=getComputedStyle(document.documentElement);const ink=css.getPropertyValue("--muted").trim()||"#888",acc=css.getPropertyValue("--accent").trim()||"#c40",rule=css.getPropertyValue("--rule").trim()||"#ccc";
  const dpr=window.devicePixelRatio||1,W=cv.clientWidth||300,H=cv.clientHeight||56;cv.width=W*dpr;cv.height=H*dpr;
  const g=cv.getContext("2d");g.scale(dpr,dpr);g.clearRect(0,0,W,H);
  const X=t=>(t-tr.t0)/(tr.t1-tr.t0)*W,bw=W/tr.v.length;g.fillStyle=ink;
  tr.v.forEach((m,k)=>{const h=m/255*(H-14);g.fillRect(k*bw,H-3-h,Math.max(1,bw-0.3),h)});
  g.strokeStyle=rule;g.setLineDash([3,3]);const ty=H-3-tr.thr/255*(H-14);g.beginPath();g.moveTo(0,ty);g.lineTo(W,ty);g.stroke();g.setLineDash([]);
  g.fillStyle=ink;for(const c of tr.clicks||[]){g.fillRect(X(c)-1,0,2,5)}  // every detected sound
  g.strokeStyle=acc;g.lineWidth=2;for(const t of [tr.start,tr.stop]){g.beginPath();g.moveTo(X(t),0);g.lineTo(X(t),H);g.stroke()}
}
const drawWave=(cv,r)=>drawTrace(cv,makeTrace(r));
const traceCaption=tr=>tr?`Start ${tr.start.toFixed(3)} s · stop ${tr.stop.toFixed(3)} s into the recording · ${tr.clicks?.length||0} sounds detected`:"";
