import { CARS } from "./cars";

// Markup and styles for the Highway Rush 3D overlay. Everything is scoped under .hr3d.

const FONTS_ID = "hr3d-fonts";
export function ensureFonts() {
  if (document.getElementById(FONTS_ID)) return;
  const link = document.createElement("link");
  link.id = FONTS_ID;
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=DM+Sans:wght@400;500;700&display=swap";
  document.head.appendChild(link);
}

export const CSS = `
.hr3d{--navy:#0E1222;--panel:rgba(14,18,34,.74);--lime:#C6F432;--orange:#FF8A3D;--muted:rgba(255,255,255,.66);
  --head:"Bricolage Grotesque","DM Sans",system-ui,sans-serif;--body:"DM Sans",system-ui,-apple-system,sans-serif;
  --sl:env(safe-area-inset-left,0px);--sr:env(safe-area-inset-right,0px);--sb:env(safe-area-inset-bottom,0px);
  position:absolute;inset:0;overflow:hidden;isolation:isolate;container-type:size;color:#fff;font-family:var(--body);
  background:#0E1222;user-select:none;-webkit-user-select:none;touch-action:none;-webkit-tap-highlight-color:transparent}
.hr3d *{box-sizing:border-box}
.hr3d>canvas:first-child{position:absolute;inset:0;width:100%;height:100%;display:block}
.hr3d button{font-family:inherit}
.hr3d .panel{background:var(--panel);border:1px solid rgba(255,255,255,.08);border-radius:16px;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.hr3d .hud{position:absolute;pointer-events:none;opacity:0;transition:opacity .3s}
.hr3d.playing .hud{opacity:1}
.hr3d .lbl{font-size:11px;letter-spacing:.14em;font-weight:700;color:var(--muted);text-transform:uppercase}
.hr3d .num{font-family:var(--head);font-weight:800;font-variant-numeric:tabular-nums}
.hr3d #score{top:52px;left:calc(14px + var(--sl));padding:8px 16px 10px;min-width:120px}
.hr3d #scoreVal{font-size:34px;line-height:1.05}
.hr3d #dmg{display:flex;align-items:center;gap:6px;margin-top:6px}
.hr3d #dmg .lbl{font-size:10px}
.hr3d #dmg i{width:16px;height:7px;border-radius:3px;background:#5df08a;display:block;transition:background .2s}
.hr3d #dmg i.lost{background:rgba(255,255,255,.16)}
.hr3d #dmg.warn i:not(.lost){background:#ff5a3d}
.hr3d #minimap{top:78px;right:calc(14px + var(--sr));width:150px;height:150px;padding:6px;display:none}
.hr3d #navHint{top:14px;left:50%;transform:translateX(-50%);padding:8px 18px;font-family:var(--head);font-weight:800;font-size:18px;white-space:nowrap;display:none;text-align:center}
.hr3d #navHint small{display:block;font-family:var(--body);font-weight:500;font-size:11px;letter-spacing:.1em;color:var(--muted);text-transform:uppercase}
.hr3d #navHint b{color:var(--lime)}
.hr3d.dest #minimap,.hr3d.dest #navHint{display:block}
.hr3d.dest #setup .optrow:last-child{opacity:.4;pointer-events:none}
.hr3d #fade{position:absolute;inset:0;background:#000;opacity:0;pointer-events:none;z-index:4;transition:opacity .16s linear}
.hr3d #fade.slow{transition:opacity .5s ease-out}
.hr3d #banner{position:absolute;left:50%;top:36%;transform:translate(-50%,-50%) scale(.92);text-align:center;pointer-events:none;opacity:0;transition:opacity .35s,transform .35s;z-index:3;text-shadow:0 3px 18px rgba(0,0,0,.65)}
.hr3d #banner.show{opacity:1;transform:translate(-50%,-50%) scale(1)}
.hr3d #banner .t{font-family:var(--head);font-weight:800;font-size:46px;color:var(--lime);line-height:1.05}
.hr3d #banner .s{margin-top:6px;font-size:18px;font-weight:700}
.hr3d #mapPreview{display:none;margin:0 auto 12px;width:150px;height:150px;background:rgba(255,255,255,.05);border-radius:14px}
.hr3d.dest #mapPreview{display:block}
.hr3d #destLine{display:none;color:var(--muted);font-size:13px;margin:-4px 0 10px}
.hr3d #destLine b{color:var(--orange)}
.hr3d.dest #destLine{display:block}
.hr3d #chip{display:none;margin-top:4px;font-family:var(--head);font-weight:800;font-size:12px;letter-spacing:.06em;background:var(--lime);color:var(--navy);border-radius:8px;padding:2px 8px;width:max-content}
.hr3d #chip.on{display:block}
.hr3d #topRight{top:14px;right:calc(14px + var(--sr));display:flex;gap:10px;align-items:stretch}
.hr3d #nitroBox{padding:8px 14px 10px;width:170px}
.hr3d #nitroBar{height:10px;border-radius:6px;background:rgba(255,255,255,.12);margin-top:6px;overflow:hidden}
.hr3d #nitroFill{height:100%;width:100%;background:var(--orange);border-radius:6px}
.hr3d #nitroFill.low{background:#ff5a3d}
.hr3d #mute{pointer-events:auto;width:48px;border:0;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0}
.hr3d #mute svg{width:24px;height:24px}
.hr3d #speedo{left:50%;transform:translateX(-50%);bottom:calc(14px + var(--sb));padding:8px 22px 12px;text-align:center;min-width:190px}
.hr3d #kmh{font-size:60px;line-height:1}
.hr3d #kmhUnit{font-size:12px;letter-spacing:.14em;color:var(--muted);font-weight:700;margin-left:6px}
.hr3d #gearRow{display:flex;align-items:center;justify-content:center;gap:10px;margin-top:4px}
.hr3d #gear{font-family:var(--head);font-weight:800;font-size:15px;background:var(--lime);color:var(--navy);border-radius:8px;padding:1px 9px}
.hr3d #rpmBar{height:6px;border-radius:4px;background:rgba(255,255,255,.12);overflow:hidden;width:92px}
.hr3d #rpmFill{height:100%;width:30%;background:#fff;border-radius:4px}
.hr3d #toast{position:absolute;left:50%;top:26%;transform:translate(-50%,0);font-family:var(--head);font-weight:800;font-size:28px;color:var(--lime);text-shadow:0 2px 10px rgba(0,0,0,.6);pointer-events:none;opacity:0;white-space:nowrap}
.hr3d #toast.show{animation:hr3d-pop 1.1s ease-out forwards}
@keyframes hr3d-pop{0%{opacity:0;transform:translate(-50%,16px) scale(.8)}15%{opacity:1;transform:translate(-50%,0) scale(1.08)}30%{transform:translate(-50%,0) scale(1)}80%{opacity:1}100%{opacity:0;transform:translate(-50%,-34px) scale(1)}}
.hr3d #flash{position:absolute;inset:0;pointer-events:none;opacity:0;z-index:3;background:radial-gradient(ellipse at center,rgba(255,40,20,0) 35%,rgba(255,40,20,.55) 100%)}
.hr3d #flash.hit{animation:hr3d-flash .7s ease-out}
@keyframes hr3d-flash{0%{opacity:1}100%{opacity:0}}
.hr3d #speedfx{position:absolute;inset:-10%;pointer-events:none;opacity:0;z-index:2;mix-blend-mode:screen;
  background:repeating-conic-gradient(from 0deg at 50% 52%,rgba(255,255,255,0) 0deg 3deg,rgba(255,255,255,.22) 3.3deg 3.6deg,rgba(255,255,255,0) 4deg 7deg);
  -webkit-mask-image:radial-gradient(ellipse at 50% 52%,transparent 38%,#000 85%);mask-image:radial-gradient(ellipse at 50% 52%,transparent 38%,#000 85%)}
.hr3d .pad{position:absolute;bottom:calc(14px + var(--sb));display:none;gap:12px;align-items:flex-end}
.hr3d.touch.playing .pad{display:flex}
.hr3d #padL{left:calc(14px + var(--sl))}
.hr3d #padR{right:calc(14px + var(--sr))}
.hr3d .tbtn{width:78px;height:78px;border-radius:50%;border:2px solid rgba(255,255,255,.35);background:rgba(14,18,34,.62);color:#fff;font-family:var(--head);font-weight:800;font-size:13px;letter-spacing:.06em;display:flex;align-items:center;justify-content:center;touch-action:none;padding:0;cursor:pointer;transition:transform .06s,background .06s}
.hr3d .tbtn svg{width:34px;height:34px}
.hr3d .tbtn.on{transform:scale(.93);background:rgba(255,255,255,.28)}
.hr3d #bNitro{width:104px;height:104px;background:var(--orange);border-color:rgba(255,255,255,.7);color:var(--navy);font-size:16px}
.hr3d #bNitro.on{background:#ffb27a}

.hr3d .overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:16px;background:radial-gradient(ellipse at center,rgba(14,18,34,.35),rgba(14,18,34,.82));z-index:5}
.hr3d .overlay.hidden{display:none}
.hr3d .card{background:var(--navy);border:1px solid rgba(255,255,255,.1);border-radius:24px;padding:24px 28px;max-width:440px;width:100%;max-height:100%;overflow:auto;text-align:center;box-shadow:0 24px 70px rgba(0,0,0,.5)}
.hr3d h1,.hr3d h2{font-family:var(--head);font-weight:800;margin:0;letter-spacing:-.01em}
.hr3d h1{font-size:44px;line-height:1}
.hr3d h1 span{color:var(--lime)}
.hr3d .sub{color:var(--muted);margin:10px 0 14px;line-height:1.5;font-size:15px}
.hr3d .keys{display:grid;grid-template-columns:auto 1fr;gap:5px 14px;text-align:left;font-size:13px;color:var(--muted);margin:0 auto 14px;max-width:320px}
.hr3d .keys b{color:#fff;font-weight:700}
.hr3d .opts{display:grid;gap:8px;margin:0 auto 16px;max-width:340px}
.hr3d .optrow{display:flex;align-items:center;justify-content:space-between;gap:12px}
.hr3d .seg{display:flex;flex-wrap:wrap;justify-content:flex-end;background:rgba(255,255,255,.08);border-radius:10px;padding:3px;gap:2px}
.hr3d .seg button{border:0;background:transparent;color:var(--muted);font-weight:700;font-size:13px;padding:6px 12px;border-radius:8px;cursor:pointer;touch-action:manipulation}
.hr3d .seg button.on{background:var(--lime);color:var(--navy)}
.hr3d .row{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
.hr3d .btn{display:inline-block;border:0;cursor:pointer;background:var(--lime);color:var(--navy);font-family:var(--head);font-weight:800;font-size:19px;padding:13px 28px;border-radius:14px;touch-action:manipulation}
.hr3d .btn2{border:1.5px solid rgba(255,255,255,.28);background:transparent;color:#fff;font-family:var(--head);font-weight:800;font-size:16px;padding:12px 18px;border-radius:14px;cursor:pointer;touch-action:manipulation}
.hr3d .btn2 b{color:var(--lime)}

.hr3d #summary{color:var(--muted);font-size:13px;margin:10px 0 16px;letter-spacing:.02em}
.hr3d #summary b{color:#fff;font-weight:700}
.hr3d #setup{position:absolute;left:0;right:0;bottom:0;z-index:5;display:none;flex-direction:column;align-items:center;gap:10px;padding:40px 14px calc(14px + var(--sb));background:linear-gradient(to top,rgba(14,18,34,.94) 60%,rgba(14,18,34,0))}
.hr3d.setup #setup{display:flex}
.hr3d #setup .opts{width:100%;max-width:560px;margin:0 auto}
.hr3d #setup .optrow{align-items:center}
.hr3d #garage{position:absolute;left:0;right:0;bottom:0;z-index:5;display:none;flex-direction:column;align-items:center;gap:10px;padding:40px 14px calc(14px + var(--sb));background:linear-gradient(to top,rgba(14,18,34,.92) 55%,rgba(14,18,34,0))}
.hr3d.garage #garage{display:flex}
.hr3d .gtitle{font-family:var(--head);font-weight:800;font-size:26px}
.hr3d .gcars{display:flex;gap:10px;justify-content:center;width:100%}
.hr3d .gcar{flex:1;max-width:220px;text-align:left;border:2px solid rgba(255,255,255,.14);background:var(--panel);color:#fff;border-radius:16px;padding:10px 12px;cursor:pointer;touch-action:manipulation}
.hr3d .gcar.on{border-color:var(--lime);background:rgba(198,244,50,.1)}
.hr3d .gname{font-family:var(--head);font-weight:800;font-size:19px}
.hr3d .gsub{font-size:12px;color:var(--muted);margin-bottom:6px}
.hr3d .gstat{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--muted);margin-top:3px}
.hr3d .gstat .l{width:56px}
.hr3d .pips{display:flex;gap:3px}
.hr3d .pip{width:14px;height:6px;border-radius:3px;background:rgba(255,255,255,.16)}
.hr3d .pip.f{background:var(--orange)}

.hr3d.nogl #nogl{display:flex}
.hr3d #nogl{display:none;position:absolute;inset:0;align-items:center;justify-content:center;padding:16px;z-index:6;background:var(--navy)}

@container (max-width:999px) or (max-height:560px){
  .hr3d #minimap{width:112px;height:112px;top:70px} .hr3d #navHint{font-size:15px;padding:6px 14px} .hr3d #banner .t{font-size:34px} .hr3d #banner .s{font-size:15px}
  .hr3d #mapPreview{width:112px;height:112px;margin-bottom:8px}
  .hr3d #scoreVal{font-size:26px} .hr3d #score{padding:6px 12px 8px;min-width:96px}
  .hr3d #kmh{font-size:44px} .hr3d #speedo{padding:4px 16px 8px;min-width:150px}
  .hr3d #nitroBox{width:140px;padding:6px 12px 8px}
  .hr3d .tbtn{width:62px;height:62px} .hr3d #bNitro{width:84px;height:84px} .hr3d .tbtn svg{width:28px;height:28px}
  .hr3d h1{font-size:34px} .hr3d .card{padding:16px 22px} .hr3d .sub{margin:8px 0 10px;font-size:14px}
  .hr3d .keys{margin-bottom:10px;font-size:12px;gap:3px 12px} .hr3d .opts{margin-bottom:12px;gap:6px}
  .hr3d .btn{font-size:17px;padding:11px 24px} .hr3d .btn2{font-size:15px;padding:10px 14px}
  .hr3d #toast{font-size:22px}
  .hr3d .gcar{padding:8px 10px} .hr3d .gname{font-size:16px}
  .hr3d .seg button{padding:5px 10px}
}
@container (max-height:470px){
  .hr3d #mapPreview{display:none!important}
  .hr3d .sub,.hr3d .keys{display:none}
  .hr3d .card{padding:12px 18px} .hr3d h1{font-size:30px} .hr3d .opts{margin:10px auto}
  .hr3d .seg button{padding:4px 10px;font-size:12px}
  .hr3d .gsub{display:none} .hr3d .gtitle{font-size:20px} .hr3d #garage,.hr3d #setup{padding-top:20px;gap:6px}
  .hr3d #summary{margin:6px 0 10px}
  .hr3d .optrow .lbl{font-size:10px}
}
@container (max-width:640px) or (max-height:360px){
  .hr3d #minimap{width:84px;height:84px;top:60px;padding:3px} .hr3d #navHint{top:52px;font-size:13px;padding:4px 10px} .hr3d #navHint small{display:none}
  .hr3d #banner .t{font-size:24px} .hr3d #banner .s{font-size:12px}
  .hr3d #scoreVal{font-size:20px} .hr3d #score{top:46px;padding:4px 10px 6px;min-width:80px}
  .hr3d #kmh{font-size:30px} .hr3d #speedo{bottom:auto;top:10px;min-width:0;padding:3px 12px 6px}
  .hr3d #rpmBar{display:none} .hr3d #gear{font-size:12px}
  .hr3d #nitroBox{width:110px;padding:4px 10px 7px} .hr3d #mute{width:38px}
  .hr3d .tbtn{width:50px;height:50px} .hr3d #bNitro{width:68px;height:68px} .hr3d .tbtn svg{width:24px;height:24px}
  .hr3d .pad{gap:8px} .hr3d .tbtn{font-size:11px}
  .hr3d h1{font-size:24px} .hr3d .card{padding:10px 14px}
  .hr3d .btn{font-size:15px;padding:9px 20px} .hr3d .btn2{font-size:13px;padding:8px 12px}
  .hr3d .gstat{font-size:10px} .hr3d .gstat .l{width:46px} .hr3d .pip{width:10px}
}
`;

const pips = (n: number) => Array.from({ length: 5 }, (_, i) => `<span class="pip${i < n ? " f" : ""}"></span>`).join("");
const stat = (label: string, n: number) => `<div class="gstat"><span class="l">${label}</span><span class="pips">${pips(n)}</span></div>`;
const seg = (opt: string, choices: [string, string][]) =>
  `<div class="seg" data-opt="${opt}">${choices.map(([v, label]) => `<button type="button" data-v="${v}">${label}</button>`).join("")}</div>`;

export const HTML = `
<div id="score" class="hud panel"><div class="lbl">Score</div><div id="scoreVal" class="num">0</div><div id="dmg"><span class="lbl">Car</span><i></i><i></i><i></i></div><div id="chip">&times;2 ONCOMING</div></div>
<div id="topRight" class="hud">
  <div id="nitroBox" class="panel"><div class="lbl">Nitro</div><div id="nitroBar"><div id="nitroFill"></div></div></div>
  <button id="mute" class="panel" aria-label="Mute sound" type="button">
    <svg id="icoOn" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z" fill="#fff"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>
    <svg id="icoOff" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none"><path d="M11 5 6 9H3v6h3l5 4z" fill="#fff"/><path d="m16 9 6 6M22 9l-6 6"/></svg>
  </button>
</div>
<div id="speedo" class="hud panel">
  <div><span id="kmh" class="num">0</span><span id="kmhUnit">KM/H</span></div>
  <div id="gearRow"><span id="gear">GEAR 1</span><div id="rpmBar"><div id="rpmFill"></div></div></div>
</div>
<div id="toast">Close call +50</div>
<canvas id="minimap" class="hud panel" width="260" height="260"></canvas>
<div id="navHint" class="hud panel"></div>
<div id="banner"><div class="t"></div><div class="s"></div></div>
<div id="fade"></div>
<div id="speedfx"></div>
<div id="flash"></div>
<div id="padL" class="pad">
  <button id="bLeft" class="tbtn" aria-label="Steer left" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m15 5-7 7 7 7"/></svg></button>
  <button id="bRight" class="tbtn" aria-label="Steer right" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m9 5 7 7-7 7"/></svg></button>
</div>
<div id="padR" class="pad">
  <button id="bBrake" class="tbtn" type="button">BRAKE</button>
  <button id="bNitro" class="tbtn" type="button">NITRO</button>
</div>

<div id="start" class="overlay">
  <div class="card">
    <h1>Highway Rush <span>3D</span></h1>
    <p class="sub">Weave through traffic on an endless highway. Survive as long as you can &mdash; every crash ends the run.</p>
    <div class="keys">
      <b>&larr; &rarr; / A D</b><span>Steer</span>
      <b>&uarr; / W</b><span>Nitro boost</span>
      <b>&darr; / S</b><span>Brake</span>
      <b>Close calls</b><span>+50 points</span>
    </div>
    <div id="summary"></div>
    <canvas id="mapPreview" width="300" height="300"></canvas>
    <div id="destLine"></div>
    <div class="row">
      <button id="setupBtn" class="btn2" type="button">Setup</button>
      <button id="garageBtn" class="btn2" type="button">Garage &middot; <b id="carName">Sprint</b></button>
      <button id="startBtn" class="btn" type="button">Start engine</button>
    </div>
  </div>
</div>

<div id="setup">
  <div class="gtitle">Setup</div>
  <div class="opts">
    <div class="optrow"><span class="lbl">Mode</span>${seg("mode", [["free", "Free drive"], ["destination", "Destination"]])}</div>
    <div class="optrow"><span class="lbl">Time</span>${seg("time", [["day", "Day"], ["sunset", "Sunset"], ["night", "Night"]])}</div>
    <div class="optrow"><span class="lbl">Weather</span>${seg("weather", [["clear", "Clear"], ["rain", "Rain"], ["fog", "Fog"], ["dust", "Dust storm"]])}</div>
    <div class="optrow"><span class="lbl">Location</span>${seg("place", [["highway", "Highway"], ["india", "India"], ["mountain", "Mountain"], ["desert", "Desert"], ["city", "City"]])}</div>
    <div class="optrow"><span class="lbl">Traffic</span>${seg("twoWay", [["0", "One-way"], ["1", "Two-way"]])}</div>
  </div>
  <button id="setupDone" class="btn" type="button">Done</button>
</div>

<div id="garage">
  <div class="gtitle">Garage</div>
  <div class="gcars">
    ${CARS.map(
      (c, i) => `<button type="button" class="gcar" data-car="${i}"><div class="gname">${c.name}</div><div class="gsub">${c.blurb}</div>${stat("Speed", c.bars[0])}${stat("Handling", c.bars[1])}${stat("Nitro", c.bars[2])}</button>`
    ).join("")}
  </div>
  <button id="garageDone" class="btn" type="button">Done</button>
</div>

<div id="nogl"><div class="card"><h2 style="font-size:26px">3D isn&rsquo;t available</h2><p class="sub">Your browser can&rsquo;t run WebGL, which this game needs. Try a recent Chrome, Safari, Firefox or Edge, and make sure hardware acceleration is on.</p></div></div>
`;
