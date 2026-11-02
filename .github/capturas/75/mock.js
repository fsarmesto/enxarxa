window.supabase = { createClient(){
  const d=(n)=>{ const x=new Date(); x.setDate(x.getDate()+n); return x.toISOString().slice(0,10); };
  const M = (n,dd,t,comp,teams,venue,addr,role,extra={}) => ({ id:'DEMO'+n, comp, phase:'', teams, estado:'', date:d(dd), time:t, venue, addr, venue_key:venue.toLowerCase(), cat:null, team:'t1', role,
    tolls:0, holiday:false, no_dieta:null, paid:false, not_received:false, km_override:null, dieta_override:null, fcvb_tarifa:null, fcvb_gastos:null, fcvb_pago:null, fcvb_limite:null, fcvb_accion:null,
    id_partido:'900'+n, res_l:null, res_v:null, acta_url:null, crew:[{f:'r1',n:'ÁRBITRO DEMO',me:true},{f:'r2',n:'COMPAÑERO DEMO'}], ...extra });
  const matches=[ M(1,1,'18:00','PRIMERA DIVISION SENIOR MASCULINO','CV DEMO A - CE DEMO B','PAVELLO DE PROVA','CARRER DEMO 1, 08001 BARCELONA','r1'),
    M(2,2,'12:00','SEGONA DIVISIO SENIOR FEMENINO','UE EXEMPLE - CV PROVA','PAVELLO DEMO SUD','CARRER EXEMPLE 7, 08201 SABADELL','r2'),
    M(3,-1,'17:00','CADET MASCULI','CV PROVA - CV DEMO C','PAVELLO DE PROVA','CARRER DEMO 1, 08001 BARCELONA','r1',{res_l:3,res_v:1}),
    M(4,-2,'19:00','JUNIOR FEMENI','CB DEMO D - AE DEMO E','PAVELLO DEMO SUD','CARRER EXEMPLE 7, 08201 SABADELL','r1',{paid:true,fcvb_tarifa:30,fcvb_gastos:14,fcvb_pago:'PAGADO - 20/10/2026',res_l:3,res_v:0,acta_url:'https://voleibol.isquad.es/x'}),
    M(5,-8,'11:00','CADET FEMENI','CV DEMO F - UE PROVA','PAVELLO DE PROVA','CARRER DEMO 1, 08001 BARCELONA','r2',{paid:true,fcvb_tarifa:28,fcvb_gastos:10,fcvb_pago:'PAGADO - 14/10/2026',res_l:3,res_v:2}) ];
  const venues=[{venue_key:'pavello de prova',label:'PAVELLO DE PROVA',km:12,km_source:'manual'},{venue_key:'pavello demo sud',label:'PAVELLÓ DEMO SUD',km:30,km_source:'manual'}];
  const profile={ user_id:'u-demo', isquad_login:'demo@example.com', nombre:'ÁRBITRO DEMO', origin:'Barcelona', rate:'0.26', min_travel:'4', irpf:'2', tipo:'arbitro', last_sync:new Date().toISOString(), last_error:null, policy_version:'2026-10-22.2', consent_at:new Date().toISOString(), cal_token:'x' };
  const q = (table) => { const o={ select(){return o}, order(){return o}, eq(){return o}, in(){return o}, update(){return o}, upsert(){return o}, insert(){return o}, delete(){return o}, filter(){return o},
    range(){ return Promise.resolve({data: table==='matches'?matches:[], error:null}) },
    single(){ return Promise.resolve({data: table==='profiles'?profile:null, error:null}) },
    then(a,b){ return Promise.resolve({data: table==='venues'?venues:[], error:null}).then(a,b) } }; return o; };
  const f0=window.fetch; window.fetch=(u,o)=>{ if(String(u).includes('/functions/v1/equipos')){
    const mk=(id,dd,t,l,v,est,rl,rv)=>({d:d(dd),t,conf:true,est,l,v,rl,rv,idl:id,idv:99,comp:'DEMO'});
    const cal={11:[mk(11,-6,'18:00','CV DEMO A','CE DEMO B','Finalizado',3,1),mk(11,5,'18:30','CE DEMO C','CV DEMO A','Pendiente',null,null)], 12:[mk(98,-3,'12:00','UE PROVA','CV DEMO G','Finalizado',2,3),mk(12,4,'12:00','CV DEMO G','CB EXEMPLE','Pendiente',null,null)]};
    return Promise.resolve(new Response(JSON.stringify({favs:[{id_equipo:11,club_id:1,team:'CV DEMO A',cat:'PRIMERA DIVISION SENIOR',club:'CV DEMO',rol:'jugador',activo:true},{id_equipo:12,club_id:2,team:'CV DEMO G',cat:'CADET',club:'CV DEMO',rol:'entrenador',activo:true}],partidos:[],calendario:cal}),{status:200,headers:{'Content-Type':'application/json'}})); } return f0(u,o); };
  return { from:q, rpc(){ return Promise.resolve({data:null,error:null}) }, functions:{invoke(){return Promise.resolve({data:{},error:null})}},
    auth:{ getSession(){ return Promise.resolve({data:{session: window.__NOSESSION?null:{access_token:'t',user:{id:'u-demo'}}}}) }, onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}}}, signOut(){ return Promise.resolve({}) }, verifyOtp(){ return Promise.resolve({}) } } };
} };
// Opciones por el hash: #vista=agenda|equipos|cobros, #salir (pantalla de entrar), #stat (abre las cifras), #scroll, #ajustes
(function(){ const h=location.hash.slice(1).split('&'); const v=(h.find(x=>x.startsWith('vista='))||'').slice(6);
  localStorage.setItem('liq-guia-vista','1'); localStorage.setItem('liq-lang','es'); if(v) localStorage.setItem('liq-vista',v); if(h.includes('salir')) window.__NOSESSION=true;
  if(h.includes('scroll')) document.write('<style>.minibar{transition:none!important}</style>');
  if(h.includes('limpio')) document.write('<style>#pushCard,#alerts,#banner,#newVer{display:none!important}</style>');
  addEventListener('load',()=>setTimeout(()=>{ const c=s=>document.querySelector(s)?.click();
    if(h.includes('stat')) c('#statLine'); if(h.includes('ajustes')) c('#btnAjustes');
    if(h.includes('scroll')) setTimeout(()=>{ scrollTo(0,520); dispatchEvent(new Event('scroll')); },300); },1500)); })();
