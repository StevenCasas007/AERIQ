/* AERIQ · Editor 2D de redes de ventilación (primera versión funcional) */
(() => {
  'use strict';
  const $ = (s, r=document) => r.querySelector(s);
  const NS = 'http://www.w3.org/2000/svg';
  const KEY = 'aeriq:mine-projects:v1';
  const state = { projects: [], current: null, tool: 'select', firstNode: null, selected: null, drag: null, bgUrl: null };
  const canvas = $('#mineCanvas');
  if (!canvas) return;
  const store = {
    read(){ try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } },
    write(){ try { localStorage.setItem(KEY, JSON.stringify(state.projects)); return true; } catch { toast('No se pudo guardar: almacenamiento lleno o bloqueado'); return false; } }
  };
  const toast = msg => { const el=$('#toast'); if(!el) return; el.textContent=msg; el.classList.add('show'); clearTimeout(toast.t); toast.t=setTimeout(()=>el.classList.remove('show'),2200); };
  const uid = p => p + '-' + Math.random().toString(36).slice(2,8).toUpperCase();
  const project = () => state.projects.find(p=>p.id===state.current);
  const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function blank(name='Nueva mina'){ return {id:uid('M'),name,created:new Date().toISOString(),updated:new Date().toISOString(),nodes:[],branches:[],equipment:[],background:null,view:{zoom:1}}; }
  function sample(){ const p=blank('Mina de ejemplo'); p.nodes=[
    {id:'N-001',x:130,y:340,z:850,type:'Entrada'}, {id:'N-002',x:360,y:340,z:845,type:'Intersección'},
    {id:'N-003',x:590,y:190,z:840,type:'Intersección'}, {id:'N-004',x:830,y:340,z:835,type:'Salida'},
    {id:'N-005',x:590,y:500,z:842,type:'Intersección'}];
    p.branches=[branch('N-001','N-002',p),branch('N-002','N-003',p),branch('N-003','N-004',p),branch('N-002','N-005',p),branch('N-005','N-004',p)]; p.branches.forEach(b=>{b.resistance=0.02;b.resistanceMethod='manual';}); return p; }
  function branch(a,b,p){return {id:uid('R'),from:a,to:b,length:100,sectionType:'rectangular',width:3,height:2.5,area:7.5,perimeter:11,elevationFrom:p.nodes.find(n=>n.id===a)?.z??0,elevationTo:p.nodes.find(n=>n.id===b)?.z??0,resistanceMethod:'manual',resistance:null,friction:null,measuredFlow:null,measuredPressureDrop:null,flow:null,pressureDrop:null};}
  state.projects=store.read();
  function currentEnsure(){ if(!project()){ const p=blank(); state.projects.push(p); state.current=p.id; store.write(); } }
  function render(){ currentEnsure(); const p=project(); $('#mineProjectName').value=p.name; $('#mineStats').textContent=`${p.nodes.length} nodos · ${p.branches.length} ramales`; $('#mineEmpty').hidden=!!(p.nodes.length||p.branches.length); $('#mineCanvas').setAttribute('aria-label',`Plano ${p.name}`); draw(); renderProperties(); }
  function svgEl(tag,attrs={}){const e=document.createElementNS(NS,tag); Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v)); return e;}
  function draw(){ const p=project(); canvas.replaceChildren();
    const defs=svgEl('defs'); const pattern=svgEl('pattern',{id:'grid',width:25,height:25,patternUnits:'userSpaceOnUse'}); pattern.append(svgEl('path',{d:'M 25 0 L 0 0 0 25',fill:'none',stroke:'#25344a','stroke-width':'.8'})); defs.append(pattern); canvas.append(defs);
    canvas.append(svgEl('rect',{x:0,y:0,width:1000,height:700,fill:'#0b1422'})); canvas.append(svgEl('rect',{x:0,y:0,width:1000,height:700,fill:'url(#grid)'}));
    if(p.background){const im=svgEl('image',{href:p.background,x:0,y:0,width:1000,height:700,preserveAspectRatio:'xMidYMid meet',opacity:'.45'});canvas.append(im);}
    p.branches.forEach(b=>{const a=p.nodes.find(n=>n.id===b.from),z=p.nodes.find(n=>n.id===b.to);if(!a||!z)return; const selected=state.selected?.type==='branch'&&state.selected.id===b.id;
      const line=svgEl('line',{x1:a.x,y1:a.y,x2:z.x,y2:z.y,stroke:selected?'#f5bd4f':'#38bfc2','stroke-width':selected?9:6,'stroke-linecap':'round','data-branch':b.id});line.style.cursor='pointer';canvas.append(line);
      const mx=(a.x+z.x)/2,my=(a.y+z.y)/2; const label=svgEl('text',{x:mx+8,y:my-10,fill:'#d8e6f5','font-size':14,'font-weight':700});label.textContent=b.id;canvas.append(label);
    });
    p.nodes.forEach(n=>{const g=svgEl('g',{'data-node':n.id,transform:`translate(${n.x} ${n.y})`});g.style.cursor=state.tool==='branch'?'crosshair':'grab';
      g.append(svgEl('circle',{r:state.selected?.type==='node'&&state.selected.id===n.id?13:10,fill:'#f2b84b',stroke:'#fff','stroke-width':2}));
      const t=svgEl('text',{x:15,y:-12,fill:'#e4edf8','font-size':14,'font-weight':700});t.textContent=n.id;g.append(t);canvas.append(g);
    });
    if(state.tool==='node') canvas.style.cursor='crosshair'; else canvas.style.cursor='default';
  }
  function renderProperties(){const p=project(), box=$('#mineProperties'); if(!state.selected){box.innerHTML='<div class="mine-prop-empty"><b>Propiedades</b><p>Selecciona un nodo o una galería para editar sus datos.</p></div>';return;}
    if(state.selected.type==='node'){const n=p.nodes.find(x=>x.id===state.selected.id);if(!n){state.selected=null;return renderProperties();}
      box.innerHTML=`<h3>Nodo ${esc(n.id)}</h3><label>Tipo<select id="pnType"><option>Intersección</option><option>Entrada</option><option>Salida</option><option>Unión</option><option>Ventilador</option></select></label><label>Coordenada X (m)<input id="pnX" type="number" step="0.1" value="${n.x}"></label><label>Coordenada Y (m)<input id="pnY" type="number" step="0.1" value="${n.y}"></label><label>Cota Z (m s. n. m.)<input id="pnZ" type="number" step="0.1" value="${n.z}"></label><button class="btn danger small" id="deleteElement">Eliminar nodo</button>`;
      $('#pnType').value=n.type; ['pnType','pnX','pnY','pnZ'].forEach((id,i)=>$('#'+id).addEventListener('change',()=>{n[['type','x','y','z'][i]]=i===0?$('#'+id).value:Number($('#'+id).value);p.updated=new Date().toISOString();store.write();draw();}));
    } else {const b=p.branches.find(x=>x.id===state.selected.id);if(!b){state.selected=null;return renderProperties();}
      box.innerHTML=`<h3>Galería ${esc(b.id)}</h3><div class="mine-pair"><label>Longitud (m)<input id="pbLength" type="number" min="0.1" step="0.1" value="${b.length}"></label><label>Sección<select id="pbShape"><option value="rectangular">Rectangular</option><option value="irregular">Irregular (área manual)</option></select></label></div><div class="mine-pair"><label>Ancho (m)<input id="pbWidth" type="number" min="0.01" step="0.01" value="${b.width}"></label><label>Alto (m)<input id="pbHeight" type="number" min="0.01" step="0.01" value="${b.height}"></label></div><label>Área (m²)<input id="pbArea" type="number" min="0.01" step="0.01" value="${b.area}"></label><label>Perímetro (m)<input id="pbPerim" type="number" min="0.01" step="0.01" value="${b.perimeter}"></label><div class="mine-pair"><label>Cota inicial (m)<input id="pbZ1" type="number" step="0.1" value="${b.elevationFrom}"></label><label>Cota final (m)<input id="pbZ2" type="number" step="0.1" value="${b.elevationTo}"></label></div><label>Método de resistencia<select id="pbMethod"><option value="manual">Ingresar R manualmente</option><option value="measured">Calcular con ΔP / Q²</option><option value="atkinson">Calcular con geometría y factor de Atkinson</option></select></label><label>Resistencia R (Pa·s²/m⁶)<input id="pbR" type="number" min="0" step="any" value="${b.resistance??''}" placeholder="Valor manual o calculado"></label><div class="mine-pair"><label>Caudal medido Q (m³/s)<input id="pbFlow" type="number" min="0" step="any" value="${b.measuredFlow??''}"></label><label>Caída ΔP (Pa)<input id="pbDp" type="number" min="0" step="any" value="${b.measuredPressureDrop??''}"></label></div><label>Factor de Atkinson (convención por validar)<input id="pbFriction" type="number" min="0" step="any" value="${b.friction??''}" placeholder="Pendiente de método validado"></label><p class="hint">Con método medido, R = ΔP / Q². El cálculo geométrico por Atkinson queda preparado como dato, pero no se activa hasta validar la fórmula y las unidades de tus apuntes.</p><button class="btn danger small" id="deleteElement">Eliminar galería</button>`;
      $('#pbShape').value=b.sectionType; $('#pbMethod').value=b.resistanceMethod;
      const map={pbLength:'length',pbShape:'sectionType',pbWidth:'width',pbHeight:'height',pbArea:'area',pbPerim:'perimeter',pbZ1:'elevationFrom',pbZ2:'elevationTo',pbMethod:'resistanceMethod',pbR:'resistance',pbFriction:'friction',pbFlow:'measuredFlow',pbDp:'measuredPressureDrop'};
      Object.entries(map).forEach(([id,key])=>$('#'+id).addEventListener('change',()=>{const v=$('#'+id).value;b[key]=['sectionType','resistanceMethod'].includes(key)?v:(v===''?null:Number(v));if(b.sectionType==='rectangular'&&['width','height'].includes(key)){b.area=b.width*b.height;b.perimeter=2*(b.width+b.height);$('#pbArea').value=b.area;$('#pbPerim').value=b.perimeter;}if(b.resistanceMethod==='measured'&&b.measuredFlow>0&&b.measuredPressureDrop>=0){b.resistance=b.measuredPressureDrop/(b.measuredFlow*b.measuredFlow);$('#pbR').value=b.resistance;}p.updated=new Date().toISOString();store.write();}));
    }
    $('#deleteElement').addEventListener('click',()=>{if(!confirm('¿Eliminar este elemento?'))return;if(state.selected.type==='node'){p.nodes=p.nodes.filter(n=>n.id!==state.selected.id);p.branches=p.branches.filter(b=>b.from!==state.selected.id&&b.to!==state.selected.id);}else p.branches=p.branches.filter(b=>b.id!==state.selected.id);state.selected=null;store.write();render();});
  }
  function point(evt){const pt=canvas.createSVGPoint();pt.x=evt.clientX;pt.y=evt.clientY;const m=canvas.getScreenCTM().inverse();const q=pt.matrixTransform(m);return {x:Math.max(0,Math.min(1000,q.x)),y:Math.max(0,Math.min(700,q.y))};}
  function nodeAt(el){const g=el.closest('[data-node]');return g?.getAttribute('data-node')||null;}
  canvas.addEventListener('pointerdown',e=>{const p=project(),nId=nodeAt(e.target),bEl=e.target.closest('[data-branch]');
    if(state.tool==='node'&&!nId){const q=point(e);const n={id:`N-${String(Math.max(0,...p.nodes.map(x=>Number(x.id.split('-')[1])||0))+1).padStart(3,'0')}`,x:q.x,y:q.y,z:0,type:'Intersección'};p.nodes.push(n);state.selected={type:'node',id:n.id};p.updated=new Date().toISOString();store.write();render();return;}
    if(state.tool==='branch'&&nId){if(!state.firstNode){state.firstNode=nId;toast('Ahora selecciona el nodo final');}else if(state.firstNode===nId){toast('Selecciona un nodo diferente');}else{const b=branch(state.firstNode,nId,p);b.id=`R-${String(p.branches.length+1).padStart(3,'0')}`;p.branches.push(b);state.selected={type:'branch',id:b.id};state.firstNode=null;p.updated=new Date().toISOString();store.write();render();}return;}
    if(state.tool==='select'&&nId){state.selected={type:'node',id:nId};state.drag={id:nId};canvas.setPointerCapture(e.pointerId);renderProperties();draw();return;}
    if(state.tool==='select'&&bEl){state.selected={type:'branch',id:bEl.getAttribute('data-branch')};renderProperties();draw();return;}
    if(state.tool==='select'){state.selected=null;renderProperties();draw();}
  });
  canvas.addEventListener('pointermove',e=>{if(!state.drag)return;const n=project().nodes.find(x=>x.id===state.drag.id);if(!n)return;const q=point(e);n.x=q.x;n.y=q.y;draw();});
  canvas.addEventListener('pointerup',()=>{if(state.drag){state.drag=null;project().updated=new Date().toISOString();store.write();renderProperties();}});
  function setTool(tool){state.tool=tool;state.firstNode=null;$$('.mine-tool').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));toast(({select:'Modo selección',node:'Haz clic en el plano para crear nodos',branch:'Selecciona nodo inicial y final para crear galería'})[tool]);}
  function newProject(useSample){const name=prompt('Nombre del proyecto de mina:',useSample?'Mina de ejemplo':'Nueva mina');if(name===null)return;const p=useSample?sample():blank(name.trim()||'Nueva mina');if(!useSample)p.name=name.trim()||'Nueva mina';state.projects.push(p);state.current=p.id;state.selected=null;store.write();render();toast('Proyecto creado');}
  $('#mineNewBlank').addEventListener('click',()=>newProject(false)); $('#mineNewSample').addEventListener('click',()=>newProject(true));
  $('#mineSave').addEventListener('click',()=>{const p=project();p.name=$('#mineProjectName').value.trim()||'Proyecto sin nombre';p.updated=new Date().toISOString();store.write();toast('Plano guardado en este dispositivo');});
  $('#mineProjectName').addEventListener('change',()=>{const p=project();p.name=$('#mineProjectName').value.trim()||'Proyecto sin nombre';store.write();});
  $('#mineToolSelect').addEventListener('click',()=>setTool('select')); $('#mineToolNode').addEventListener('click',()=>setTool('node')); $('#mineToolBranch').addEventListener('click',()=>setTool('branch'));
  $('#mineFit').addEventListener('click',()=>{canvas.setAttribute('viewBox','0 0 1000 700');toast('Vista ajustada');});
  $('#mineImportImage').addEventListener('change',e=>{const f=e.target.files?.[0];if(!f)return;if(!f.type.startsWith('image/'))return toast('Selecciona una imagen PNG o JPG');const reader=new FileReader();reader.onload=()=>{project().background=reader.result;store.write();draw();toast('Imagen de referencia cargada');};reader.readAsDataURL(f);});
  $('#mineClearImage').addEventListener('click',()=>{project().background=null;store.write();draw();});
  $('#mineExport').addEventListener('click',()=>{const blob=new Blob([JSON.stringify(project(),null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${project().name.replace(/[^a-z0-9-_]/gi,'_')}.aeriq.json`;a.click();URL.revokeObjectURL(a.href);});
  $('#mineImportJson').addEventListener('change',e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{const p=JSON.parse(r.result);if(!p.nodes||!p.branches)throw Error();p.id=uid('M');state.projects.push(p);state.current=p.id;state.selected=null;store.write();render();toast('Proyecto importado');}catch{toast('Archivo de proyecto no válido');}};r.readAsText(f);});

  // Simulación de red (motor independiente de la interfaz)
  const simButton=$('#mineSimulate');
  if(simButton) simButton.addEventListener('click',()=>{
    const status=$('#mineSimStatus'), out=$('#mineSimResults');
    try{
      const result=window.AERIQNetwork.calculate(project(),{
        supplyPressure:Number($('#simSupplyPressure').value),
        returnPressure:Number($('#simReturnPressure').value),
        tolerance:Number($('#simTolerance').value)
      });
      status.className='mine-sim-status success';
      status.textContent=`Convergencia alcanzada en ${result.iterations} iteraciones · Residuo nodal máximo: ${result.residual.toExponential(2)} m³/s · Caudal total de entrada: ${result.totalIn.toFixed(4)} m³/s`;
      const fmt=n=>Number(n).toLocaleString('es-CO',{maximumFractionDigits:4});
      out.innerHTML=`<div class="mine-results-scroll"><table class="mine-results-table"><thead><tr><th>Galería</th><th>R (Pa·s²/m⁶)</th><th>ΔP (Pa)</th><th>Q (m³/s)</th><th>Velocidad (m/s)</th></tr></thead><tbody>${result.branches.map(b=>`<tr><td>${esc(b.id)}</td><td>${fmt(b.R)}</td><td>${fmt(b.pressureDrop)}</td><td>${fmt(b.flow)}</td><td>${b.velocity===null?'—':fmt(b.velocity)}</td></tr>`).join('')}</tbody></table></div><h4>Presión calculada por nodo</h4><div class="mine-pressure-grid">${Object.entries(result.pressures).map(([id,v])=>`<span><b>${esc(id)}</b> ${fmt(v)} Pa</span>`).join('')}</div>`;
      // Guarda los resultados en el proyecto para que viajen en el respaldo JSON.
      const p=project(); p.lastSimulation={date:new Date().toISOString(),supplyPressure:Number($('#simSupplyPressure').value),returnPressure:Number($('#simReturnPressure').value),iterations:result.iterations,residual:result.residual,branches:result.branches,pressures:result.pressures}; store.write();
    }catch(err){status.className='mine-sim-status error';status.textContent=err.message;out.innerHTML='<p class="hint">Corrige los datos indicados y vuelve a simular.</p>';}
  });

  state.current=state.projects[0]?.id||null; render(); setTool('select');
})();
