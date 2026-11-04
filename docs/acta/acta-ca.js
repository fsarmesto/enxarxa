// Acta electrónica en catalán. El acta se escribe en castellano y, con el catalán elegido (localStorage liq-lang, el mismo
// idioma que la app; si no, el del navegador), cada texto que sale en pantalla se traduce: texto entero (exact), frases con
// datos (rules) y trozos (frags, por palabras completas). Lo marcado con data-noi18n no se toca (nombres, dorsales…).
// Si se cambia un texto en acta.js o motor.js, hay que cambiar aquí su clave. Pone también el selector ES/CA de la cabecera.
(() => {
'use strict';
const exact = {
  // Cabecera, inicio y pasos
  'Acta electrónica': 'Acta electrònica', 'Prototipo · reglas oficiales FIVB 6x6': 'Prototip · regles oficials FIVB 6x6', 'Cargando el acta…': "Carregant l'acta…",
  'Nueva acta': 'Acta nova', 'Prototipo para la FCVB: el acta en papel sigue siendo la oficial. Todo se guarda en este dispositivo y funciona sin conexión.': "Prototip per a la FCVB: l'acta en paper continua sent l'oficial. Tot es desa en aquest dispositiu i funciona sense connexió.",
  'Acta en blanco': 'Acta en blanc', 'Importar un acta (JSON)': 'Importa una acta (JSON)', 'O empieza desde uno de tus partidos': 'O comença des d’un dels teus partits',
  'Buscando tus partidos designados…': 'Buscant els teus partits designats…', 'Actas en este dispositivo': 'Actes en aquest dispositiu', 'Abrir': 'Obre', 'Borrar': 'Esborra',
  'Datos': 'Dades', 'Equipos': 'Equips', 'Sorteo y alineación': 'Sorteig i alineació', 'Partido': 'Partit', 'Firmas': 'Signatures', 'Acta': 'Acta',
  // Datos
  'Datos del partido': 'Dades del partit', 'Competición': 'Competició', 'Categoría': 'Categoria', 'Nº de partido': 'Núm. de partit', 'Fecha': 'Data', 'Hora': 'Hora',
  'Pabellón': 'Pavelló', 'Población': 'Població', 'Local': 'Local', 'Visitante': 'Visitant', 'Árbitros y mesa': 'Àrbitres i taula', '1er árbitro': '1r àrbitre', '2º árbitro': '2n àrbitre',
  'Anotador': 'Anotador', 'Anotador ayudante': 'Anotador ajudant', 'Juez de línea 1': 'Jutge de línia 1', 'Juez de línea 2': 'Jutge de línia 2', 'Formato': 'Format',
  'Partido al mejor de': 'Partit al millor de', '5 sets (gana quien llega a 3)': '5 sets (guanya qui n’arriba a 3)', '3 sets (gana quien llega a 2)': '3 sets (guanya qui n’arriba a 2)',
  'Puntos por set': 'Punts per set', 'Puntos del set decisivo': 'Punts del set decisiu', 'Cambios por set': 'Canvis per set', 'Tiempos por set': 'Temps morts per set',
  'Hay líbero': 'Hi ha líbero', 'Desactívalo en las categorías que juegan sin líbero.': 'Desactiva-ho a les categories que juguen sense líbero.',
  'Set obligatorio por jugador': 'Set obligatori per jugador',
  'Infantil (FCVB, Circular 011): cada jugador del acta tiene que jugar al menos un set completo. Al final se revisa y se puede corregir a mano.': "Infantil (FCVB, Circular 011): cada jugador de l'acta ha de jugar com a mínim un set complet. Al final es revisa i es pot corregir a mà.",
  'Mis actas': 'Les meves actes', 'Siguiente: equipos': 'Següent: equips', 'Atrás': 'Enrere', 'Siguiente: sorteo y alineación': 'Següent: sorteig i alineació',
  // Equipos
  '(local)': '(local)', '(visitante)': '(visitant)', 'Dorsal': 'Dorsal', 'Nombre y apellidos': 'Nom i cognoms', 'Cap.': 'Cap.', 'Líbero': 'Líbero', '+ Jugador': '+ Jugador', 'Quitar': 'Treu',
  'Dorsal (0 a 99, o 00)': 'Dorsal (de 0 a 99, o 00)', 'Nombre': 'Nom', 'Capitán': 'Capità', 'Entrenador': 'Entrenador', 'Segundo entrenador': 'Segon entrenador', 'Fisioterapeuta': 'Fisioterapeuta', 'Médico': 'Metge',
  'Dorsales y nombres tal como en la licencia. Marca el capitán y los líberos (como mucho 2).': 'Dorsals i noms tal com a la llicència. Marca el capità i els líberos (com a màxim 2).',
  'Dorsales y nombres tal como en la licencia. Marca el capitán (en este partido no hay líbero).': 'Dorsals i noms tal com a la llicència. Marca el capità (en aquest partit no hi ha líbero).',
  'Volver a cargar de iSquad': "Torna a carregar d'iSquad", 'Leyendo las plantillas de iSquad…': "Llegint les plantilles d'iSquad…",
  'Firmas antes del partido': 'Signatures abans del partit', 'Capitanes y entrenadores firman la plantilla.': 'Capitans i entrenadors signen la plantilla.', 'Sin firmar': 'Sense signar',
  'Firmar': 'Signa', 'Volver a firmar': 'Torna a signar', 'Guardar firma': 'Desa la signatura', 'Zona de firma': 'Zona de signatura',
  'Capitán local': 'Capità local', 'Capitán visitante': 'Capità visitant', 'Entrenador local': 'Entrenador local', 'Entrenador visitante': 'Entrenador visitant',
  // Sorteo y alineación
  'Sorteo': 'Sorteig', 'Saca primero': 'Serveix primer', 'A la izquierda del anotador (equipo A)': "A l'esquerra de l'anotador (equip A)", 'A la izquierda del anotador': "A l'esquerra de l'anotador",
  'Red arriba. I = zaguero derecho, el que saca.': 'Xarxa a dalt. I = zaguer dret, el que serveix.', 'Empezar el set 1': 'Comença el set 1', 'Incomparecencia…': 'Incompareixença…', 'Incomparecencia': 'Incompareixença',
  'El equipo que no se presenta pierde 0-3 (25-0 en cada set) y queda anotado en el acta.': "L'equip que no es presenta perd 0-3 (25-0 a cada set) i queda anotat a l'acta.",
  'Sorteo del set decisivo': 'Sorteig del set decisiu',
  // Partido
  'Tiempo': 'Temps', 'Cambio': 'Canvi', 'Sanción': 'Sanció', 'en pista': 'a la pista', 'Tiempos': 'Temps morts', 'Cambios': 'Canvis', 'En pista': 'A la pista', 'Banquillo': 'Banqueta',
  'Sanciones': 'Sancions', 'Les falta un set completo': 'Els falta un set complet', 'A nadie ✓': 'A ningú ✓', 'Mesa del anotador': "Taula de l'anotador", 'Último:': 'Últim:',
  'Todavía no hay nada que deshacer.': 'Encara no hi ha res per desfer.', 'Deshacer': 'Desfés', 'Punto': 'Punt', 'Repetición': 'Repetició', 'Incidencias': 'Incidències',
  'Observación': 'Observació', 'Directo': 'Directe', '● En directo': '● En directe', 'Ver acta': "Mostra l'acta", 'Teclado:': 'Teclat:', 'deshacer': 'desfer', 'Últimos sucesos': 'Últims fets',
  'Tiempo del set': 'Temps del set', 'Sets ganados': 'Sets guanyats', 'Saca': 'Serveix', 'Hay que sustituir al': 'Cal substituir el',
  'Sale': 'Surt', 'Entra': 'Entra', 'Hacer el cambio': 'Fes el canvi', 'Cancelar': 'Cancel·la', 'Cerrar': 'Tanca', 'Confirmar': 'Confirma', 'Anotar': 'Anota', 'Añadir': 'Afegeix',
  'Elige primero quién sale.': 'Tria primer qui surt.', 'Sustitución excepcional (lesión, o expulsado sin cambio legal posible)': 'Substitució excepcional (lesió, o expulsat sense canvi legal possible)',
  'No hay nadie en el banquillo.': 'No hi ha ningú a la banqueta.', 'Entra por (solo zagueros)': 'Entra per (només zaguers)', 'Un líbero no puede seguir…': 'Un líbero no pot continuar…', 'No puede seguir…': 'No pot continuar…',
  'Lesión, enfermedad, expulsión o descalificación. El líbero que no puede seguir ya no vuelve en el partido.': 'Lesió, malaltia, expulsió o desqualificació. El líbero que no pot continuar ja no torna al partit.',
  'Redesignar como líbero a': 'Redesigna com a líbero', '(un jugador que no esté en pista; o ninguno y se sigue sin líbero)': '(un jugador que no sigui a la pista; o cap i se segueix sense líbero)', 'Ninguno': 'Cap',
  'Tipo': 'Tipus', 'A quién': 'A qui', 'Amonestación': 'Amonestació', 'Castigo': 'Càstig', 'Expulsión': 'Expulsió', 'Descalificación': 'Desqualificació', 'Aviso por retraso': 'Avís per retard',
  'Castigo por retraso': 'Càstig per retard', 'Petición improcedente': 'Petició improcedent', 'Equipo': 'Equip', 'Segundo entrenador': 'Segon entrenador',
  'Da un punto y el saque al rival.': 'Dona un punt i el servei al rival.', 'Fuera el resto del set: hay que sustituirlo.': 'Fora la resta del set: cal substituir-lo.',
  'Fuera el resto del partido: hay que sustituirlo.': 'Fora la resta del partit: cal substituir-lo.', 'Se anota sin sanción; si se repite en el partido, es retraso.': 'Es anota sense sanció; si es repeteix al partit, és retard.',
  'Retrasos, incidencias, protestas, lesiones… Se añade al acta con la hora.': "Retards, incidències, protestes, lesions… S'afegeix a l'acta amb l'hora.", 'Texto': 'Text',
  'Falta de rotación o sacador incorrecto': 'Falta de rotació o servidor incorrecte', 'Punto y saque para el rival. El acta sigue con la rotación correcta.': "Punt i servei per al rival. L'acta continua amb la rotació correcta.",
  'Equipo incompleto o que se retira': 'Equip incomplet o que es retira',
  'El rival gana los puntos y sets que le faltan; cada equipo conserva lo que ya había ganado. No se puede deshacer de otra forma que con Deshacer.': "El rival guanya els punts i sets que li falten; cada equip conserva el que ja havia guanyat. Només es pot desfer amb Desfés.",
  'Emitir en directo': 'Emet en directe', 'Empezar el directo': 'Comença el directe', 'Dejar de emitir': "Deixa d'emetre", 'Copiar el enlace': "Copia l'enllaç", 'Enlace': 'Enllaç', 'En directo': 'En directe',
  'No se publica ningún nombre de jugador.': 'No es publica cap nom de jugador.', 'Se borra a los 2 días.': "S'esborra al cap de 2 dies.", 'Pásalo por WhatsApp o ábrelo en una TV.': 'Passa-ho per WhatsApp o obre-ho en una TV.',
  'Quien tenga el enlace verá el marcador en tiempo real: equipos, sets, puntos y quién saca.': "Qui tingui l'enllaç veurà el marcador en temps real: equips, sets, punts i qui serveix.",
  'Para emitir el marcador en directo tienes que haber entrado con tu cuenta de Vòlei EnXarxa en este navegador.': 'Per emetre el marcador en directe has d’haver entrat amb el teu compte de Vòlei EnXarxa en aquest navegador.', 'Entrar': 'Entra',
  // Entre sets y final
  'Deshacer el último punto': "Desfés l'últim punt", 'Observaciones': 'Observacions', 'Ninguna.': 'Cap.', 'Añadir observación': 'Afegeix una observació',
  'Por este orden: capitanes, anotador ayudante, anotador, 2º árbitro y 1er árbitro.': 'Per aquest ordre: capitans, anotador ajudant, anotador, 2n àrbitre i 1r àrbitre.',
  'Ver e imprimir el acta': "Mostra i imprimeix l'acta", 'Descargar los datos (JSON)': 'Baixa les dades (JSON)', 'Set obligatorio': 'Set obligatori', 'Sin set': 'Sense set', 'Marcado a mano': 'Marcat a mà',
  'Marcado solo: los titulares de cada set que no han sido cambiados durante el set. Si algún caso no cuenta o sí cuenta (por ejemplo, un cambio especial), corrígelo con la casilla; queda señalado con ✎.': "Marcat sol: els titulars de cada set que no han estat canviats durant el set. Si algun cas no compta o sí que compta (per exemple, un canvi especial), corregeix-lo amb la casella; queda assenyalat amb ✎.",
  'Todos los jugadores han jugado al menos un set completo.': 'Tots els jugadors han jugat com a mínim un set complet.', 'Jugador': 'Jugador', 'Total': 'Total', 'Min.': 'Min.',
  // Acta impresa
  'Imprimir o guardar en PDF': 'Imprimeix o desa en PDF', 'Volver': 'Torna', 'Categoria': 'Categoria', 'Formato': 'Format', 'Titular': 'Titular', 'Saque': 'Servei', 'Puntos': 'Punts',
  'Anot. ayudante': 'Anot. ajudant', 'Jueces de línea': 'Jutges de línia', 'Sorteos': 'Sorteigs', 'Quién': 'Qui', 'Marcador': 'Marcador', 'Inicio': 'Inici', 'Fin': 'Final', 'Duración': 'Durada', 'Ganador': 'Guanyador',
  'Cumple': 'Compleix', 'NO': 'NO', 'Sí': 'Sí', 'X = set completo (titular sin cambio) · * = corregido a mano por el anotador.': "X = set complet (titular sense canvi) · * = corregit a mà per l'anotador.",
  // Errores de arranque
  'No se ha podido abrir': "No s'ha pogut obrir", 'Volver a intentarlo': 'Torna-ho a provar', 'Descargar los datos de esta acta': "Baixa les dades d'aquesta acta", 'El acta no arranca': "L'acta no arrenca",
  'Tus actas siguen guardadas en este dispositivo.': 'Les teves actes continuen desades en aquest dispositiu.', 'Recargar sin caché': 'Recarrega sense memòria cau',
  // Avisos (toast)
  'Acta importada.': 'Acta importada.', 'Directo terminado.': 'Directe acabat.', 'Doble toque: no se ha contado el segundo punto.': "Doble toc: no s'ha comptat el segon punt.", 'Enlace copiado.': 'Enllaç copiat.',
  'Escribe el nombre de los 2 equipos.': 'Escriu el nom dels 2 equips.', 'Escribe el nombre.': 'Escriu el nom.', 'Falta de rotación anotada: punto para el rival.': 'Falta de rotació anotada: punt per al rival.',
  'Firma en el recuadro.': 'Signa al requadre.', 'Indica quién saca y quién está a la izquierda.': "Indica qui serveix i qui és a l'esquerra.", 'No hay nada que deshacer.': 'No hi ha res per desfer.',
  'No se encuentra esa acta.': "No es troba aquesta acta.", 'No se ha podido actualizar el directo (¿sin conexión?). Se reintenta con el siguiente punto.': "No s'ha pogut actualitzar el directe (sense connexió?). Es torna a provar amb el punt següent.",
  'No se ha podido guardar en el dispositivo.': "No s'ha pogut desar al dispositiu.", 'Observación añadida.': 'Observació afegida.', 'Repetición anotada: sin punto para nadie.': 'Repetició anotada: sense punt per a ningú.',
  'Anotado.': 'Anotat.', 'Sin conexión: escribe las plantillas a mano.': 'Sense connexió: escriu les plantilles a mà.',
  // Motor (motivos de rechazo)
  'Antes hay que sustituir al jugador expulsado o descalificado.': "Abans cal substituir el jugador expulsat o desqualificat.", 'Cada equipo necesita al menos 6 jugadores que no sean líberos.': 'Cada equip necessita com a mínim 6 jugadors que no siguin líberos.',
  'Como mucho 2 líberos.': 'Com a màxim 2 líberos.', 'El capitán no puede ser líbero.': 'El capità no pot ser líbero.', 'El líbero entra con el set en marcha.': 'El líbero entra amb el set en marxa.',
  'El líbero no puede sacar: no puede entrar por el jugador que va a sacar.': 'El líbero no pot servir: no pot entrar pel jugador que ha de servir.', 'El líbero no puede ser el capitán.': 'El líbero no pot ser el capità.',
  'El líbero solo puede sustituir a un zaguero (posiciones I, V y VI).': 'El líbero només pot substituir un zaguer (posicions I, V i VI).', 'El partido ya ha acabado.': 'El partit ja ha acabat.',
  'El primer retraso es un aviso por retraso.': 'El primer retard és un avís per retard.', 'El set no está en juego.': 'El set no està en joc.', 'El set ya está en marcha.': 'El set ja està en marxa.', 'El set ya ha empezado.': 'El set ja ha començat.',
  'El sorteo se hace antes del primer set o del decisivo.': 'El sorteig es fa abans del primer set o del decisiu.', 'En este partido no hay líbero (está desactivado en el formato).': 'En aquest partit no hi ha líbero (està desactivat al format).',
  'En este partido no hay líbero.': 'En aquest partit no hi ha líbero.', 'Entre dos cambios de líbero tiene que haber un rally completo.': 'Entre dos canvis de líbero hi ha d’haver un ral·li complet.', 'Ese líbero ya está en pista.': 'Aquest líbero ja és a la pista.',
  'Ese set no se ha jugado.': "Aquest set no s'ha jugat.", 'Este equipo ya ha tenido su amonestación: la siguiente conducta incorrecta es castigo.': "Aquest equip ja ha tingut la seva amonestació: la propera conducta incorrecta és càstig.",
  'Este equipo ya tiene el aviso por retraso: el siguiente retraso es castigo por retraso.': "Aquest equip ja té l'avís per retard: el proper retard és càstig per retard.", 'Faltan las alineaciones.': 'Falten les alineacions.',
  'Hay dorsales repetidos en la alineación.': "Hi ha dorsals repetits a l'alineació.", 'Hay dorsales repetidos.': 'Hi ha dorsals repetits.', 'La alineación tiene 6 jugadores.': "L'alineació té 6 jugadors.",
  'Las plantillas se cierran al empezar el partido.': 'Les plantilles es tanquen en començar el partit.', 'Las repeticiones se anotan con el set en marcha.': "Les repeticions s'anoten amb el set en marxa.",
  'Las sustituciones se hacen con el set en marcha.': 'Les substitucions es fan amb el set en marxa.', 'Los tiempos se piden con el set en marcha.': 'Els temps morts es demanen amb el set en marxa.', 'No hay ningún líbero en pista.': 'No hi ha cap líbero a la pista.',
  'Se anota con el set en marcha.': "S'anota amb el set en marxa.", 'Se hace con el partido en marcha.': 'Es fa amb el partit en marxa.', 'Solo hay sorteo antes del set decisivo.': 'Només hi ha sorteig abans del set decisiu.',
  'Solo puede haber un capitán.': 'Només hi pot haver un capità.', 'Ya hay un líbero en pista: primero tiene que salir, o cámbialo por el otro líbero.': "Ja hi ha un líbero a la pista: primer ha de sortir, o canvia'l per l'altre líbero.",
  '¿A quién es la sanción?': 'A qui és la sanció?', '¿Para qué equipo?': 'Per a quin equip?', '¿Qué equipo ha cometido la falta?': 'Quin equip ha comès la falta?', '¿Qué equipo?': 'Quin equip?', 'Falta el sorteo.': 'Falta el sorteig.', 'Falta saber quién saca.': 'Falta saber qui serveix.',
  // Directo
  'Este directo ha terminado o ya no existe.': 'Aquest directe ha acabat o ja no existeix.', 'Este enlace no es válido.': 'Aquest enllaç no és vàlid.', 'Sin directo': 'Sense directe', 'Final': 'Final',
  'Conectando con el directo…': 'Connectant amb el directe…', 'No se puede conectar con el directo. Se reintenta cada pocos segundos…': 'No es pot connectar amb el directe. Es torna a provar cada pocs segons…',
  // e-Scoresheet (4-nov-2026): descanso, aviso de líbero, golden set, espectadores, correcciones y aprobación
  "Descanso entre sets (min)": "Descans entre sets (min)", "Descanso entre el 2º y el 3º (min)": "Descans entre el 2n i el 3r (min)", "15 si el local pide el intermedio promocional.": "15 si el local demana l'intermedi promocional.", "Avisar cuando puede entrar el líbero": "Avisa quan pot entrar el líbero", "Cuando el equipo pasa a recibir, propone por quién entra.": "Quan l'equip passa a rebre, proposa per qui entra.", "Entrada del líbero": "Entrada del líbero", "Jugar el golden set": "Juga el golden set", "Solo si hay que desempatar (por ejemplo, una eliminatoria a doble partido igualada): un set más a 15, con sorteo. No cambia el resultado de este partido.": "Només si cal desempatar (per exemple, una eliminatòria a doble partit igualada): un set més a 15, amb sorteig. No canvia el resultat d'aquest partit.", "¿Jugar el golden set? Es un set más para desempatar; el resultado de este partido no cambia.": "Vols jugar el golden set? És un set més per desempatar; el resultat d'aquest partit no canvia.", "Espectadores": "Espectadors", "Número de espectadores": "Nombre d'espectadors", "Espectadores guardados.": "Espectadors desats.", "Correcciones del anotador": "Correccions de l'anotador", "Todo lo deshecho durante el partido. Queda en el acta y no se puede borrar.": "Tot el que s'ha desfet durant el partit. Queda a l'acta i no es pot esborrar.", "Correcciones del anotador (deshecho durante el partido)": "Correccions de l'anotador (desfet durant el partit)", "Aprobar y cerrar el acta": "Aprova i tanca l'acta", "Antes, revisa el acta con \"Ver e imprimir\". Al aprobarla queda cerrada: no se puede anotar ni deshacer nada más (las firmas, sí). Contraseña de prueba para todos: 0000.": "Abans, revisa l'acta amb \"Mostra i imprimeix\". Quan s'aprova queda tancada: no s'hi pot anotar ni desfer res més (les signatures, sí). Contrasenya de prova per a tothom: 0000.", "¿Aprobar y cerrar el acta? Después ya no se podrá cambiar nada.": "Vols aprovar i tancar l'acta? Després ja no s'hi podrà canviar res.", "Acta aprobada": "Acta aprovada", "Acta aprobada y cerrada.": "Acta aprovada i tancada.", "Enviarla a la FCVB todavía no se puede: la FCVB no tiene dónde recibirla. De momento, imprímela o guárdala en PDF.": "Encara no es pot enviar a la FCVB: la FCVB no té on rebre-la. De moment, imprimeix-la o desa-la en PDF.", "Reabrir el acta (1er árbitro)": "Reobre l'acta (1r àrbitre)", "Reabrir el acta": "Reobre l'acta", "Reabrir": "Reobre", "Queda anotado en las correcciones del acta.": "Queda anotat a les correccions de l'acta.", "Contraseña del 1er árbitro": "Contrasenya del 1r àrbitre", "La contraseña del 1er árbitro no es correcta.": "La contrasenya del 1r àrbitre no és correcta.", "Acta reabierta.": "Acta reoberta.", "Sin aprobar": "Sense aprovar", "Estado": "Estat", "El acta está aprobada y cerrada: ya no se puede cambiar.": "L'acta està aprovada i tancada: ja no es pot canviar.",
  'Color local': 'Color local', 'Color visitante': 'Color visitant', 'Líbero local': 'Líbero local', 'Líbero visitante': 'Líbero visitant',
  'Iniciar partido de prueba': 'Inicia un partit de prova', 'prueba': 'prova', 'Partido de prueba': 'Partit de prova', 'Partido de prueba listo: haz el sorteo y la alineación.': "Partit de prova a punt: fes el sorteig i l'alineació.", 'Pabellón de pruebas': 'Pavelló de proves',
  "El líbero sale de pista": "El líbero surt de la pista", "Entra": "Entra", "Entendido": "Entesos", "Vuelve el jugador al que sustituía: es el único que puede entrar por el líbero (o el otro líbero, que tampoco puede jugar delante). FIVB 19.3.2.": "Torna el jugador a qui substituïa: és l'únic que pot entrar pel líbero (o l'altre líbero, que tampoc no pot jugar davant). FIVB 19.3.2.", "Avisos del líbero": "Avisos del líbero", "Cuando el equipo pasa a recibir, propone por quién entra; cuando pasa delante, avisa de que sale y quién vuelve.": "Quan l'equip passa a rebre, proposa per qui entra; quan passa davant, avisa que surt i qui torna.", "Capitán en juego": "Capità en joc", "Capitán": "Capità",
  "Entrenador ayudante": "Entrenador assistent", "Psicólogo": "Psicòleg", "Preparador físico": "Preparador físic", "Masajista": "Massatgista", "Delegado de equipo": "Delegat d'equip", "Va a observaciones, sin DNI (FCVB, Circular 003).": "Va a observacions, sense DNI (FCVB, Circular 003).", "Cuerpo técnico: primer entrenador y, como mucho, 3 más.": "Cos tècnic: primer entrenador i, com a molt, 3 més.", "Por este orden: anotador (y ayudante), capitanes, 2º árbitro y 1er árbitro (FIVB 27.2.3.3).": "Per aquest ordre: anotador (i ajudant), capitans, 2n àrbitre i 1r àrbitre (FIVB 27.2.3.3).", "Se puede alargar hasta 10 si lo pide el organizador (FIVB 18.1).": "Es pot allargar fins a 10 si ho demana l'organitzador (FIVB 18.1).", "Puntos del infractor cuando la cometió (si se sabe)": "Punts de l'infractor quan la va cometre (si se sap)", "Se anulan los puntos que ha ganado desde entonces (FIVB 7.7.2). Vacío: solo punto y saque.": "S'anul·len els punts que ha guanyat des d'aleshores (FIVB 7.7.2). Buit: només punt i servei.",
  "Categoría inferior": "Categoria inferior", "Y · Júnior": "Y · Júnior", "J · Juvenil": "J · Juvenil", "C · Cadete": "C · Cadet", "I · Infantil": "I · Infantil", "A · Alevín": "A · Aleví", "Cat.": "Cat.", "Categoría inferior por edad (FCVB, Circular 004)": "Categoria inferior per edat (FCVB, Circular 004)", "Retrasos, incidencias, lesiones… Se añade al acta con la hora.": "Retards, incidències, lesions… S'afegeix a l'acta amb l'hora.", "Frase hecha (FCVB, Circular 010)": "Frase feta (FCVB, Circular 010)", "— Escribir a mano —": "— Escriure a mà —", "Retraso: partido federado anterior": "Retard: partit federat anterior", "Retraso: partido escolar anterior": "Retard: partit escolar anterior", "Retraso: partido de otro deporte": "Retard: partit d'un altre esport", "Retraso: un equipo llega tarde": "Retard: un equip arriba tard", "CTA-1 de todo el equipo": "CTA-1 de tot l'equip", "CTA-1 de algunos componentes": "CTA-1 d’alguns components", "DNI que no coincide con la autorización": "DNI que no coincideix amb l'autorització", "Fotografía por falta de documento": "Fotografia per manca de document", "Inscrito que no se presenta": "Inscrit que no es presenta", "Abandona el partido": "Abandona el partit", "Lesión": "Lesió", "Lesionado antes del partido": "Lesionat abans del partit", "Uniformidad: camiseta diferente": "Uniformitat: samarreta diferent", "Uniformidad: líberos con colores invertidos": "Uniformitat: líberos amb colors invertits", "Uniformidad: dorsal con esparadrapo": "Uniformitat: dorsal amb esparadrap", "No juega el mínimo de sets": "No juga el mínim de sets", "Minutos de retraso": "Minuts de retard", "Jugador": "Jugador", "Dorsales": "Dorsals", "Deporte": "Esport", "Cuántos": "Quants", "Equipo": "Equip", "Falta algún dato (___). ¿Añadir igualmente?": "Falta alguna dada (___). Vols afegir-la igualment?", "+ Jugador": "+ Jugador",
};
// Trozos con datos (nombres, dorsales, marcadores): se cambian dentro del texto, por palabras completas. De más largo a más corto.
const frags = [
  ['Como mucho 3 oficiales además del primer entrenador.', 'Com a molt 3 oficials a més del primer entrenador.'], ['presenta delegado/a', 'presenta delegat/da'], ['anulados sus puntos desde el', 'anul·lats els seus punts des del'],
  ['capitán en juego de', 'capità en joc de'],
  ['Acta reabierta', 'Acta reoberta'], ['estaba aprobada desde las', 'estava aprovada des de les'], ['gana', 'guanya'], ['Golden set', 'Golden set'],
  ['está fuera por el líbero: primero tiene que salir el líbero', "és fora pel líbero: primer ha de sortir el líbero"], ['es titular: solo puede volver a pista por el suplente que entró por él', 'és titular: només pot tornar a la pista pel suplent que va entrar per ell'],
  ['ya ha jugado este set: solo puede volver por el titular por el que entró', 'ja ha jugat aquest set: només pot tornar pel titular pel qual va entrar'], ['ya salió y volvió en este set: no puede volver a salir', 'ja va sortir i va tornar en aquest set: no pot tornar a sortir'],
  ['está en pista: solo se puede redesignar a quien no esté en pista', 'és a la pista: només es pot redesignar qui no sigui a la pista'], ['ya es líbero: no hace falta redesignarlo', 'ja és líbero: no cal redesignar-lo'],
  ['es líbero: no puede estar en la alineación inicial', "és líbero: no pot ser a l'alineació inicial"], ['no puede salir con una sustitución normal', 'no pot sortir amb una substitució normal'], ['no puede volver a jugar en este partido', 'no pot tornar a jugar en aquest partit'],
  ['el titular por el que entró', 'el titular pel qual va entrar'], ['solo puede volver el', 'només pot tornar el'], ['no está inscrito como líbero', 'no està inscrit com a líbero'], ['está expulsado en este set', 'està expulsat en aquest set'],
  ['no está en el acta', "no és a l'acta"], ['no está en pista', 'no és a la pista'], ['ya está en pista', 'ja és a la pista'], ['no puede entrar', 'no pot entrar'], ['no puede jugar', 'no pot jugar'], ['ya no juega', 'ja no juga'], ['no es líbero', 'no és líbero'],
  ['sustituciones de este set', 'substitucions en aquest set'], ['tiempos de este set', 'temps morts en aquest set'], ['Ya ha hecho las', 'Ja ha fet les'], ['Ya ha pedido los', 'Ja ha demanat els'],
  ['Tiene que ser de 0 a 99, o 00', 'Ha de ser de 0 a 99, o 00'], ['Dorsal no válido', 'Dorsal no vàlid'], ['dorsal no válido', 'dorsal no vàlid'], ['falta el dorsal de', 'falta el dorsal de'], ['o quítalo con ✕', 'o treu-lo amb ✕'],
  ['hacen falta al menos 6 jugadores que no sean líberos', 'calen com a mínim 6 jugadors que no siguin líberos'], ['marca quién es el capitán', 'marca qui és el capità'], ['Falta completar la alineación de', "Falta completar l'alineació de"],
  ['no tiene líbero que pueda jugar', 'no té cap líbero que pugui jugar'], ['Ese archivo no es un acta válida', 'Aquest fitxer no és una acta vàlida'],
  ['Plantilla de iSquad', "Plantilla d'iSquad"], ['jugadores (sin las bajas). La web no da los dorsales: ponlos y quita con ✕ a quien no esté convocado', 'jugadors (sense les baixes). El web no dona els dorsals: posa’ls i treu amb ✕ qui no estigui convocat'],
  ['No he encontrado en iSquad la plantilla de', "No he trobat a iSquad la plantilla de"], ['escríbela a mano', "escriu-la a mà"], ['Dorsal no válido de una versión anterior', "Dorsal no vàlid d'una versió anterior"],
  ['Pon un dorsal de 0 a 99, o 00', 'Posa un dorsal de 0 a 99, o 00'], ['iSquad no ha respondido a tiempo: escribe las plantillas a mano o vuelve a cargarlas', "iSquad no ha respost a temps: escriu les plantilles a mà o torna-les a carregar"],
  ['Esta acta no se puede mostrar con esta versión.', 'Aquesta acta no es pot mostrar amb aquesta versió.'], ['La página no ha arrancado bien.', 'La pàgina no ha arrencat bé.'], ['Tus datos siguen guardados en este dispositivo.', 'Les teves dades continuen desades en aquest dispositiu.'],
  ['No se puede abrir con esta versión', 'No es pot obrir amb aquesta versió'], ['La página está tardando demasiado en arrancar.', 'La pàgina triga massa a arrencar.'], ['Detalle', 'Detall'], ['Navegador', 'Navegador'],
  // Partido
  ['Cambio de campo. Saca primero', 'Canvi de camp. Serveix primer'], ['Set decisivo: hay sorteo, se juega a', 'Set decisiu: hi ha sorteig, es juga a'], ['y se cambia de campo cuando un equipo llega a', 'i es canvia de camp quan un equip arriba a'],
  ['Sustituciones en este set', 'Substitucions en aquest set'], ['Sustitución excepcional', 'Substitució excepcional'], ['Hay que sustituir al', 'Cal substituir el'], ['Nadie puede entrar por el', 'Ningú pot entrar pel'], ['con un cambio normal', 'amb un canvi normal'],
  ['Sale el líbero (vuelve el', 'Surt el líbero (torna el'], ['Cambiar por el', 'Canvia pel'], ['En pista: el', 'A la pista: el'], ['Sigue jugando el otro líbero, el', "Continua jugant l'altre líbero, el"], ['Líbero que no puede seguir', 'Líbero que no pot continuar'],
  ['es ahora líbero', 'ara és líbero'], ['Repetición de la jugada', 'Repetició de la jugada'], ['repetición de la jugada', 'repetició de la jugada'], ['Falta de rotación de', 'Falta de rotació de'], ['falta de rotación de', 'falta de rotació de'],
  ['La comete', 'La comet'], ['Último:', 'Últim:'], ['punto para el rival', 'punt per al rival'], ['punto para', 'punt per a'], ['punto a', 'punt a'], ['Punto', 'Punt'],
  ['Empieza el set', 'Comença el set'], ['Empezar el set', 'Comença el set'], ['Fin del set', 'Final del set'], ['Al empezar el set', 'En començar el set'], ['Alineación', 'Alineació'], ['Plantilla', 'Plantilla'], ['Sorteo', 'Sorteig'],
  ['Amonestación al', 'Amonestació al'], ['Castigo al', 'Càstig al'], ['Expulsión al', 'Expulsió al'], ['Descalificación al', 'Desqualificació al'], ['Aviso por retraso al', 'Avís per retard al'], ['Castigo por retraso al', 'Càstig per retard al'],
  ['Amonestación a', 'Amonestació a'], ['Castigo a', 'Càstig a'], ['Expulsión a', 'Expulsió a'], ['Descalificación a', 'Desqualificació a'], ['al equipo', "a l'equip"], ['al entrenador', "a l'entrenador"], ['al segundo entrenador', 'al segon entrenador'],
  ['al fisioterapeuta', 'al fisioterapeuta'], ['al médico', 'al metge'], ['Petición improcedente', 'Petició improcedent'], ['Amonestación', 'Amonestació'], ['Expulsión', 'Expulsió'], ['Descalificación', 'Desqualificació'], ['Aviso por retraso', 'Avís per retard'], ['Castigo por retraso', 'Càstig per retard'], ['Castigo', 'Càstig'],
  ['Cambio', 'Canvi'], ['Sanción', 'Sanció'], ['Tiempo', 'Temps'], ['sale', 'surt'], ['Líbero', 'Líbero'], ['entra', 'entra'], ['no puede seguir', 'no pot continuar'], ['nuevo líbero', 'nou líbero'], ['el líbero', 'el líbero'],
  ['equipo incompleto', 'equip incomplet'], ['Incomparecencia de', 'Incompareixença de'], ['No se presenta', 'No es presenta'], ['incompleto', 'incomplet'], ['no puede seguir (equipo incompleto o se retira)? El partido acaba aquí.', 'no pot continuar (equip incomplet o es retira)? El partit acaba aquí.'],
  ['Por incomparecencia de', 'Per incompareixença de'], ['se queda con el equipo incompleto en el set', "es queda amb l'equip incomplet al set"], ['se queda con el equipo incompleto', "es queda amb l'equip incomplet"], ['el rival gana los puntos y sets que faltan', 'el rival guanya els punts i sets que falten'],
  ['Marcado como completo', 'Marcat com a complet'], ['marcado como completo', 'marcat com a complet'], ['desmarcado como completo', 'desmarcat com a complet'], ['set', 'set'], ['completo', 'complet'],
  ['Sin ningún set completo', 'Sense cap set complet'], ['Set obligatorio', 'Set obligatori'], ['Posiciones de', 'Posicions de'], ['tocar para cambiarlo', 'toca per canviar-lo'], ['cambiarlo', 'canviar-lo'], ['posición', 'posició'], ['Posición', 'Posició'], ['Gana', 'Guanya'], ['Deshecho', 'Desfet'], ['¿Deshacer', 'Vols desfer'],
  ['¿Borrar esta acta de este dispositivo?', 'Vols esborrar aquesta acta d’aquest dispositiu?'], ['¿Seguro', 'Segur'], ['¿Quitar a', 'Vols treure'], ['¿Volver a cargar las plantillas de iSquad? Se pierden los cambios de esta pantalla.', "Vols tornar a carregar les plantilles d'iSquad? Es perden els canvis d'aquesta pantalla."],
  ['Firma:', 'Signatura:'], ['(antes)', '(abans)'], ['Capitán local', 'Capità local'], ['Capitán visitante', 'Capità visitant'], ['Entrenador visitante', 'Entrenador visitant'],
  ['Sin empezar', 'Sense començar'], ['En juego · sets', 'En joc · sets'], ['Final', 'Final'], ['No se puede abrir con esta versión', 'No es pot obrir amb aquesta versió'],
  ['duración del partido', 'durada del partit'], ['Inicio', 'Inici'], ['fin', 'final'], ['Sets:', 'Sets:'], ['Tiempos:', 'Temps morts:'], ['Cambios:', 'Canvis:'],
  ['Acta del partido', 'Acta del partit'], ['(saca)', '(serveix)'], ['(recibe)', '(rep)'], ['inicio', 'inici'], ['cambio de campo a los', 'canvi de camp als'], ['(decisivo)', '(decisiu)'], ['decisivo', 'decisiu'],
  ['Set 1: saca', 'Set 1: serveix'], ['saca', 'serveix'], ['a la izquierda', "a l'esquerra"], ['Mejor de', 'Millor de'], ['Acta electrónica de Vòlei EnXarxa (prototipo, no oficial). Generada el', "Acta electrònica de Vòlei EnXarxa (prototip, no oficial). Generada el"],
  ['Por el', 'Pel'], ['castigo por retraso', 'càstig per retard'], ['castigo', 'càstig'], ['Local – Visitante', 'Local – Visitant'], ['Visitante', 'Visitant'], ['salió', 'va sortir'], ['ya jugó', 'ja va jugar'], ['por el líbero', 'pel líbero'], ['por', 'per'], ['en pista por el', 'a la pista pel'],
  ['Descanso · empieza el set', 'Descans · comença el set'], ['Final · gana', 'Final · guanya'], ['Actualizado hace', 'Actualitzat fa'], ['Sin conexión: se reintenta…', 'Sense connexió: es torna a provar…'], ['Acta electrónica de Vòlei EnXarxa', 'Acta electrònica de Vòlei EnXarxa'],
];
const rules = [
  [/^(.+) inscribe jugadores cadetes: (.+)\.$/, (_, a, b) => `${a} inscriu jugadors cadets: ${b}.`],
  [/^Categoría no válida para el (\d+): tiene que ser Y, J, C, I o A\.$/, (_, a) => `Categoria no vàlida per al ${a}: ha de ser Y, J, C, I o A.`],
  [/^(.+): (\d+)º tiempo, el último del set\.$/, (_, a, b) => `${a}: ${b}r temps mort, l'últim del set.`],
  [/^(.+): (\d+)º cambio, el último del set\.$/, (_, a, b) => `${a}: ${b}è canvi, l'últim del set.`], [/^(.+): (\d+)º cambio\.$/, (_, a, b) => `${a}: ${b}è canvi.`],
  [/^Falta de rotación anotada: punto para el rival y (\d+) puntos? anulados?\.$/, (_, a) => `Falta de rotació anotada: punt per al rival i ${a} punt${a === '1' ? '' : 's'} anul·lat${a === '1' ? '' : 's'}.`],
  [/^Queda el otro líbero, el (\d+): solo se puede redesignar si tampoco puede jugar \(FIVB 19\.4\.3\.1\)\.$/, (_, a) => `Queda l'altre líbero, el ${a}: només es pot redesignar si tampoc no pot jugar (FIVB 19.4.3.1).`],
  [/^Como mucho (\d+) jugadores en el acta( \(líberos incluidos\))?\.$/, (_, a, b) => `Com a molt ${a} jugadors a l'acta${b ? ' (líberos inclosos)' : ''}.`],
  [/^El marcador del infractor en el momento de la falta tiene que ser de 0 a (\d+)\.$/, (_, a) => `El marcador de l'infractor en el moment de la falta ha de ser de 0 a ${a}.`],
  [/^El líbero (\d+) pasa delante \(posición IV\) y tiene que salir\.$/, (_, a) => `El líbero ${a} passa davant (posició IV) i ha de sortir.`],
  [/^: el líbero (\d+) pasa delante \(posición IV\) y tiene que salir\.$/, (_, a) => `: el líbero ${a} passa davant (posició IV) i ha de sortir.`],
  [/^El capitán \((\d+)\) no está en pista\. Capitán en juego:$/, (_, a) => `El capità (${a}) no és a la pista. Capità en joc:`],
  [/^El capitán de (.+) \((\d+)\) ha salido de pista: hay que saber quién es el capitán en juego\.$/, (_, a, b) => `El capità de ${a} (${b}) ha sortit de la pista: cal saber qui és el capità en joc.`],
  [/^Capitán en juego: el (\d+)\.$/, (_, a) => `Capità en joc: el ${a}.`], [/^Capitán en juego (.+): el (\d+)$/, (_, a, b) => `Capità en joc ${a}: el ${b}`],
  [/^El capitán, el (\d+), está en pista: él es el capitán en juego\.$/, (_, a) => `El capità, el ${a}, és a la pista: ell és el capità en joc.`],
  // e-Scoresheet (4-nov-2026)
  [/^Descanso: (\d+:\d\d)$/, (_, a) => `Descans: ${a}`], [/^Descanso acabado hace (\d+:\d\d)$/, (_, a) => `Descans acabat fa ${a}`],
  [/^Líbero (\d+): ¿entra por…\?$/, (_, a) => `Líbero ${a}: entra per…?`],
  [/^Golden set \(el partido ha acabado (\d+-\d+)\)$/, (_, a) => `Golden set (el partit ha acabat ${a})`],
  [/^Desempate a un set: hay sorteo, se juega a (\d+) y se cambia de campo cuando un equipo llega a (\d+)\. No cambia el resultado del partido\.$/, (_, a, b) => `Desempat a un set: hi ha sorteig, es juga a ${a} i es canvia de camp quan un equip arriba a ${b}. No canvia el resultat del partit.`],
  [/^Contraseña · (.+)$/, (_, a) => `Contrasenya · ${tr(a)}`],
  [/^La contraseña de (.+) no es correcta\.$/, (_, a) => `La contrasenya ${({ anotador: 'anotador', 'capitán local': 'capità local', 'capitán visitante': 'capità visitant', '1er árbitro': '1r àrbitre' })[a] ? 'de ' + ({ anotador: 'anotador', 'capitán local': 'capità local', 'capitán visitante': 'capità visitant', '1er árbitro': '1r àrbitre' })[a] : 'de ' + a} no és correcta.`.replace('de anotador', "de l'anotador")],
  [/^Aprobada y cerrada el (.+?) por anotador, capitanes y 1er árbitro\. Ya no se puede anotar ni deshacer nada\.$/, (_, a) => `Aprovada i tancada el ${a} per l'anotador, els capitans i el 1r àrbitre. Ja no s'hi pot anotar ni desfer res.`],
  [/^Aprobada y cerrada el (.+?) \(anotador, capitanes y 1er árbitro\)$/, (_, a) => `Aprovada i tancada el ${a} (anotador, capitans i 1r àrbitre)`],
  [/^No he encontrado en iSquad la plantilla de (.+) y (.+): escríbela a mano\.$/, (_, a, b) => `No he trobat a iSquad la plantilla de ${a} i ${b}: escriu-les a mà.`],
  [/^No he encontrado en iSquad la plantilla de (.+): escríbela a mano\.$/, (_, a) => `No he trobat a iSquad la plantilla de ${a}: escriu-la a mà.`],
  [/^Cambio · (.+)$/, (_, a) => `Canvi · ${a}`], [/^Líbero · (.+)$/, (_, a) => `Líbero · ${a}`], [/^Sanción · (.+)$/, (_, a) => `Sanció · ${a}`],
  [/^Firma: (.+)$/, (_, a) => `Signatura: ${tr(a)}`], [/^Tiempos: (\d+) de (\d+)$/, (_, a, b) => `Temps morts: ${a} de ${b}`], [/^Cambios: (\d+) de (\d+)$/, (_, a, b) => `Canvis: ${a} de ${b}`],
  [/^Puntos (.+)$/, (_, a) => `Punts ${a}`], [/^(\d+) min$/, (_, a) => `${a} min`],
];
let LANG = 'es';
try { LANG = localStorage.getItem('liq-lang') || ((navigator.language || '').toLowerCase().startsWith('ca') ? 'ca' : 'es'); } catch (e) {}
const FR = frags.sort((a, b) => b[0].length - a[0].length).map(([a, b]) => [new RegExp(`(^|[^\\p{L}\\p{N}])${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}\\p{N}])`, 'gu'), b]);
function tr(text) {
  if (LANG !== 'ca' || typeof text !== 'string') return text;
  const k = text.trim(); if (!k || !/[a-záéíóúñ]/i.test(k)) return text;
  let out = exact[k];
  if (out == null) for (const [re, rep] of rules) { const m = k.match(re); if (m) { out = rep(...m); break; } }
  if (out == null) { out = k; for (const [re, b] of FR) out = out.replace(re, (_, p) => p + b); }
  return out === k ? text : text.replace(k, out);
}
window.trActa = tr; window.ACTA_LANG = LANG;
const ATTR = ['placeholder', 'title', 'aria-label'];
const HECHO = new WeakSet();
function traduce(n) {
  if (LANG !== 'ca' || !n) return;
  if (n.nodeType === 3) { const p = n.parentElement; if (!p || p.closest('script,style,[data-noi18n],textarea')) return; if (HECHO.has(n)) return; const v = tr(n.nodeValue); if (v !== n.nodeValue) { n.nodeValue = v; } HECHO.add(n); return; }
  if (n.nodeType !== 1 || n.closest?.('[data-noi18n]')) return;
  for (const a of ATTR) { const v = n.getAttribute(a); if (v) { const t = tr(v); if (t !== v) n.setAttribute(a, t); } }
  n.childNodes.forEach(traduce);
}
document.documentElement.lang = LANG;
const arranca = () => {
  // Selector ES/CA en la cabecera, como en las páginas legales
  const cab = document.querySelector('.board .in');
  if (cab && !cab.querySelector('.lang')) {
    const d = document.createElement('div'); d.className = 'lang'; d.setAttribute('role', 'group'); d.setAttribute('aria-label', 'Idioma'); d.setAttribute('data-noi18n', '');
    d.innerHTML = '<button type="button" data-set="es">ES</button><button type="button" data-set="ca">CA</button>';
    d.querySelectorAll('button').forEach((b) => { b.setAttribute('aria-pressed', String(b.dataset.set === LANG)); b.onclick = () => { try { localStorage.setItem('liq-lang', b.dataset.set); } catch (e) {} location.reload(); }; });
    cab.appendChild(d);
  }
  if (LANG !== 'ca') return;
  traduce(document.body);
  new MutationObserver((ms) => { for (const m of ms) { if (m.type === 'characterData') { HECHO.delete(m.target); traduce(m.target); } else m.addedNodes.forEach(traduce); } }).observe(document.body, { childList: true, subtree: true, characterData: true });
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arranca); else arranca();
})();
