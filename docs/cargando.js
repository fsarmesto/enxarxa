// Animación de carga de Vòlei EnXarxa (los 2 jugadores pasándose el balón), la misma que la app (docs/index.html), para las
// páginas aparte (acta, directo…). Se carga al principio del <body>: pone su estilo y su marcado y deja window.pepperLoader
// con show(texto) / hide() / done(). Si cambia la de la app, copiarla aquí.
(function(){
  var st=document.createElement('style');
  st.textContent='#pepper-loader{position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;\n  background:var(--bg,#F2F4F7);color:var(--ink-2,#4E5A6B);opacity:0;visibility:hidden;transition:opacity .25s ease,visibility 0s linear .25s;\n  padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)}\n#pepper-loader.on{opacity:1;visibility:visible;transition:opacity .25s ease}\n#pepper-loader svg{width:min(280px,72vw);max-height:60vh;height:auto;display:block}\n#pepper-loader p{margin:0;font-family:inherit;font-weight:500;font-size:14px;line-height:1.4;letter-spacing:.01em}\n@media (prefers-reduced-motion:reduce){#pepper-loader{transition:none}}';
  document.head.appendChild(st);
  var w=document.createElement('div');
  w.innerHTML='<div id="pepper-loader" role="status" aria-live="polite">\n  <svg viewBox="40 -14 340 204" aria-hidden="true">  <!-- la colocación sube la pelota hasta y≈-9 -->\n    <line x1="40" y1="182" x2="380" y2="182" stroke="currentColor" stroke-opacity=".25" stroke-width="1"/>\n    <g stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none">\n      <circle cx="100" cy="112" r="9" fill="currentColor" stroke="none"/>\n      <line x1="100" y1="122" x2="100" y2="152"/>\n      <line x1="100" y1="152" x2="92" y2="180"/><line x1="100" y1="152" x2="108" y2="180"/>\n      <polyline data-arm="A1" points="100,128 110,134 118,142"/><polyline data-arm="A2" points="100,128 108,136 114,146"/>\n    </g>\n    <g stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none">\n      <circle cx="320" cy="112" r="9" fill="currentColor" stroke="none"/>\n      <line x1="320" y1="122" x2="320" y2="152"/>\n      <line x1="320" y1="152" x2="312" y2="180"/><line x1="320" y1="152" x2="328" y2="180"/>\n      <polyline data-arm="B1" points="320,128 310,134 302,142"/><polyline data-arm="B2" points="320,128 312,136 306,146"/>\n    </g>\n    <circle data-ball cx="119" cy="131" r="7" fill="#EF9F27" stroke="#854F0B" stroke-width="1"/>\n  </svg>\n  <p data-text></p>\n</div>';
  document.body.insertBefore(w.firstElementChild, document.body.firstChild);
})();
(function(){
  'use strict';
  var root=document.getElementById('pepper-loader'); if(!root) return;
  var q=function(s){return root.querySelector(s);};
  var ball=q('[data-ball]'), label=q('[data-text]');
  var DEFAULT_TEXT='Cargando…';   /* translateNode lo pasa a catalán */
  var SHOW_DELAY=400, MIN_VISIBLE=500, SAFETY=20000;
  var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Animación ---------- */
  var R=Math.PI/180, LU=12, LF=12;
  var mk=function(a1,a2,base,dir){return{e1:q('[data-arm="'+a1+'"]'),e2:q('[data-arm="'+a2+'"]'),base:base,dir:dir,h:{u:65,f:75},o:{u:85,f:95}};};
  var A=mk('A1','A2',100,1), B=mk('B1','B2',320,-1);
  var P={rest:{u:65,f:75},restO:{u:85,f:95},dig:{u:35,f:35},digO:{u:40,f:40},
    set:{u:-45,f:-100},setO:{u:-50,f:-105},load:{u:-30,f:-112},loadO:{u:-34,f:-116},push:{u:-68,f:-86},pushO:{u:-72,f:-90},
    bow:{u:-160,f:-100},aim:{u:-62,f:-62},tuck:{u:95,f:60},contact:{u:-70,f:-70},follow:{u:70,f:80}};
  var ease=function(x){return x<=0?0:x>=1?1:x*x*(3-2*x);};
  var mix=function(a,b,t){t=ease(t);return{u:a.u+(b.u-a.u)*t,f:a.f+(b.f-a.f)*t};};
  var seq=function(t,ks){if(t<=ks[0][0])return ks[0][1];for(var k=1;k<ks.length;k++){if(t<ks[k][0])return mix(ks[k-1][1],ks[k][1],(t-ks[k-1][0])/(ks[k][0]-ks[k-1][0]));}return ks[ks.length-1][1];};
  function arm(el,p,a){var sx=p.base,sy=128,ex=sx+p.dir*LU*Math.cos(a.u*R),ey=sy+LU*Math.sin(a.u*R),hx=ex+p.dir*LF*Math.cos(a.f*R),hy=ey+LF*Math.sin(a.f*R);
    el.setAttribute('points',sx+','+sy+' '+ex.toFixed(1)+','+ey.toFixed(1)+' '+hx.toFixed(1)+','+hy.toFixed(1));}
  function draw(p){arm(p.e1,p,p.h);arm(p.e2,p,p.o);}
  var steps=[{k:'dig',h:75,d:760},{k:'set',h:110,d:1100},{k:'hit',h:10,d:380}];
  var DIGX=19, DIGY=131;
  var i=0, from=A, to=B, t0=0, raf=0;
  function pts(s){
    if(s.k==='dig')return[{x:from.base+from.dir*DIGX,y:DIGY},{x:to.base+to.dir*6,y:111}];
    if(s.k==='set')return[{x:from.base+from.dir*6,y:111},{x:to.base+to.dir*8,y:105}];
    return[{x:from.base+from.dir*8,y:105},{x:to.base+to.dir*DIGX,y:DIGY}];
  }
  function frame(now){
    if(!t0) t0=now;
    var s=steps[i%3], u=Math.min(1,(now-t0)/s.d), p=pts(s), p0=p[0], p1=p[1];
    ball.setAttribute('cx',(p0.x+(p1.x-p0.x)*u).toFixed(1));
    ball.setAttribute('cy',(p0.y+(p1.y-p0.y)*u-s.h*4*u*(1-u)).toFixed(1));
    if(s.k==='dig'){from.h=P.dig;from.o=P.digO;
      to.h=seq(u,[[0,P.rest],[0.55,P.set],[0.85,P.set],[1,P.load]]);
      to.o=seq(u,[[0,P.restO],[0.55,P.setO],[0.85,P.setO],[1,P.loadO]]);}
    if(s.k==='set'){from.h=seq(u,[[0,P.load],[0.12,P.push],[0.25,P.push],[0.6,P.rest]]);
      from.o=seq(u,[[0,P.loadO],[0.12,P.pushO],[0.25,P.pushO],[0.6,P.restO]]);
      to.o=seq(u,[[0.3,P.restO],[0.62,P.aim],[0.78,P.aim],[0.94,P.tuck]]);
      to.h=seq(u,[[0.3,P.rest],[0.66,P.bow],[0.86,P.bow],[1,P.contact]]);}
    if(s.k==='hit'){from.h=seq(u,[[0,P.contact],[0.6,P.follow]]);from.o=seq(u,[[0,P.tuck],[0.8,P.restO]]);
      to.h=mix(P.rest,P.dig,u*2);to.o=mix(P.restO,P.digO,u*2);}
    draw(A);draw(B);
    if(u>=1){i++;var t=from;from=to;to=t;t0=now;}
    raf=requestAnimationFrame(frame);
  }
  function reset(){i=0;from=A;to=B;t0=0;A.h=P.dig;A.o=P.digO;B.h=P.rest;B.o=P.restO;draw(A);draw(B);
    ball.setAttribute('cx',A.base+DIGX);ball.setAttribute('cy',DIGY);}
  function start(){reset();if(!reduce&&!raf)raf=requestAnimationFrame(frame);}
  function stop(){if(raf)cancelAnimationFrame(raf);raf=0;}

  /* ---------- Mostrar / ocultar ---------- */
  var pending=0, showTimer=0, hideTimer=0, safety=0, shownAt=0, visible=false;
  function reallyShow(){visible=true;shownAt=Date.now();start();root.classList.add('on');}
  function reallyHide(){visible=false;root.classList.remove('on');setTimeout(function(){if(!visible)stop();},300);}
  function show(text){
    label.textContent=text||DEFAULT_TEXT; pending++;
    clearTimeout(hideTimer); clearTimeout(safety); safety=setTimeout(function(){pending=0;finish();},SAFETY);
    if(!visible&&!showTimer) showTimer=setTimeout(function(){showTimer=0;if(pending>0)reallyShow();},SHOW_DELAY);
  }
  function finish(){
    clearTimeout(showTimer); showTimer=0; clearTimeout(safety);
    if(!visible) return;
    var wait=Math.max(0,MIN_VISIBLE-(Date.now()-shownAt));
    clearTimeout(hideTimer); hideTimer=setTimeout(reallyHide,wait);
  }
  function hide(){ if(pending>0) pending--; if(pending===0) finish(); }

  window.pepperLoader={show:show,hide:hide,done:hide};
  /* las páginas llaman a pepperLoader.show() al arrancar y a pepperLoader.done() cuando están listas */
})();
