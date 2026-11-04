// Partido de prueba COMPLETO e inventado (Equipo F - Equipo S) a 5 sets, con todo lo que la app sabe anotar.
// Uso: node tools/pruebas-navegador/demo-completo.mjs (ANEXO=1 añade una observación larga que pasa a la hoja anexa).
// Deja: OUT/acta-demo.json (para "Importar un acta (JSON)"), OUT/acta-demo.pdf y capturas de la app.
import fs from 'node:fs'; import path from 'node:path';
import { go, ev, click, size, check, resumen, fin, errores, sleep, cdp, shot } from './base.mjs';
await size(1440, 900); await go('/acta/', 800); await ev('localStorage.clear()'); await go('/acta/', 1200);
await click('#prueba'); await sleep(300);
const res = await ev(`(()=>{
  const id=new URLSearchParams(location.search).get('acta'); const a=JSON.parse(localStorage.getItem('acta:'+id)); const M=ActaMotor;
  Object.assign(a.datos,{competicion:'Lliga Catalana de Prova - 1a fase - Grup Z',categoria:'Sènior Masculí',partido:'4242',fecha:'2026-11-07',hora:'18:00',
    pabellon:'Pavelló Municipal de Vilaprova - Pista 2',ciudad:'Vilaprova',r1Lic:'2634',r2Lic:'1987',anLic:'2695',delegadoL:'Pere Vidal Sants',abrevL:'EQF',abrevV:'EQS'});
  let t=Date.parse('2026-11-07T17:10:00Z'); const h=(s=25)=>new Date(t+=s*1000).toISOString();
  let semilla=20261107; const azar=()=>((semilla=(semilla*1103515245+12345)&0x7fffffff)/0x7fffffff);
  const rech=[];
  const ok=(e,s)=>!M.validar(a.cfg,a.datos,a.ev,e);
  const add=(e,s=25,obl=false)=>{ const m=M.validar(a.cfg,a.datos,a.ev,e); if(!m){ a.ev.push({...e,h:h(s)}); return true;} if(obl) rech.push(e.t+': '+m); return false; };
  const est=()=>M.reproducir(a.cfg,a.datos,a.ev), set=()=>M.setActual(est());
  a.ev.push({t:'obs',texto:"El partit comença amb 10 minuts de retard degut a un partit de voleibol federat anterior.",h:h(1)});
  add({t:'sorteo',saca:'L',izq:'V'},60,true);
  const FORM={L:['3','4','5','6','8','9'],V:['3','4','5','6','8','10']};
  const PL=[0,0.57,0.43,0.56,0.42,0.6];            // prob. de punto del local por set: F gana 1, 3 y 5
  const hecho=new Set(); const una=(k,f)=>{ if(!hecho.has(k) && f()) hecho.add(k); };
  for (let n=1;n<=5;n++){
    let st=est(); if(st.fase==='fin') break;
    // Intervalo entre sets: 3 minutos justos (FIVB 18.1) entre el último punto y el inicio del siguiente; formaciones
    // (y el sorteo del 5º) dentro de esos 3 minutos. El 1er set empieza 30 s después del sorteo.
    const ini=n===1?30:180; let usado=0; const dentro=(e,seg)=>{ usado+=seg; return add(e,seg,true); };
    if(n===5) dentro({t:'sorteo',saca:'V',izq:'V'},30);
    if(n===4) { FORM.L=['1','4','5','6','8','9']; }
    if(n>1) { dentro({t:'alineacion',eq:'L',jugadores:FORM.L},20); dentro({t:'alineacion',eq:'V',jugadores:FORM.V},20); }
    else { add({t:'alineacion',eq:'L',jugadores:FORM.L},0,true); add({t:'alineacion',eq:'V',jugadores:FORM.V},0,true); }
    add({t:'inicioSet'},ini-usado,true);
    const subs={L:[],V:[]};
    let guard=0;
    while(guard++<900){
      st=est(); if(st.fase!=='juego') break; const s=M.setActual(st), pL=s.puntos.L, pV=s.puntos.V, tot=pL+pV;
      // Capitán en juego si hace falta (el capitán de S sale)
      if(!ok({t:'punto',eq:'L'})){
        const msg=M.validar(a.cfg,a.datos,a.ev,{t:'punto',eq:'L'});
        if(add({t:'liberoSale',eq:'L'},10)||add({t:'liberoSale',eq:'V'},10)) continue;
        let hecho2=false; for(const eq of ['L','V']) for(const num of s.rot[eq]) if(!hecho2 && add({t:'capitanJuego',eq,num},10)) hecho2=true;
        if(hecho2) continue;
        rech.push('bloqueado: '+msg); break;
      }
      // Sanciones y demás, una vez cada una
      if(n===1&&tot===7) una('a1',()=>add({t:'sancion',eq:'V',quien:'4',tipo:'amonestacion'},20,true));
      if(n===1&&tot===13) una('i1',()=>add({t:'impropia',eq:'L'},15,true));
      if(n===2&&tot===10) una('d1',()=>add({t:'sancion',eq:'V',quien:'equipo',tipo:'avisoRetraso'},15,true));
      if(n===3&&tot===16) una('d2',()=>add({t:'sancion',eq:'V',quien:'equipo',tipo:'castigoRetraso'},15,true));
      if(n===4&&tot===9) una('c1',()=>add({t:'sancion',eq:'L',quien:'E',tipo:'castigo'},20,true));
      if(n===3&&tot===20) una('o3',()=>{ a.ev.push({t:'obs',texto:"El jugador núm. 11 de l'equip Equipo S es lesiona amb el tanteig "+pL+"-"+pV+" del 3r set i és atès per l'entrenador.",h:h(5)}); return true; });
      // Tiempos: el que va perdiendo por 3 o más pide tiempo (máx. 2)
      for(const eq of ['L','V']){ const mio=eq==='L'?pL:pV, otro=eq==='L'?pV:pL;
        if(otro-mio>=3 && s.tiempos[eq].length<2 && azar()<0.35) add({t:'tiempo',eq},40); }
      // Sustituciones: hacia el punto 12 entra uno del banquillo y hacia el 30 vuelve el titular
      for(const eq of ['L','V']){
        if(tot>=10+(eq==='V'?4:0) && !subs[eq].length && azar()<0.3){
          const banco=st.equipos[eq].jugadores.filter(j=>!j.lib && !s.rot[eq].includes(j.num) && !FORM[eq].includes(j.num)).map(j=>j.num);
          const sale=s.rot[eq][1+Math.floor(azar()*3)]; const entra=banco[Math.floor(azar()*banco.length)];
          if(entra && add({t:'sust',eq,sale,entra},30)) subs[eq].push([sale,entra]);
        } else if(tot>=30 && subs[eq].length===1 && azar()<0.3){
          const [tit,sup]=subs[eq][0]; if(s.rot[eq].includes(sup) && add({t:'sust',eq,sale:sup,entra:tit},30)) subs[eq].push('vuelta');
        } else if(tot>=20 && n%2===0 && subs[eq].length<3 && subs[eq].includes('vuelta') && azar()<0.2){
          const banco=st.equipos[eq].jugadores.filter(j=>!j.lib && !s.rot[eq].includes(j.num) && !FORM[eq].includes(j.num) && !subs[eq].some(x=>Array.isArray(x)&&x[1]===j.num)).map(j=>j.num);
          const sale=s.rot[eq][2]; if(banco[0] && add({t:'sust',eq,sale,entra:banco[0]},30)) subs[eq].push([sale,banco[0]]);
        }
      }
      // Líbero: entra por un zaguero (no el que saca) cuando su equipo recibe
      for(const eq of ['L','V']){
        if(azar()<0.5){ const libs=st.equipos[eq].jugadores.filter(j=>j.lib).map(j=>j.num); const lib=libs[(n+tot)%libs.length];
          for(const pos of [4,5]){ const sale=s.rot[eq][pos]; if(sale && add({t:'liberoEntra',eq,libero:lib,sale},8)) break; } }
      }
      add({t:'punto',eq:azar()<PL[n]?'L':'V'},30+Math.floor(azar()*20),true);
    }
  }
  a.ev.push({t:'obs',texto:"Es realitza escalfament conjunt a petició d'ambdós equips.",h:h(5)});
  if (${!!process.env.ANEXO}) a.ev.push({t:'obs',texto:"Observació de prova afegida per comprovar que les observacions llargues continuen a la full annex (Format 5) sense perdre cap paraula de l'escrit original de l'anotador.",h:h(5)});
  localStorage.setItem('acta:'+id,JSON.stringify(a));
  const f=est(); return {id, a, rech, fase:f.fase, sets:f.sets.map(x=>x.puntos.L+'-'+x.puntos.V), sanc:f.sanciones.length, ev:a.ev.length,
    sust:f.sets.map(x=>x.sust.L.length+'/'+x.sust.V.length), tiempos:f.sets.map(x=>x.tiempos.L.length+'/'+x.tiempos.V.length),
    lib:a.ev.filter(e=>e.t==='liberoEntra').length, intervalos:f.sets.slice(1).map((x,i)=>(Date.parse(x.inicio)-Date.parse(f.sets[i].fin))/1000), cap:a.ev.filter(e=>e.t==='capitanJuego').length};
})()`);
const { a, ...resumenPartido } = res; console.log(JSON.stringify(resumenPartido));
check(res.fase === 'fin' && !res.rech.length, 'partido completo sin rechazos');
check(res.intervalos.every((x) => x === 180), 'intervalos entre sets de 3 minutos: ' + res.intervalos.join(', ') + ' s');
fs.writeFileSync(path.join(process.env.OUT, 'acta-demo.json'), JSON.stringify(a, null, 1));
await go(await ev('location.pathname+location.search'), 1500);
await shot('demo-1-final');
await click('#ver'); await sleep(300); await click('label:has(input[name=modo][value=fcvb])'); await sleep(1200);
await shot('demo-2-acta');
const r = await cdp('Page.printToPDF', { landscape: true, preferCSSPageSize: true, printBackground: true, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 });
fs.writeFileSync(path.join(process.env.OUT, 'acta-demo.pdf'), Buffer.from(r.result.data, 'base64'));
check(!errores().length, 'sin errores de JavaScript ' + JSON.stringify(errores().slice(0, 2)));
await fin(); process.exit(resumen() ? 1 : 0);
