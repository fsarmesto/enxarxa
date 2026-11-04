// Motor del acta electrónica (prototipo para la FCVB, 3-nov-2026). Reglas oficiales de voleibol FIVB 6x6.
// El acta es una lista de sucesos (sorteo, alineación, punto, tiempo, sustitución, líbero, sanción…) y el estado se
// calcula siempre desde el principio: estado = reproducir(config, sucesos). Deshacer = quitar el último suceso.
// Lo que se deduce de las reglas (rotar, cambiar el saque, salida automática del líbero, fin de set, cambio de campo
// en el set decisivo) no se guarda: se recalcula. aplicar() lanza un Error con el motivo si el suceso no es legal.
// Equipos: 'L' (local) y 'V' (visitante). Posiciones: índice 0..5 = I..VI (I = zaguero derecho, el que saca).
(function (root) {
  'use strict';
  const OTRO = (e) => (e === 'L' ? 'V' : 'L');
  // liberos: si la categoría juega con líbero (en infantil se puede quitar). setObligatorio: cada jugador del acta tiene que
  // jugar al menos un set completo (FCVB, Circular 011: infantil y, a veces, alevín).
  const CONFIG = { mejorDe: 5, puntosSet: 25, puntosDecisivo: 15, tiempos: 2, sustituciones: 6, cambioDecisivo: 8, liberos: true, setObligatorio: false };
  // FIVB 4.1.1 (entrenador, 2 ayudantes, fisio, médico) + FCVB Circular 004 (psicólogo, preparador físico, masajista).
  const ROLES_OFICIALES = { E: 'Entrenador', E2: 'Segundo entrenador', E3: 'Entrenador ayudante', F: 'Fisioterapeuta', M: 'Médico', PS: 'Psicólogo', PF: 'Preparador físico', MS: 'Masajista' };

  // Dorsales: de 0 a 99 y además el 00 (distinto del 0). Se guardan como texto: "7", "0", "00" ("07" pasa a "7").
  const DORSAL = /^\d{1,2}$/;
  const dorsalValido = (x) => DORSAL.test(String(x ?? '').trim());
  const D = (x) => { if (x === null || x === undefined || x === '') return x; const t = String(x).trim(); return t === '00' ? '00' : DORSAL.test(t) ? String(+t) : t; };
  const esDorsal = (x) => typeof x === 'string' && DORSAL.test(x);
  // Normaliza los dorsales de un suceso (las actas guardadas antes los tenían como número).
  function normalizar(ev) {
    const e = { ...ev };
    for (const k of ['sale', 'entra', 'libero', 'num', 'nuevo']) if (k in e) e[k] = D(e[k]);
    if ('quien' in e && (typeof e.quien === 'number' || DORSAL.test(String(e.quien)))) e.quien = D(e.quien);
    if (e.t === 'alineacion' && Array.isArray(e.jugadores)) e.jugadores = e.jugadores.map(D);
    return e;
  }

  class ErrorActa extends Error {}
  const no = (msg) => { throw new ErrorActa(msg); };

  function nuevoSet(n) {
    return {
      n, inicio: null, fin: null, saqueInicial: null, izq: null, decisivo: false,
      alineacion: { L: null, V: null },       // titulares en I..VI tal como empezaron
      rot: { L: null, V: null },              // quién ocupa cada posición ahora (sin el líbero)
      libero: { L: null, V: null },           // { num, por, pos } si hay un líbero en pista
      puntos: { L: 0, V: 0 }, saque: null,
      turnos: { L: [], V: [] },               // turnos de saque: { col, num, hasta }
      sust: { L: [], V: [] },                 // { sale, entra, a, b, tipo }
      parejas: { L: {}, V: {} },              // titular -> suplente que entró por él
      cerradas: { L: new Set(), V: new Set() }, // jugadores que ya no pueden volver a cambiar (normalmente)
      jugados: { L: new Set(), V: new Set() },  // suplentes que ya han entrado en este set
      expulsados: { L: new Set(), V: new Set() },
      tiempos: { L: [], V: [] },              // { a, b }
      liberos: { L: [], V: [] },              // cambios de líbero, para el acta: { entra, sale, a, b }
      progreso: [],                            // cada punto: { eq, a, b, motivo }
      golden: false, capJuego: { L: null, V: null }, rallies: 0, repeticiones: [], ultLibero: { L: -1, V: -1 }, cambioHecho: false, ganador: null, pendienteSust: { L: [], V: [] }, nSust: { L: 0, V: 0 },
    };
  }

  function nuevo(config, datos) {
    return {
      cfg: { ...CONFIG, ...(config || {}) }, datos: datos || {},
      equipos: { L: { nombre: '', jugadores: [], oficiales: [] }, V: { nombre: '', jugadores: [], oficiales: [] } },
      sorteos: [], sets: [nuevoSet(1)], ganados: { L: 0, V: 0 }, fin: null, inicio: null,
      golden: null,                            // golden set (desempate tras el partido): { set, ganador }
      capitanesJuego: [],                      // capitán en juego marcado cuando el capitán no está en pista: { eq, num, set, a, b, h }
      sanciones: [],                           // { eq, quien, tipo, set, a, b }
      avisoConducta: { L: false, V: false }, avisoRetraso: { L: false, V: false }, impropias: { L: 0, V: 0 },
      descalificados: { L: new Set(), V: new Set() }, fueraPartido: { L: new Set(), V: new Set() },
      observaciones: [], firmas: {}, fase: 'preparacion', auto: [],
      marcasSet: { L: {}, V: {} },
      liberosFuera: { L: [], V: [] },
      castigosPendientes: [],                  // castigos puestos entre sets (o antes del partido): punto al empezar el set
      faltasRotacion: [], incompleto: null,          // líberos que no pueden seguir y por quién se han redesignado             // set completo marcado a mano: marcasSet[eq][dorsal][set] = true/false
    };
  }

  const setActual = (st) => st.sets[st.sets.length - 1];
  const jugador = (st, eq, num) => st.equipos[eq].jugadores.find((j) => j.num === num);
  const esLibero = (st, eq, num) => !!jugador(st, eq, num)?.lib;
  const objetivo = (st, s) => (s.decisivo ? st.cfg.puntosDecisivo : st.cfg.puntosSet);
  const ganarPartido = (st) => Math.ceil(st.cfg.mejorDe / 2);
  const marcador = (s, eq) => ({ a: s.puntos[eq], b: s.puntos[OTRO(eq)] });   // a = el del equipo que pide/es sancionado
  const enPista = (s, eq) => {
    const r = s.rot[eq] || []; const l = s.libero[eq];
    return r.map((n, i) => (l && l.pos === i ? l.num : n));
  };

  // ---------- Rotación y saque ----------
  function rotar(st, s, eq, h) {
    const r = s.rot[eq]; s.rot[eq] = [r[1], r[2], r[3], r[4], r[5], r[0]];
    const l = s.libero[eq];
    if (l) {
      l.pos = (l.pos + 5) % 6;
      // El líbero solo puede estar en la zaga: al pasar a la posición IV (delantera) sale y vuelve el jugador al que sustituía.
      if (l.pos === 3) { st.auto.push({ t: 'liberoSaleAuto', eq, set: s.n, libero: l.num, vuelve: l.por, h }); s.liberos[eq].push({ entra: l.por, sale: l.num, ...marcador(s, eq), auto: true }); s.libero[eq] = null; s.ultLibero[eq] = s.rallies; }
    }
  }
  function abrirTurno(s, eq) {
    const num = s.rot[eq][0], col = s.alineacion[eq].indexOf(num);
    s.turnos[eq].push({ col: col >= 0 ? col : colDeSuplente(s, eq, num), num, hasta: null });
  }
  // Un suplente saca en la columna (posición inicial) del titular por el que entró.
  function colDeSuplente(s, eq, num) {
    const tit = Object.keys(s.parejas[eq]).find((t) => s.parejas[eq][t] === num);
    return tit != null ? s.alineacion[eq].indexOf(tit) : -1;
  }
  function cerrarTurno(s, eq) { const t = s.turnos[eq][s.turnos[eq].length - 1]; if (t && t.hasta == null) t.hasta = s.puntos[eq]; }

  // ---------- Punto ----------
  function punto(st, eq, motivo, h) {
    const s = setActual(st);
    if (st.fase !== 'juego') no('El set no está en juego.');
    if (s.pendienteSust.L.length || s.pendienteSust.V.length) no('Antes hay que sustituir al jugador expulsado o descalificado.');
    s.puntos[eq]++;
    s.rallies++;   // rally completo = todo lo que da un punto, también un castigo o una falta de rotación (FIVB 6.1.3)
    s.progreso.push({ eq, a: s.puntos.L, b: s.puntos.V, motivo, h });
    if (s.saque !== eq) {           // gana el saque el equipo que recibía: rota y saca su jugador de la posición I
      cerrarTurno(s, s.saque);
      rotar(st, s, eq, h);
      s.saque = eq; abrirTurno(s, eq);
    }
    // Set decisivo: cambio de campo cuando un equipo llega a 8 (una sola vez).
    if (s.decisivo && !s.cambioHecho && s.puntos[eq] === st.cfg.cambioDecisivo) { s.cambioHecho = true; s.izq = OTRO(s.izq); st.auto.push({ t: 'cambioCampo', set: s.n, h }); }
    const obj = objetivo(st, s);
    if (s.puntos[eq] >= obj && s.puntos[eq] - s.puntos[OTRO(eq)] >= 2) finSet(st, s, eq, h);
  }

  function finSet(st, s, eq, h) {
    s.ganador = eq; s.fin = h; cerrarTurno(s, 'L'); cerrarTurno(s, 'V');
    if (s.golden) { st.golden.ganador = eq; st.fase = 'fin'; st.fin = h; return; }   // no cuenta en los sets del partido
    st.ganados[eq]++;
    if (st.ganados[eq] === ganarPartido(st)) { st.fase = 'fin'; st.fin = h; return; }
    const sig = nuevoSet(s.n + 1);
    sig.decisivo = sig.n === st.cfg.mejorDe;
    if (!sig.decisivo) {           // cambian de campo y saca primero el que no sacó primero en el set anterior
      sig.izq = OTRO(s.izq);
      sig.saqueInicial = OTRO(s.saqueInicial);
    }
    st.sets.push(sig); st.fase = 'entreSets';
  }

  // ---------- Sustituciones ----------
  // ¿Puede entrar `entra` por `sale` con una sustitución normal? Devuelve el motivo si no.
  function motivoSust(st, s, eq, sale, entra) {
    const pista = s.rot[eq];
    if (!jugador(st, eq, entra)) return `El ${entra} no está en el acta.`;
    if (esLibero(st, eq, entra)) return 'Un líbero no puede entrar por sustitución: usa el cambio de líbero.';
    if (s.libero[eq] && s.libero[eq].por === sale && !s.pendienteSust[eq].includes(sale)) return `El ${sale} está fuera por el líbero: primero tiene que salir el líbero.`;
    if (!pista.includes(sale)) return `El ${sale} no está en pista.`;
    if (pista.includes(entra) || s.libero[eq]?.num === entra) return `El ${entra} ya está en pista.`;
    if (st.descalificados[eq].has(entra) || st.fueraPartido[eq].has(entra)) return `El ${entra} no puede volver a jugar en este partido.`;
    if (s.expulsados[eq].has(entra)) return `El ${entra} está expulsado en este set.`;
    if (s.nSust[eq] >= st.cfg.sustituciones) return `Ya ha hecho las ${st.cfg.sustituciones} sustituciones de este set.`;
    const titulares = s.alineacion[eq];
    const parejas = s.parejas[eq];
    if (titulares.includes(sale)) {              // sale un titular
      if (s.cerradas[eq].has(sale)) return `El ${sale} ya salió y volvió en este set: no puede volver a salir.`;
      if (titulares.includes(entra)) return `El ${entra} es titular: solo puede volver a pista por el suplente que entró por él.`;
      if (s.jugados[eq].has(entra)) return `El ${entra} ya ha jugado este set: solo puede volver por el titular por el que entró.`;
      return null;
    }
    const tit = Object.keys(parejas).find((t) => parejas[t] === sale);   // sale un suplente
    if (tit == null) return `El ${sale} no puede salir con una sustitución normal.`;
    if (tit !== entra) return `Por el ${sale} solo puede volver el ${tit}, el titular por el que entró.`;
    return null;
  }

  function sustituir(st, eq, sale, entra, tipo, h) {
    const s = setActual(st);
    if (st.fase !== 'juego') no('Las sustituciones se hacen con el set en marcha.');
    if (tipo === 'excepcional') {
      // Sin sustitución legal posible (lesión, o jugador expulsado o descalificado): cualquier jugador que no esté en
      // pista (salvo líberos); no cuenta en las 6 y el que sale no puede volver en el partido.
      if (!s.rot[eq].includes(sale)) no(`El ${sale} no está en pista.`);
      if (s.libero[eq] && s.libero[eq].por === sale && !s.pendienteSust[eq].includes(sale)) no(`El ${sale} está fuera por el líbero: primero tiene que salir el líbero.`);
      if (!jugador(st, eq, entra) || esLibero(st, eq, entra)) no(`El ${entra} no puede entrar.`);
      if (s.rot[eq].includes(entra) || st.descalificados[eq].has(entra) || st.fueraPartido[eq].has(entra) || s.expulsados[eq].has(entra)) no(`El ${entra} no puede entrar.`);
      st.fueraPartido[eq].add(sale);
    } else {
      const m = motivoSust(st, s, eq, sale, entra); if (m) no(m);
      const tit = s.alineacion[eq].includes(sale);
      if (tit) { s.parejas[eq][sale] = entra; s.jugados[eq].add(entra); }
      else { s.cerradas[eq].add(entra); s.cerradas[eq].add(sale); }
      s.nSust[eq]++;
    }
    s.rot[eq] = s.rot[eq].map((n) => (n === sale ? entra : n));
    if (s.libero[eq] && s.libero[eq].por === sale) s.libero[eq] = { ...s.libero[eq], por: entra };   // sancionado que estaba fuera por el líbero
    s.sust[eq].push({ sale, entra, ...marcador(s, eq), tipo: tipo || 'normal', h });
    s.pendienteSust[eq] = s.pendienteSust[eq].filter((n) => n !== sale);
  }

  // ---------- Líbero ----------
  function liberoEntra(st, eq, libero, sale, h) {
    const s = setActual(st);
    if (!st.cfg.liberos) no('En este partido no hay líbero.');
    if (st.fase !== 'juego') no('El líbero entra con el set en marcha.');
    if (!esLibero(st, eq, libero)) no(`El ${libero} no está inscrito como líbero.`);
    if (st.descalificados[eq].has(libero) || s.expulsados[eq].has(libero) || st.fueraPartido[eq].has(libero)) no(`El líbero ${libero} no puede jugar.`);
    if (s.libero[eq]) {
      // Cambio de un líbero por el otro: ocupa el mismo sitio.
      if (sale !== s.libero[eq].num) no('Ya hay un líbero en pista: primero tiene que salir, o cámbialo por el otro líbero.');
      if (libero === sale) no('Ese líbero ya está en pista.');
      if (s.rallies === s.ultLibero[eq] && st.fase === 'juego') no('Entre dos cambios de líbero tiene que haber un rally completo.');
      s.liberos[eq].push({ entra: libero, sale, ...marcador(s, eq), h });
      s.libero[eq] = { ...s.libero[eq], num: libero }; s.ultLibero[eq] = s.rallies;
      return;
    }
    const pos = s.rot[eq].indexOf(sale);
    if (pos < 0) no(`El ${sale} no está en pista.`);
    if (![0, 4, 5].includes(pos)) no('El líbero solo puede sustituir a un zaguero (posiciones I, V y VI).');
    if (pos === 0 && s.saque === eq && st.fase === 'juego') no('El líbero no puede sacar: no puede entrar por el jugador que va a sacar.');
    if (s.rallies === s.ultLibero[eq] && st.fase === 'juego') no('Entre dos cambios de líbero tiene que haber un rally completo.');
    s.libero[eq] = { num: libero, por: sale, pos };
    s.liberos[eq].push({ entra: libero, sale, ...marcador(s, eq), h });
    s.ultLibero[eq] = s.rallies;
  }
  function liberoSale(st, eq, h) {
    const s = setActual(st), l = s.libero[eq];
    if (!l) no('No hay ningún líbero en pista.');
    if (s.rallies === s.ultLibero[eq] && st.fase === 'juego') no('Entre dos cambios de líbero tiene que haber un rally completo.');
    s.liberos[eq].push({ entra: l.por, sale: l.num, ...marcador(s, eq), h });
    s.libero[eq] = null; s.ultLibero[eq] = s.rallies;
  }

  // ---------- Sanciones ----------
  // tipo: amonestacion (amarilla), castigo (roja: punto y saque al rival), expulsion (fuera el resto del set),
  // descalificacion (fuera el partido), avisoRetraso, castigoRetraso. quien: dorsal, E, E2, F, M o 'equipo'.
  function sancionar(st, eq, quien, tipo, h) {
    const s = setActual(st);
    if (!['juego', 'entreSets', 'preparacion'].includes(st.fase)) no('El partido ya ha acabado.');
    const esJug = esDorsal(quien);
    if (esJug && !jugador(st, eq, quien)) no(`El ${quien} no está en el acta.`);
    if (!esJug && quien !== 'equipo' && !ROLES_OFICIALES[quien]) no('¿A quién es la sanción?');
    if (tipo === 'amonestacion' && st.avisoConducta[eq]) no('Este equipo ya ha tenido su amonestación: la siguiente conducta incorrecta es castigo.');
    if (tipo === 'avisoRetraso' && st.avisoRetraso[eq]) no('Este equipo ya tiene el aviso por retraso: el siguiente retraso es castigo por retraso.');
    if (tipo === 'castigoRetraso' && !st.avisoRetraso[eq]) no('El primer retraso es un aviso por retraso.');
    st.sanciones.push({ eq, quien, tipo, set: s.n, ...marcador(s, eq), h });
    // La amonestación (tarjeta amarilla) se enseña una sola vez por equipo y partido, y solo la gasta otra amarilla.
    // Tras una expulsión se puede amonestar a otro miembro del equipo: Casebook FIVB, caso 6.07 (regla 21). Tras un
    // castigo el Casebook no lo dice: se deduce del 6.07 y del partido de prueba del e-Scoresheet de Swiss Volley (2021),
    // donde un equipo con castigo y expulsión del 7 recibe después la amarilla del 3.
    if (tipo === 'amonestacion') st.avisoConducta[eq] = true;
    if (tipo === 'avisoRetraso') st.avisoRetraso[eq] = true;
    // Castigo: punto y saque al rival; entre sets o antes del partido, al empezar el set siguiente (FIVB).
    if (tipo === 'castigo' || tipo === 'castigoRetraso') { if (st.fase === 'juego') punto(st, OTRO(eq), tipo, h); else st.castigosPendientes.push({ eq: OTRO(eq), tipo }); }
    if (esJug && (tipo === 'expulsion' || tipo === 'descalificacion')) {
      if (tipo === 'expulsion') s.expulsados[eq].add(quien); else st.descalificados[eq].add(quien);
      const enP = s.rot[eq]?.includes(quien);
      if (s.libero[eq]?.num === quien) { s.liberos[eq].push({ entra: s.libero[eq].por, sale: quien, ...marcador(s, eq), h }); s.libero[eq] = null; }
      else if (enP) s.pendienteSust[eq].push(quien);   // hay que sustituirlo legalmente antes de seguir
    }
  }

  // ---------- Capitán en juego (FIVB 5.1.2) ----------
  // Si el capitán del equipo no está en pista, juega de capitán otro jugador en pista. Cuando el capitán vuelve, o el
  // capitán en juego sale, la marca se borra. Si el capitán es líbero no se pide (Ferran, 4-nov-2026).
  const capitan = (st, eq) => st.equipos[eq].jugadores.find((j) => j.cap) || null;
  function revisarCapitan(st) {
    const s = setActual(st); if (!s.inicio) return;
    for (const eq of ['L', 'V']) {
      const pista = enPista(s, eq), c = capitan(st, eq);
      if ((c && pista.includes(c.num)) || (s.capJuego[eq] && !pista.includes(s.capJuego[eq]))) s.capJuego[eq] = null;
    }
  }
  // ¿Hay que preguntar quién es el capitán en juego? (capitán fuera de pista, no es líbero, y nadie marcado)
  function necesitaCapitanJuego(st, eq) {
    const s = setActual(st), c = capitan(st, eq);
    return st.fase === 'juego' && !!c && !c.lib && !enPista(s, eq).includes(c.num) && !s.capJuego[eq];
  }

  // ---------- Reproducir ----------
  function aplicar(st, ev0) { aplicar0(st, ev0); revisarCapitan(st); }
  function aplicar0(st, ev0) {
    const ev = normalizar(ev0), h = ev.h || null, s = setActual(st);
    switch (ev.t) {
      case 'equipo': {   // { eq, nombre, jugadores:[{num,nombre,cap,lib}], oficiales:[{rol,nombre}] }
        if (st.fase !== 'preparacion') no('Las plantillas se cierran al empezar el partido.');
        const mal = ev.jugadores.find((j) => !dorsalValido(j.num));
        if (mal) no(`Dorsal no válido: "${mal.num ?? ''}"${mal.nombre ? ' (' + mal.nombre + ')' : ''}. Tiene que ser de 0 a 99, o 00.`);
        const nums = ev.jugadores.map((j) => D(j.num));
        if (new Set(nums).size !== nums.length) no('Hay dorsales repetidos.');
        if (ev.jugadores.filter((j) => j.cap).length > 1) no('Solo puede haber un capitán.');
        // El líbero puede ser capitán (del equipo y en juego): FIVB, regla 5, desde el 1-1-2022 (Congreso de feb. 2021).
        if (ev.jugadores.filter((j) => j.lib).length > 2) no('Como mucho 2 líberos.');
        // Máximo en el acta (FCVB, circulares 004 y 009 de 2026-27): 14 jugadores con 0, 1 o 2 líberos; 12 si la
        // competición no tiene líbero (infantil). `cfg.maxJugadores` lo cambia si una normativa específica dice otra cosa.
        const maxJ = st.cfg.maxJugadores || (st.cfg.liberos ? 14 : 12);
        if (ev.jugadores.length > maxJ) no(`Como mucho ${maxJ} jugadores en el acta${st.cfg.liberos ? ' (líberos incluidos)' : ''}.`);
        // Oficiales: primer entrenador y, como mucho, 3 más (FCVB, normes 8.7.7; FIVB 4.1.1: 2 ayudantes, fisio y médico).
        if ((ev.oficiales || []).filter((o) => o.rol !== 'E' && o.nombre).length > 3) no('Como mucho 3 oficiales además del primer entrenador.');
        if (!st.cfg.liberos && ev.jugadores.some((j) => j.lib)) no('En este partido no hay líbero (está desactivado en el formato).');
        st.equipos[ev.eq] = { nombre: ev.nombre || st.equipos[ev.eq].nombre, jugadores: ev.jugadores.map((j) => ({ ...j, num: D(j.num) })), oficiales: (ev.oficiales || []).map((o) => ({ ...o })) };
        return;
      }
      case 'goldenSet': {   // desempate a un set (p. ej. eliminatoria a doble partido igualada): a 15, con sorteo
        if (st.fase !== 'fin' || st.incompleto) no('El golden set se juega cuando el partido ha acabado.');
        if (st.golden) no('El golden set ya se ha jugado.');
        const g = nuevoSet(s.n + 1); g.decisivo = true; g.golden = true;
        st.sets.push(g); st.golden = { set: g.n, ganador: null }; st.fase = 'entreSets'; st.fin = null;
        return;
      }
      case 'capitanJuego': {   // { eq, num }: el capitán no está en pista y el entrenador designa a otro jugador en pista
        if (st.fase !== 'juego') no('El capitán en juego se marca con el set en marcha.');
        const c = capitan(st, ev.eq);
        if (!c) no('Este equipo no tiene capitán en el acta.');
        if (enPista(s, ev.eq).includes(c.num)) no(`El capitán, el ${c.num}, está en pista: él es el capitán en juego.`);
        if (!enPista(s, ev.eq).includes(ev.num)) no(`El ${ev.num} no está en pista.`);
        s.capJuego[ev.eq] = ev.num; st.capitanesJuego.push({ eq: ev.eq, num: ev.num, set: s.n, ...marcador(s, ev.eq), h });
        return;
      }
      case 'sorteo': {   // { saca, izq }: antes del 1er set y antes del decisivo
        if (!['preparacion', 'entreSets'].includes(st.fase) || s.inicio) no('El sorteo se hace antes del primer set o del decisivo.');
        if (st.fase === 'entreSets' && !s.decisivo) no('Solo hay sorteo antes del set decisivo.');
        s.saqueInicial = ev.saca; s.izq = ev.izq; st.sorteos.push({ set: s.n, saca: ev.saca, izq: ev.izq, h });
        return;
      }
      case 'alineacion': {   // { eq, jugadores: [6 dorsales, I..VI] }
        if (s.inicio) no('El set ya ha empezado.');
        if (st.fase === 'preparacion') { for (const e of ['L', 'V']) { const j = st.equipos[e].jugadores; if (j.filter((x) => !x.lib).length < 6) no('Cada equipo necesita al menos 6 jugadores que no sean líberos.'); } }
        const a = ev.jugadores;
        if (!Array.isArray(a) || a.length !== 6) no('La alineación tiene 6 jugadores.');
        if (new Set(a).size !== 6) no('Hay dorsales repetidos en la alineación.');
        for (const n of a) {
          if (!jugador(st, ev.eq, n)) no(`El ${n} no está en el acta.`);
          if (esLibero(st, ev.eq, n)) no(`El ${n} es líbero: no puede estar en la alineación inicial.`);
          if (st.descalificados[ev.eq].has(n) || st.fueraPartido[ev.eq].has(n)) no(`El ${n} no puede jugar.`);
        }
        s.alineacion[ev.eq] = [...a]; s.rot[ev.eq] = [...a];
        return;
      }
      case 'inicioSet': {
        if (!['preparacion', 'entreSets'].includes(st.fase)) no('El set ya está en marcha.');
        if (!s.alineacion.L || !s.alineacion.V) no('Faltan las alineaciones.');
        if (!s.saqueInicial || !s.izq) no(s.n === 1 || s.decisivo ? 'Falta el sorteo.' : 'Falta saber quién saca.');
        s.inicio = h; if (!st.inicio) st.inicio = h;
        s.saque = s.saqueInicial; abrirTurno(s, s.saque);
        // El que recibe empieza con su primer turno "tachado": su primer saque lo hará el jugador de la posición II.
        st.fase = 'juego';
        for (const c of st.castigosPendientes.splice(0)) if (st.fase === 'juego') punto(st, c.eq, c.tipo, h);
        return;
      }
      case 'punto': if (!['L', 'V'].includes(ev.eq)) no('¿Para qué equipo?'); return punto(st, ev.eq, ev.motivo || 'rally', h);
      case 'tiempo': {
        if (st.fase !== 'juego') no('Los tiempos se piden con el set en marcha.');
        if (s.tiempos[ev.eq].length >= st.cfg.tiempos) no(`Ya ha pedido los ${st.cfg.tiempos} tiempos de este set.`);
        s.tiempos[ev.eq].push({ ...marcador(s, ev.eq), h });
        return;
      }
      case 'sust': return sustituir(st, ev.eq, ev.sale, ev.entra, ev.tipo, h);
      case 'liberoEntra': return liberoEntra(st, ev.eq, ev.libero, ev.sale, h);
      case 'liberoSale': return liberoSale(st, ev.eq, h);
      case 'sancion': return sancionar(st, ev.eq, ev.quien, ev.tipo, h);
      case 'impropia': st.impropias[ev.eq]++; st.sanciones.push({ eq: ev.eq, quien: 'equipo', tipo: 'impropia', set: s.n, ...marcador(s, ev.eq), h }); return;
      case 'obs': st.observaciones.push({ texto: String(ev.texto || '').slice(0, 1000), set: s.n, h }); return;
      case 'firma': st.firmas[ev.rol] = { nombre: ev.nombre || '', img: ev.img, h }; return;
      case 'faltaRotacion': {   // FIVB 7.7: falta de rotación o sacador incorrecto: punto y saque al rival
        if (st.fase !== 'juego') no('Se anota con el set en marcha.');
        if (!['L', 'V'].includes(ev.eq)) no('¿Qué equipo ha cometido la falta?');
        // FIVB 7.7.2: si se sabe el momento exacto de la falta (`desde` = puntos que tenía entonces el equipo infractor), se
        // anulan los puntos que ha ganado después; los del rival se mantienen. Si no se sabe, solo punto y saque al rival.
        let anulados = 0;
        if (ev.desde != null && ev.desde !== '') {
          const d = +ev.desde;
          if (!Number.isInteger(d) || d < 0 || d > s.puntos[ev.eq]) no(`El marcador del infractor en el momento de la falta tiene que ser de 0 a ${s.puntos[ev.eq]}.`);
          let k = 0; for (const p of s.progreso) if (p.eq === ev.eq && ++k > d) p.anulado = true;
          anulados = s.puntos[ev.eq] - d; s.puntos[ev.eq] = d;
        }
        st.faltasRotacion.push({ eq: ev.eq, set: s.n, a: s.puntos[ev.eq], b: s.puntos[OTRO(ev.eq)], anulados, h });
        punto(st, OTRO(ev.eq), 'rotacion', h);
        return;
      }
      case 'incompleto': {   // { eq, motivo: 'incomparecencia'|'incompleto' } FIVB 6.4: el rival gana lo que falta
        if (!['L', 'V'].includes(ev.eq)) no('¿Qué equipo?');
        if (st.fase === 'fin') no('El partido ya ha acabado.');
        const gana = OTRO(ev.eq);
        st.incompleto = { eq: ev.eq, motivo: ev.motivo === 'incomparecencia' ? 'incomparecencia' : 'incompleto', set: s.n, a: s.puntos.L, b: s.puntos.V, h };
        st.castigosPendientes = [];
        while (st.fase !== 'fin') {
          const x = setActual(st);
          if (!x.inicio) { x.inicio = h; if (!st.inicio) st.inicio = h; if (!x.saqueInicial) x.saqueInicial = gana; if (!x.izq) x.izq = 'L'; x.saque = gana; }
          st.fase = 'juego'; x.pendienteSust = { L: [], V: [] };
          const obj = objetivo(st, x), hasta = Math.max(obj, x.puntos[ev.eq] + 2);
          while (x.puntos[gana] < hasta) { x.puntos[gana]++; x.progreso.push({ eq: gana, a: x.puntos.L, b: x.puntos.V, motivo: 'incompleto', h }); }
          if (x.decisivo && !x.cambioHecho && x.puntos[gana] >= st.cfg.cambioDecisivo) { x.cambioHecho = true; x.izq = OTRO(x.izq); }
          finSet(st, x, gana, h);
        }
        return;
      }
      case 'repeticion': {   // la jugada se repite (p. ej. doble falta o interferencia externa): sin punto para nadie
        if (st.fase !== 'juego') no('Las repeticiones se anotan con el set en marcha.');
        s.repeticiones.push({ a: s.puntos.L, b: s.puntos.V, h });
        return;
      }
      case 'liberoNoPuede': {   // { eq, libero, nuevo? } FIVB 19.4: líbero lesionado, enfermo, expulsado o descalificado
        if (!st.cfg.liberos) no('En este partido no hay líbero.');
        if (!['juego', 'entreSets'].includes(st.fase)) no('Se hace con el partido en marcha.');
        const lib = jugador(st, ev.eq, ev.libero);
        if (!lib?.lib) no(`El ${ev.libero} no es líbero.`);
        if (st.fueraPartido[ev.eq].has(ev.libero)) no(`El ${ev.libero} ya no juega.`);
        const enPistaAhora = s.libero[ev.eq]?.num === ev.libero;
        let nuevo = null;
        if (ev.nuevo != null) {
          // Redesignación: un jugador que no esté en pista pasa a ser líbero el resto del partido.
          const j = jugador(st, ev.eq, ev.nuevo);
          if (!j) no(`El ${ev.nuevo} no está en el acta.`);
          if (j.lib) no(`El ${ev.nuevo} ya es líbero: no hace falta redesignarlo.`);
          // Con 2 líberos: si el otro puede jugar, se sigue con uno y no se redesigna (FIVB 19.4.3.1). Uno expulsado este
          // set no cuenta como disponible (FCVB, Circular 009, tabla de casos).
          const otro = st.equipos[ev.eq].jugadores.find((x) => x.lib && x.num !== ev.libero && !st.fueraPartido[ev.eq].has(x.num) && !st.descalificados[ev.eq].has(x.num) && !s.expulsados[ev.eq].has(x.num));
          if (otro) no(`Queda el otro líbero, el ${otro.num}: solo se puede redesignar si tampoco puede jugar (FIVB 19.4.3.1).`);
          if ((s.rot[ev.eq] || []).includes(ev.nuevo)) no(`El ${ev.nuevo} está en pista: solo se puede redesignar a quien no esté en pista.`);
          if (st.descalificados[ev.eq].has(ev.nuevo) || st.fueraPartido[ev.eq].has(ev.nuevo)) no(`El ${ev.nuevo} no puede jugar.`);
          j.lib = true; j.redesignado = true; nuevo = j.num;
        }
        st.fueraPartido[ev.eq].add(ev.libero);
        st.liberosFuera[ev.eq].push({ libero: ev.libero, nuevo, set: s.n, a: s.puntos[ev.eq], b: s.puntos[OTRO(ev.eq)], h });
        if (enPistaAhora) {
          // Estaba en pista: le sustituye directamente el nuevo líbero (o el otro líbero); si no hay, vuelve el jugador.
          const otro = nuevo || st.equipos[ev.eq].jugadores.find((x) => x.lib && x.num !== ev.libero && !st.fueraPartido[ev.eq].has(x.num))?.num;
          if (otro) { s.liberos[ev.eq].push({ entra: otro, sale: ev.libero, ...marcador(s, ev.eq), h }); s.libero[ev.eq] = { ...s.libero[ev.eq], num: otro }; }
          else { s.liberos[ev.eq].push({ entra: s.libero[ev.eq].por, sale: ev.libero, ...marcador(s, ev.eq), h }); s.libero[ev.eq] = null; }
          s.ultLibero[ev.eq] = s.rallies;
        }
        return;
      }
      case 'setCompleto': {   // { eq, num, set, si }: corrección a mano del anotador (p. ej. un cambio especial que no cuenta)
        const set = st.sets.find((x) => x.n === ev.set);
        if (!set || !set.inicio) no('Ese set no se ha jugado.');
        if (!jugador(st, ev.eq, ev.num)) no(`El ${ev.num} no está en el acta.`);
        ((st.marcasSet[ev.eq][ev.num] ??= {})[ev.set] = !!ev.si);
        return;
      }
      default: no('Suceso desconocido: ' + ev.t);
    }
  }

  function reproducir(config, datos, sucesos) {
    const st = nuevo(config, datos);
    for (const ev of sucesos || []) aplicar(st, ev);
    return st;
  }
  // ¿Es legal? Devuelve null o el motivo, sin tocar el estado de fuera.
  function validar(config, datos, sucesos, ev) {
    try { const st = reproducir(config, datos, sucesos); aplicar(st, ev); return null; } catch (e) { if (e instanceof ErrorActa) return e.message; throw e; }
  }

  // Set completo (FCVB, Circular 011): cuenta para los titulares de ese set que no han sido cambiados durante el set. Un set
  // en juego todavía no cuenta. Lo marcado a mano manda. Devuelve, por equipo y jugador, los sets completos y si cumple.
  function setsCompletos(st) {
    const out = { L: {}, V: {} };
    for (const eq of ['L', 'V']) {
      for (const j of st.equipos[eq].jugadores) {
        const sets = [];
        for (const s of st.sets) {
          if (!s.inicio || s.golden) continue;   // el golden set no cuenta para el set obligatorio
          const auto = !!s.fin && (s.alineacion[eq] || []).includes(j.num) && !s.sust[eq].some((x) => x.sale === j.num);
          const mano = st.marcasSet[eq][j.num]?.[s.n];
          sets.push({ set: s.n, auto, mano: mano ?? null, completo: mano ?? auto, enJuego: !s.fin });
        }
        out[eq][j.num] = { num: j.num, nombre: j.nombre, lib: !!j.lib, sets, cumple: sets.some((x) => x.completo) };
      }
    }
    return out;
  }

  // Cuadro de resultados del acta.
  const minutos = (a, b) => (a && b ? Math.round((Date.parse(b) - Date.parse(a)) / 60000) : null);
  function resultados(st) {
    const g = st.sets.find((s) => s.golden && s.inicio);
    const golden = g ? { set: g.n, duracion: minutos(g.inicio, g.fin), ganador: g.ganador, puntos: { ...g.puntos } } : null;
    const filas = st.sets.filter((s) => s.inicio && !s.golden).map((s) => ({
      set: s.n, duracion: minutos(s.inicio, s.fin),
      // Las excepcionales no cuentan para el límite de 6, pero sí en el total de sustituciones del acta (FIVB 15.7).
      L: { tiempos: s.tiempos.L.length, sust: s.sust.L.length, gana: s.ganador === 'L' ? 1 : 0, puntos: s.puntos.L },
      V: { tiempos: s.tiempos.V.length, sust: s.sust.V.length, gana: s.ganador === 'V' ? 1 : 0, puntos: s.puntos.V },
    }));
    const suma = (eq, k) => filas.reduce((t, f) => t + f[eq][k], 0);
    return {
      filas, total: { duracion: filas.reduce((t, f) => t + (f.duracion || 0), 0),
        L: { tiempos: suma('L', 'tiempos'), sust: suma('L', 'sust'), gana: st.ganados.L, puntos: suma('L', 'puntos') },
        V: { tiempos: suma('V', 'tiempos'), sust: suma('V', 'sust'), gana: st.ganados.V, puntos: suma('V', 'puntos') } },
      inicio: st.inicio, fin: (st.sets.filter((s) => !s.golden && s.fin).at(-1) || {}).fin || null, golden,
      duracionPartido: minutos(st.inicio, (st.sets.filter((s) => !s.golden && s.fin).at(-1) || {}).fin),
      ganador: st.fase === 'fin' || st.golden ? (st.ganados.L > st.ganados.V ? 'L' : 'V') : null,
    };
  }

  const api = { necesitaCapitanJuego, D, dorsalValido, esDorsal, setsCompletos, CONFIG, ROLES_OFICIALES, OTRO, ErrorActa, nuevo, aplicar, reproducir, validar, resultados, enPista, setActual, motivoSust };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.ActaMotor = api;
})(typeof self !== 'undefined' ? self : this);
