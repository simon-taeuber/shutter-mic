/* Shutter Mic: page state, live recording and the hand-off file for the Workbench.
   Shots stay in this browser (localStorage) until they are exported; the export is the
   "minolta-workbench-shutter" JSON that the Workbench Shutter Tester's JSON import reads. */
"use strict";
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const today=()=>new Date().toISOString().slice(0,10);
const store={get(k,d){try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch{return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch{}}};
let toastT=0;
function toast(msg){const t=$("#toast");t.textContent=msg;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>t.hidden=true,3200)}

let st={model:"",hubId:"",mode:"audio",note:"",hist:"speed",withTest:true,...store.get("shutterMic.settings",{})};
let shots=store.get("shutterMic.shots",[]);
const shotAudio={}; // shot id -> decoded audio from this page session, re-analysed when the method changes
const saveSettings=()=>{const {model,hubId,mode,hist,withTest}=st;store.set("shutterMic.settings",{model,hubId,mode,hist,withTest})};
const saveShots=()=>store.set("shutterMic.shots",shots);
/* Shots are grouped by camera: the Hub ID when one is typed, else the model. */
const camKey=()=>(st.hubId.trim().toUpperCase()||st.model||"none");
const camShots=()=>shots.filter(s=>s.cam===camKey());
const modelName=k=>(MODELS.find(m=>m[0]===k)||[,"Other camera"])[1];
const nominalOf=label=>speedsFor(st.model).find(([n,l])=>l===label)?.[0];

function addShot(label,nominal,o){
  const tr=o.analysis&&!o.manual?makeTrace(o.analysis):null;
  const s={id:"s"+Date.now().toString(36)+Math.random().toString(36).slice(2,6),cam:camKey(),at:new Date().toISOString(),set:label,nominal,
    measured:+o.measured.toPrecision(5),stops:+stopsOff(o.measured,nominal).toFixed(3),mode:st.mode,manual:!!o.manual,note:"",testId:"",
    ...(o.file?{file:o.file}:{}),...(tr?{trace:tr,method:o.analysis.method}:{}),...(o.warn?{warn:o.warn}:{})};
  shots=[s,...shots];if(o.dec)shotAudio[s.id]=o.dec;saveShots();return s;
}

/* ---------- Live recording (same trigger and capture as the Workbench Tester) ---------- */
var rec={on:false,live:false,stream:null,ctx:null,node:null,src:null,sr:48000,ring:null,ri:0,filled:0,blocks:0,floor:0,level:0,thr:0,dc:0,cool:0,state:"idle",armed:null,cap:null,capLeft:0,devId:"",devLabel:"",devs:[],err:"",last:"",sens:6,raf:0};
const REC_PRE=0.35;
const recTail=nom=>{const n=nom||0.5;return st.mode==="light"?Math.min(6,n+0.4):Math.min(6.5,n+0.7)};
const micAllowed=()=>{try{const p=document.permissionsPolicy||document.featurePolicy;return p?.allowsFeature?p.allowsFeature("microphone"):true}catch{return true}};
const framed=()=>{try{return window.top!==window.self}catch{return true}};
/* The audio engine must be created and resumed inside the tap itself: browsers (Safari above all) keep a context that is
   created after an await (here the permission prompt) suspended, and then no samples ever arrive. */
function audioCtx(){
  const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return null;
  if(!rec.ctx||rec.ctx.state==="closed")rec.ctx=new AC();
  try{rec.ctx.resume()}catch{}
  return rec.ctx;
}
async function recStart(){
  rec.err="";rec.diag="";
  if(!micAllowed()){rec.err="This page is shown inside another site that doesn't allow the microphone. Open it in its own tab.";return false}
  if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){rec.err="This browser gives the page no microphone access. Open the page over https (GitHub Pages) or from the file, not over plain http. Uploading a recording still works.";return false}
  try{rec.stream=await navigator.mediaDevices.getUserMedia({audio:{...(rec.devId?{deviceId:{exact:rec.devId}}:{}),echoCancellation:false,noiseSuppression:false,autoGainControl:false,channelCount:1}})}
  catch(e){const n=e?.name;rec.err=n==="NotAllowedError"||n==="SecurityError"?"The microphone was blocked for this page. Allow it with the icon in the address bar (or the phone's settings for this browser), then press Start again.":n==="NotFoundError"||n==="OverconstrainedError"?"No microphone or line input found. Plug the sensor in and try again.":"Could not open the microphone ("+(e?.message||n||"unknown error")+").";return false}
  if(!audioCtx()){rec.err="This browser has no Web Audio support. Uploading a recording still works.";recStop();return false}
  try{await Promise.race([rec.ctx.resume(),new Promise(r=>setTimeout(r,800))])}catch{}
  rec.sr=rec.ctx.sampleRate;rec.ring=new Float32Array(Math.round(rec.sr*REC_PRE));Object.assign(rec,{ri:0,filled:0,blocks:0,floor:0,level:0,dc:0,cool:0,state:"listen",on:true,cap:null});
  rec.src=rec.ctx.createMediaStreamSource(rec.stream);rec.node=rec.ctx.createScriptProcessor(2048,1,1);const mute=rec.ctx.createGain();mute.gain.value=0;
  rec.node.onaudioprocess=e=>recBlock(e.inputBuffer.getChannelData(0));rec.src.connect(rec.node);rec.node.connect(mute);mute.connect(rec.ctx.destination);
  rec.an=rec.ctx.createAnalyser();rec.an.fftSize=2048;rec.src.connect(rec.an);rec.anBuf=new Float32Array(rec.an.fftSize);
  Object.assign(rec,{t0:performance.now(),peak:0,peakT:0,loudT:0});
  const t=rec.stream.getAudioTracks()[0];rec.devLabel=t?.label||"";try{rec.devId=t?.getSettings?.().deviceId||rec.devId;rec.devs=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==="audioinput"&&d.deviceId)}catch{}
  t&&(t.onended=()=>{recStop();rec.err="The input was unplugged or taken by another app.";render()});
  return true;
}
function recStop(){
  if(!rec||!(rec.on||rec.stream))return;
  try{if(rec.node){rec.node.onaudioprocess=null;rec.node.disconnect()}rec.src?.disconnect();rec.an?.disconnect();rec.stream?.getTracks().forEach(t=>{t.onended=null;t.stop()});rec.ctx?.close?.()}catch{}
  cancelAnimationFrame(rec.raf);Object.assign(rec,{on:false,live:false,stream:null,ctx:null,node:null,src:null,an:null,state:"idle",cap:null});
}
function recBlock(x){
  let pk=0;for(let i=0;i<x.length;i++){rec.dc+=(x[i]-rec.dc)*0.0005;const d=Math.abs(x[i]-rec.dc);if(d>pk)pk=d}
  rec.level=Math.max(pk,rec.level*0.85);
  if(rec.state==="capture"){rec.cap.push(Float32Array.from(x));rec.capLeft-=x.length;if(rec.capLeft<=0)recFinish();return}
  const R=rec.ring;for(let i=0;i<x.length;i++){R[rec.ri]=x[i];rec.ri=(rec.ri+1)%R.length}rec.filled=Math.min(R.length,rec.filled+x.length);rec.blocks++;
  rec.thr=Math.max(rec.floor*rec.sens,0.012);
  const ready=rec.state==="listen"&&rec.live&&rec.armed&&rec.blocks>12&&rec.filled>=R.length;
  if(rec.cool>0)rec.cool-=x.length;
  else if(ready&&pk>rec.thr){
    const pre=new Float32Array(R.length);pre.set(R.subarray(rec.ri));pre.set(R.subarray(0,rec.ri),R.length-rec.ri);
    rec.live=false;rec.cap=[pre];rec.capLeft=Math.round(rec.sr*recTail(nominalOf(rec.armed)));rec.state="capture";return}
  rec.floor=rec.blocks<4?pk:Math.min(rec.floor*0.96+pk*0.04,Math.max(rec.floor,pk)); // slow noise-floor tracker, ignores single spikes
}
function recFinish(){
  const parts=rec.cap;rec.cap=null;rec.state="busy";
  setTimeout(()=>{
    let n=0;for(const p of parts)n+=p.length;const x=new Float32Array(n);let o=0;for(const p of parts){x.set(p,o);o+=p.length}
    const speeds=speedsFor(st.model),label=rec.armed,row=speeds.find(([n,l])=>l===label);
    if(row){
      const dec={x,sr:rec.sr},nominal=row[0],a=analyse(dec,st.mode,nominal);
      const when=new Date().toTimeString().slice(0,8);
      if(a.error){errs[label]=a.error;rec.last=`${label}: no reading, fire again.`}
      else{delete errs[label];addShot(label,nominal,{measured:a.measured,analysis:a,file:"Recorded in Shutter Mic "+when,dec,warn:a.warn});
        rec.last=`${label}: ${fmtSec(a.measured)} (${fmtStops(stopsOff(a.measured,nominal))}).`}
    }
    rec.cool=Math.round(rec.sr*0.8);if(rec.on)rec.state="listen";
    render();
  },0);
}
/* One shot per Arm: after a capture the page ignores every sound (winding, the room) until Arm is tapped again.
   Arming skips the next 0.4 s so the tap on the phone itself doesn't trigger. */
function recArm(on=true){
  if(!rec.on)return;rec.live=on;
  if(on)rec.cool=Math.max(rec.cool,Math.round(rec.sr*0.4));
  render();
}
function recMeter(){
  cancelAnimationFrame(rec.raf);if(!rec.on)return;
  const bar=$("#rec-bar"),mk=$("#rec-thr"),sx=$("#rec-state");if(!bar)return;
  const pos=v=>Math.min(100,Math.sqrt(Math.min(1,v))*100);
  // The analyser reads the input on its own path, so it tells "nothing arrives" apart from "the processing never runs".
  const now=performance.now();let pk=0;
  if(rec.an){rec.an.getFloatTimeDomainData(rec.anBuf);let m=0;for(const v of rec.anBuf)m+=v;m/=rec.anBuf.length;for(const v of rec.anBuf){const d=Math.abs(v-m);if(d>pk)pk=d}}
  if(pk>rec.peak||now-rec.peakT>1000){rec.peak=pk;rec.peakT=now}
  if(pk>0.0001)rec.loudT=now; // about -80 dB: only a muted or dead input is this quiet
  const shown=Math.max(rec.level,rec.blocks?0:pk);
  bar.style.width=pos(shown)+"%";mk.style.left=pos(rec.thr)+"%";
  const db=rec.peak>0?(20*Math.log10(rec.peak)).toFixed(0)+" dB":"silent",run=rec.ctx?.state||"none",age=now-rec.t0;
  const d=$("#rec-diag");
  if(d)d.textContent=`${rec.devLabel||"Default input"} · ${Math.round(rec.sr/100)/10} kHz · audio ${run} · ${rec.blocks} blocks · peak ${db}`;
  const msg=run!=="running"&&age>800?"The audio engine is paused by the browser. Tap Wake audio."
    :age>1500&&!rec.blocks?"No audio blocks are reaching the page. Tap Wake audio, or Stop and Start again."
    :age>3000&&now-rec.loudT>3000?"The input is completely silent. Check that the right input is picked, the sensor is plugged in and its volume is up (phone: the headset jack needs a 4-pole plug with the mic on the sleeve ring)."
    :"";
  if(msg!==rec.diag){rec.diag=msg;const w=$("#rec-warn");if(w){w.textContent=msg;w.hidden=!msg}$("#rec-wake")&&($("#rec-wake").hidden=!(run!=="running"||!rec.blocks))}
  sx.textContent=rec.state==="capture"?"Recording the shot…":rec.state==="busy"?"Measuring…":!rec.armed?"Pick a speed":!rec.live?`Wind, set the dial to ${rec.armed}, then tap Arm`:rec.blocks<=12?"Getting the noise level…":`Armed for ${rec.armed}: fire`;
  rec.raf=requestAnimationFrame(recMeter);
}

/* ---------- Hand-off ---------- */
const fileStem=()=>(st.hubId.trim().toUpperCase()||st.model||"no-camera")+"-shutter-"+today();
function buildExport(){
  const mine=camShots(),speeds=speedsFor(st.model);
  const tests=[];
  if(st.withTest&&mine.length){
    const results=speeds.map(([n,l])=>[n,l,speedStats(mine,l,n)]).filter(r=>r[2]).map(([n,l,x])=>{const tr=x.trace;
      return {set:l,nominal:n,measured:+x.avg.toPrecision(5),stops:+x.stops.toFixed(3),n:x.n,spread:+x.spread.toFixed(3),manual:mine.filter(s=>s.set===l).every(s=>s.manual),...(x.last.file?{file:x.last.file}:{}),...(tr?{trace:tr.trace,method:tr.method}:{})}});
    const w=Math.max(...results.map(x=>Math.abs(x.stops)));
    const modes=new Set(mine.filter(s=>!s.manual).map(s=>s.mode));
    tests.push({date:today(),at:new Date().toISOString(),mode:modes.size===1?[...modes][0]:st.mode,note:[st.note.trim(),"Recorded with Shutter Mic"].filter(Boolean).join(" · "),results,worst:+w.toFixed(3),shots:mine.length});
  }
  return {type:"minolta-workbench-shutter",version:1,exported:new Date().toISOString(),source:"shutter-mic",
    camera:st.hubId.trim()||st.model?{hubId:st.hubId.trim().toUpperCase()||"",modelKey:st.model||""}:null,
    shots:mine.map(({id,cam,...s})=>s),tests};
}
function download(name,text,type){
  const blob=new Blob([text],{type}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000);
}
async function share(name,text){
  const f=new File([text],name,{type:"application/json"});
  try{await navigator.share({files:[f],title:name})}catch(e){if(e?.name!=="AbortError")toast("Sharing didn't work. Use Save file instead.")}
}
const canShareFiles=()=>{try{return !!navigator.canShare&&navigator.canShare({files:[new File(["{}"],"x.json",{type:"application/json"})]})}catch{return false}};
const csvCell=v=>{const t=String(v??"");return /[",;\n]/.test(t)?`"${t.replace(/"/g,'""')}"`:t};
const csvOf=rows=>"﻿"+rows.map(r=>r.map(csvCell).join(",")).join("\n");

/* ---------- Page ---------- */
let errs={};
const ms=x=>(x*1000).toFixed(x<0.01?2:1);
const dev=x=>`<span class="dev dev-${devClass(x)} mono">${fmtStops(x)}</span>`;
function modelOptions(){
  const fams=[...new Set(MODELS.map(m=>m[2]))];
  return `<option value="" ${!st.model?"selected":""}>Other camera (1 s to 1/1000)</option>`+fams.map(f=>`<optgroup label="${esc(f==="AF"?"Dynax / Maxxum AF":f)}">${MODELS.filter(m=>m[2]===f).map(([k,n])=>`<option value="${k}" ${k===st.model?"selected":""}>${esc(n)}</option>`).join("")}</optgroup>`).join("");
}
function render(){
  const v=$("#view");
  const speeds=speedsFor(st.model),mine=camShots(),stats={};for(const [n,l] of speeds)stats[l]=speedStats(mine,l,n);
  const cnt=l=>mine.filter(s=>s.set===l).length;
  if(!rec.armed||!speeds.some(([n,l])=>l===rec.armed))rec.armed=(speeds.find(([n,l])=>!cnt(l))||speeds[0])[1];
  const [nom,label]=speeds.find(([n,l])=>l===rec.armed);
  const S=stats[label],d=S?S.stops:null,err=errs[label];
  const done=speeds.filter(([n,l])=>stats[l]);
  const worst=done.length?Math.max(...done.map(([n,l])=>Math.abs(stats[l].stops))):0;
  const hist=(st.hist==="speed"?mine.filter(s=>s.set===label):mine).slice(0,80);
  const others=[...new Set(shots.map(s=>s.cam))].filter(k=>k!==camKey());
  const blocked=!micAllowed()||framed();
  v.innerHTML=`<h1>Shutter Mic</h1>
  <p class="lede">Time the shutter with a microphone or a light sensor, then hand the shots to the Workbench as a file.</p>
  ${blocked?`<section class="panel warnbox"><strong>Open this page in its own tab.</strong> It's shown inside another page, which may block the microphone. <a href="${esc(location.href)}" target="_blank" rel="noopener">Open in a new tab</a></section>`:""}
  <section class="panel"><div class="grid3">
      <label class="field"><span class="label">Camera model</span><select id="m-model">${modelOptions()}</select></label>
      <label class="field"><span class="label">Hub ID (optional)</span><input id="m-hub" class="mono" value="${esc(st.hubId)}" placeholder="e.g. CAM-X700-001" autocomplete="off" autocapitalize="characters"></label>
      <div class="field"><span class="label">Method</span><div class="row" role="radiogroup" aria-label="Method">
        <button type="button" class="chip" aria-pressed="${st.mode==="audio"}" data-mode="audio">Microphone</button>
        <button type="button" class="chip" aria-pressed="${st.mode==="light"}" data-mode="light">Light sensor</button></div></div>
    </div>
    <p class="hint" style="margin:12px 0 0">${st.mode==="audio"
      ?"Audio times the gap between the first and second curtain clicks. It is reliable from the slowest speed to 1/15; faster speeds need the light sensor."
      :"Light sensor in the headset jack or a USB sound card, a steady lamp shining into the lens mount, back open. Works up to 1/1000."}</p>
    ${others.length?`<p class="hint" style="margin:8px 0 0">Shots for other cameras are also kept here: ${others.map(k=>`<span class="mono">${esc(k===k.toLowerCase()?modelName(k):k)}</span> (${shots.filter(s=>s.cam===k).length})`).join(", ")}. Pick that camera or Hub ID to see them.</p>`:""}
  </section>
  <div class="tt">
  <aside>
    <section class="panel tt-speeds"><div class="row" style="align-items:baseline"><h2>Speeds</h2><span class="spacer"></span><span class="hint">${done.length} of ${speeds.length}</span></div>
      <div class="tt-list" role="listbox" aria-label="Shutter speeds" style="margin-top:8px">${speeds.map(([n,l])=>{const x=stats[l];
        return `<button type="button" role="option" class="tt-item${l===label?" on":""}" aria-selected="${l===label}" data-sel="${esc(l)}"><span class="tt-l mono">${esc(l)}</span>
          <span class="tt-r">${x?`<span class="mono tt-m">×${x.n}</span>${dev(x.stops)}`:errs[l]?`<span class="hint err">no reading</span>`:`<span class="hint">—</span>`}</span></button>`}).join("")}</div>
      <p class="hint" style="margin:10px 0 0;font-size:.8rem">The selected speed stays until you pick another one.</p></section>
    <section class="panel tt-send"><h2>Send to the Workbench</h2>
      <p style="margin:6px 0 0">${mine.length?`${mine.length} shot${mine.length>1?"s":""} over ${done.length} speed${done.length>1?"s":""} · worst <span class="dev dev-${devClass(worst)} mono">±${worst.toFixed(2)} EV</span>`:`<span class="hint">No shots for this camera yet.</span>`}</p>
      <label class="field" style="margin-top:10px"><span class="label">Test note</span><input id="m-note" value="${esc(st.note)}" placeholder="e.g. fresh batteries, after cleaning"></label>
      <label class="row" style="gap:6px;font-size:.9rem;margin-top:8px"><input type="checkbox" id="m-test" ${st.withTest?"checked":""} style="width:auto"> Also save the averages as a test</label>
      <div class="row" style="margin-top:10px"><button class="primary" id="m-json" ${mine.length?"":"disabled"}>Save file</button>${canShareFiles()?`<button id="m-share" ${mine.length?"":"disabled"}>Share…</button>`:""}<button id="m-csv" class="small" ${mine.length?"":"disabled"}>Shots CSV</button></div>
      <ol class="steps hint"><li>Save or share the file.</li><li>In the Workbench, open Shutter Tester and pick ${st.hubId.trim()?`<span class="mono">${esc(st.hubId.trim().toUpperCase())}</span>`:"the camera"}.</li><li>Under Previous tests, press JSON import and choose the file.</li></ol>
      <button type="button" class="danger small" id="m-clear" style="margin-top:6px" ${mine.length?"":"disabled"}>Clear this camera's shots</button></section>
  </aside>
  <div class="tt-main">
    <section class="panel${rec.on?" listening":""}" id="m-rec"><div class="row" style="align-items:flex-start"><div><div class="label">Selected speed</div><div class="tt-big mono">${esc(label)}</div>
        <div class="hint mono">target ${fmtSec(nom)}</div></div><span class="spacer"></span>
        <button type="button" id="rec-go" class="${rec.on?"":"primary"}">${rec.on?"Stop listening":"Start listening"}</button></div>
      <div class="tt-stats">
        <div class="tt-stat"><div class="label">${S&&S.n>1?"Average":"Measured"}</div><div class="tt-v mono">${S?esc(fmtSec(S.avg).split(" · ")[0]):"—"}</div><div class="hint mono">${S?ms(S.avg)+" ms":""}</div></div>
        <div class="tt-stat"><div class="label">Off by</div><div class="tt-v mono dev-${d===null?"":devClass(d)}">${d===null?"—":fmtStops(d)}</div><div class="hint">${d===null?"":verdict(d)}</div></div>
        <div class="tt-stat"><div class="label">Spread</div><div class="tt-v mono ${S&&S.n>1?"dev-"+devClass(S.spread/2):""}">${S&&S.n>1?S.spread.toFixed(2)+" EV":"—"}</div><div class="hint mono">${S?`N ${S.n}${S.n>1?` · ${ms(S.min)}–${ms(S.max)} ms`:""}`:""}</div></div></div>
      ${rec.on?`<button type="button" id="rec-arm" class="big ${rec.live?"":"primary"}" style="margin-top:14px" ${rec.state==="listen"?"":"disabled"}>${rec.live?"Armed · tap to disarm":"Arm (space bar)"}</button>
        <div style="margin-top:12px"><strong id="rec-state" class="state"></strong>
        <div class="meter" aria-hidden="true"><div id="rec-bar" class="meter-bar"></div><div id="rec-thr" class="meter-thr"></div></div>
        <div class="hint" style="font-size:.8rem">Level, with the trigger line. The line should sit well above the bar while nothing happens.</div>
        <div class="hint mono" id="rec-diag" style="font-size:.75rem;margin-top:4px"></div>
        <p class="hint err" id="rec-warn" style="margin:6px 0 0" ${rec.diag?"":"hidden"}>${esc(rec.diag)}</p>
        <button type="button" id="rec-wake" class="small" style="margin-top:6px" hidden>Wake audio</button>
        <div class="grid2" style="margin-top:10px">
          ${rec.devs.length>1?`<label class="field"><span class="label">Input</span><select id="rec-dev">${rec.devs.map((x,i)=>`<option value="${esc(x.deviceId)}" ${x.deviceId===rec.devId?"selected":""}>${esc(x.label||"Input "+(i+1))}</option>`).join("")}</select></label>`:`<div class="field"><span class="label">Input</span><span>${esc(rec.devLabel||"Default microphone")}</span></div>`}
          <label class="field"><span class="label">Trigger</span><select id="rec-sens"><option value="3" ${rec.sens==3?"selected":""}>Sensitive (weak sensor signal)</option><option value="6" ${rec.sens==6?"selected":""}>Normal</option><option value="12" ${rec.sens==12?"selected":""}>Noisy room</option></select></label></div>
        ${rec.last?`<p class="hint" style="margin:10px 0 0">Last shot: <span class="mono">${esc(rec.last)}</span></p>`:""}</div>`
      :`<p class="hint" style="margin:12px 0 0">Press Start listening, set the dial to ${esc(label)} and fire. The page catches one shot per Arm and measures it. The speed stays selected until you pick another. Wind the camera before you arm, so the winding isn't caught.</p>`}
      ${rec.err?`<p class="hint err" style="margin:10px 0 0">${esc(rec.err)}</p>`:""}
      <div class="tt-trace">${S?.trace?`<canvas class="wave" style="width:100%;height:110px;display:block" aria-label="Latest shot with the measured start and end marked"></canvas><div class="hint mono" style="font-size:.75rem">Latest trace · ${traceCaption(S.trace.trace)}</div>`
        :`<div class="tt-empty hint">${S?"Entered by hand, no trace.":"The trace of the shot appears here."}</div>`}
        ${err?`<div class="hint err">${esc(err)}</div>`:""}${S?.last?.warn?`<div class="hint" style="color:var(--dof-yellow)">${esc(S.last.warn)}</div>`:""}</div>
      <div class="row" style="margin-top:12px"><label class="btn" for="m-file">Upload a recording</label>
        <input type="file" id="m-file" accept="audio/*,video/*,.wav,.m4a,.mp3,.aac,.ogg,.webm" hidden>
        <form class="row" style="gap:6px" id="m-msf"><span class="label">or add a time</span><input class="mono" style="width:7em" inputmode="decimal" id="m-ms" placeholder="ms" aria-label="Measured milliseconds for ${esc(label)}"><button type="submit" class="small">Add</button></form></div>
    </section>
    <section class="panel"><div class="row" style="align-items:baseline"><h2>Shots</h2><span class="spacer"></span>
        <div class="seg" role="group" aria-label="Show shots"><button type="button" data-hist="speed" aria-pressed="${st.hist!=="all"}">${esc(label)}</button><button type="button" data-hist="all" aria-pressed="${st.hist==="all"}">All speeds</button></div></div>
      ${hist.length?`<div class="shots">${hist.map(s=>`<div class="shot" data-shot="${esc(s.id)}">
          <div class="shot-1"><span class="mono shot-set">${esc(s.set)}</span><span class="mono">${esc(fmtSec(s.measured).split(" · ").pop())}</span>${dev(s.stops)}
            <span class="hint mono">${new Date(s.at).toLocaleString(undefined,{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit",second:"2-digit"})}</span>
            <span class="hint">${s.manual?"typed":s.mode==="light"?"sensor":"mic"}</span></div>
          <div class="shot-2"><input data-snote value="${esc(s.note||"")}" placeholder="Note on this shot" aria-label="Note on this shot">
            <button type="button" class="danger small" data-sdel>Delete</button></div></div>`).join("")}</div>`
        :`<p class="hint" style="margin:8px 0 0">No shots ${st.hist==="all"?"yet":"at "+esc(label)+" yet"}.</p>`}</section>
    <section class="panel"><h2>Summary</h2>
      <div class="spec-wrap" style="margin-top:8px"><table class="spec"><thead><tr><th>Set</th><th>Average</th><th>Off by</th><th>Spread</th><th>Min–max (ms)</th><th>N</th></tr></thead><tbody>
        ${speeds.map(([n,l])=>{const x=stats[l];return `<tr data-sel="${esc(l)}" class="${l===label?"on":""}"><th class="mono">${esc(l)}</th>${x?`<td class="mono">${esc(fmtSec(x.avg))}</td><td>${dev(x.stops)}</td><td class="mono">${x.n>1?x.spread.toFixed(2)+" EV":"—"}</td><td class="mono">${x.n>1?ms(x.min)+"–"+ms(x.max):ms(x.avg)}</td><td class="mono">${x.n}</td>`:`<td colspan="5" class="hint">—</td>`}</tr>`}).join("")}
      </tbody></table></div>
      <p class="hint" style="margin:8px 0 0;font-size:.8rem">±⅓ EV is fine for any film, up to ±⅔ EV is fine for negatives, more needs cleaning or adjustment. Plus means the shutter stays open too long.</p></section>
  </div></div>`;
  bind(v,{speeds,mine,label,nom,stats});
}
function bind(v,{speeds,mine,label,nom,stats}){
  const re=()=>render();
  const cv=v.querySelector(".tt-trace canvas");if(cv&&stats[label]?.trace)drawTrace(cv,stats[label].trace.trace);
  $("#m-model").onchange=e=>{st.model=e.target.value;rec.armed=null;errs={};saveSettings();re()};
  $("#m-hub").onchange=e=>{st.hubId=e.target.value.trim().toUpperCase();rec.armed=null;errs={};saveSettings();re()};
  v.querySelectorAll("[data-mode]").forEach(b=>b.onclick=()=>{
    st.mode=b.dataset.mode;errs={};saveSettings();
    for(const s of mine.filter(s=>shotAudio[s.id])){const a=analyse(shotAudio[s.id],st.mode,s.nominal);
      if(!a.error&&a.measured)Object.assign(s,{measured:+a.measured.toPrecision(5),stops:+stopsOff(a.measured,s.nominal).toFixed(3),mode:st.mode,trace:makeTrace(a),method:a.method,warn:a.warn||""})}
    saveShots();re()});
  v.querySelectorAll("[data-hist]").forEach(b=>b.onclick=()=>{st.hist=b.dataset.hist;saveSettings();re()});
  v.querySelectorAll("[data-sel]").forEach(b=>b.onclick=()=>{rec.armed=b.dataset.sel;re();if(b.classList.contains("tt-item")&&matchMedia("(max-width:800px)").matches)$("#m-rec")?.scrollIntoView({block:"start",behavior:"smooth"})});
  const lst=v.querySelector(".tt-list");lst.onkeydown=e=>{if(!["ArrowDown","ArrowUp"].includes(e.key))return;e.preventDefault();const i=speeds.findIndex(([n,l])=>l===label)+(e.key==="ArrowDown"?1:-1);if(speeds[i]){rec.armed=speeds[i][1];re();v.querySelector(".tt-item.on")?.focus()}};
  $("#m-note").oninput=e=>st.note=e.target.value;
  $("#m-test").onchange=e=>{st.withTest=e.target.checked;saveSettings()};
  $("#rec-go").onclick=async()=>{if(rec.on){recStop();re();return}audioCtx();if(await recStart())recArm();else re()};
  $("#rec-arm")&&($("#rec-arm").onclick=()=>recArm(!rec.live));
  $("#rec-dev")&&($("#rec-dev").onchange=async e=>{recStop();rec.devId=e.target.value;audioCtx();await recStart();re()});
  $("#rec-wake")&&($("#rec-wake").onclick=async()=>{try{await rec.ctx?.resume()}catch{}if(rec.on&&!rec.blocks){const id=rec.devId;recStop();rec.devId=id;audioCtx();await recStart();re()}});
  $("#rec-sens")&&($("#rec-sens").onchange=e=>{rec.sens=+e.target.value});
  if(rec.on)recMeter();
  const inp=$("#m-file");inp.onchange=async()=>{
    const f=inp.files[0];if(!f)return;errs[label]="Analysing…";re();
    try{const dec=await decodeRecording(f);const a=analyse(dec,st.mode,nom);
      if(a.error)errs[label]=a.error;else{delete errs[label];addShot(label,nom,{measured:a.measured,analysis:a,file:f.name,dec,warn:a.warn})}}
    catch{errs[label]="This file could not be read. Try WAV or M4A."}
    re()};
  $("#m-msf").onsubmit=e=>{e.preventDefault();const val=parseFloat($("#m-ms").value.replace(",","."));
    if(!(isFinite(val)&&val>0)){toast("Enter the time in milliseconds");return}
    delete errs[label];addShot(label,nom,{measured:val/1000,manual:true});re()};
  v.querySelectorAll("[data-shot]").forEach(row=>{const s=shots.find(x=>x.id===row.dataset.shot);if(!s)return;
    row.querySelector("[data-snote]").onchange=e=>{s.note=e.target.value.trim();saveShots()};
    const b=row.querySelector("[data-sdel]");b.onclick=()=>{if(b.dataset.armed!=="1"){b.dataset.armed="1";b.textContent="Tap again";return}shots=shots.filter(x=>x!==s);delete shotAudio[s.id];saveShots();re()}});
  const out=()=>JSON.stringify(buildExport(),null,1);
  $("#m-json").onclick=()=>{download(fileStem()+".json",out(),"application/json");toast("Saved. Import it in the Workbench Shutter Tester.")};
  $("#m-share")&&($("#m-share").onclick=()=>share(fileStem()+".json",out()));
  $("#m-csv").onclick=()=>download(fileStem()+"-shots.csv",csvOf([["Hub ID","Model","Time","Set","Target (ms)","Measured (ms)","Off by (EV)","Method","Typed","Note","File"],
    ...mine.map(s=>[st.hubId,st.model?modelName(st.model):"",s.at,s.set,ms(s.nominal),ms(s.measured),(+s.stops).toFixed(3),s.mode,s.manual?"yes":"",s.note||"",s.file||""])]),"text/csv");
  const cl=$("#m-clear");cl.onclick=()=>{if(cl.dataset.armed!=="1"){cl.dataset.armed="1";cl.textContent="Tap again to clear (save the file first)";return}
    const k=camKey();shots=shots.filter(s=>s.cam!==k);saveShots();errs={};rec.armed=null;toast("Shots cleared");re()};
}
document.addEventListener("keydown",e=>{
  if(e.code!=="Space"||!rec.on||rec.state!=="listen"||e.target.closest?.("input,select,textarea,button"))return;
  e.preventDefault();recArm(!rec.live);
});
document.addEventListener("visibilitychange",()=>{if(document.hidden&&rec.on){recStop();rec.err="Listening stopped because the page went to the background. Press Start again.";render()}});
render();
