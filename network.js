/* AERIQ 1.4 · Solucionador de red por equilibrio nodal no lineal.
   Modelo: ΔP = R·Q·|Q|. No sustituye validación profesional ni normativa. */
(() => {
  'use strict';
  const EPS = 1e-10;
  function solveLinear(A, b) {
    const n=b.length, M=A.map((r,i)=>[...r,b[i]]);
    for(let k=0;k<n;k++){
      let pivot=k; for(let i=k+1;i<n;i++) if(Math.abs(M[i][k])>Math.abs(M[pivot][k])) pivot=i;
      if(Math.abs(M[pivot][k])<EPS) throw new Error('La matriz del sistema es singular. Revisa la conectividad de la red.');
      [M[k],M[pivot]]=[M[pivot],M[k]];
      const d=M[k][k]; for(let j=k;j<=n;j++) M[k][j]/=d;
      for(let i=0;i<n;i++) if(i!==k){const f=M[i][k];for(let j=k;j<=n;j++)M[i][j]-=f*M[k][j];}
    }
    return M.map(r=>r[n]);
  }
  function calculate(project, options={}) {
    const nodes=project.nodes||[], branches=project.branches||[];
    const supply=Number(options.supplyPressure??100), ret=Number(options.returnPressure??0), tol=Number(options.tolerance??1e-4);
    if(!(supply>ret)) throw new Error('La presión de entrada debe ser mayor que la presión de salida.');
    if(!(tol>0)) throw new Error('La tolerancia debe ser mayor que cero.');
    const byId=new Map(nodes.map(n=>[n.id,n]));
    const inlets=nodes.filter(n=>n.type==='Entrada'), outlets=nodes.filter(n=>n.type==='Salida');
    if(!inlets.length||!outlets.length) throw new Error('Define al menos un nodo de tipo Entrada y uno de tipo Salida en las propiedades de los nodos.');
    if(!branches.length) throw new Error('El proyecto no tiene galerías.');
    const edges=branches.map(b=>{
      if(!byId.has(b.from)||!byId.has(b.to)) throw new Error(`La galería ${b.id} tiene un nodo inexistente.`);
      const R=Number(b.resistance);
      if(!(R>0)&&b.resistanceMethod!=='measured') throw new Error(`La galería ${b.id} necesita una resistencia R positiva.`);
      let resistance=R;
      if(b.resistanceMethod==='measured'){
        const q=Number(b.measuredFlow), dp=Number(b.measuredPressureDrop);
        if(!(q>0)||!(dp>0)) throw new Error(`La galería ${b.id}: para calcular R ingresa Q medido y ΔP mayores que cero.`);
        resistance=dp/(q*q);
      }
      if(!(resistance>0)||!Number.isFinite(resistance)) throw new Error(`Resistencia inválida en ${b.id}.`);
      return {id:b.id,from:b.from,to:b.to,R:resistance,area:Number(b.area)||0,length:Number(b.length)||0};
    });
    // Comprobar que todas las galerías pertenecen a una red conectada a una frontera de presión.
    const adj=new Map(nodes.map(n=>[n.id,[]])); edges.forEach(e=>{adj.get(e.from).push(e.to);adj.get(e.to).push(e.from);});
    const fixed=new Map(); inlets.forEach(n=>fixed.set(n.id,supply)); outlets.forEach(n=>fixed.set(n.id,ret));
    const seen=new Set(), stack=[...fixed.keys()]; while(stack.length){const id=stack.pop();if(seen.has(id))continue;seen.add(id);(adj.get(id)||[]).forEach(x=>stack.push(x));}
    const disconnected=edges.filter(e=>!seen.has(e.from)||!seen.has(e.to));
    if(disconnected.length) throw new Error(`Hay galerías desconectadas de las entradas/salidas: ${disconnected.map(e=>e.id).join(', ')}.`);
    const unknown=nodes.filter(n=>!fixed.has(n.id));
    if(!unknown.length) throw new Error('No hay nodos internos para resolver.');
    const index=new Map(unknown.map((n,i)=>[n.id,i]));
    let P=new Map(nodes.map(n=>[n.id,fixed.has(n.id)?fixed.get(n.id):(supply+ret)/2]));
    let iterations=0, maxResidual=Infinity;
    for(;iterations<200;iterations++){
      const F=Array(unknown.length).fill(0), J=Array.from({length:unknown.length},()=>Array(unknown.length).fill(0));
      for(const e of edges){
        const dp=P.get(e.from)-P.get(e.to), safe=Math.max(Math.abs(dp),1e-7);
        const q=Math.sign(dp)*Math.sqrt(safe/e.R), g=1/(2*Math.sqrt(e.R*safe));
        const i=index.get(e.from), j=index.get(e.to);
        if(i!==undefined){F[i]+=q;J[i][i]+=g;if(j!==undefined)J[i][j]-=g;}
        if(j!==undefined){F[j]-=q;J[j][j]+=g;if(i!==undefined)J[j][i]-=g;}
      }
      maxResidual=Math.max(...F.map(Math.abs));
      if(maxResidual<tol) break;
      const delta=solveLinear(J,F.map(x=>-x));
      let alpha=1; const maxStep=Math.max(...delta.map(Math.abs)); if(maxStep>Math.max(supply-ret,1)*0.5) alpha=Math.max(0.05,Math.max(supply-ret,1)*0.5/maxStep);
      unknown.forEach((n,i)=>P.set(n.id,P.get(n.id)+alpha*delta[i]));
    }
    if(iterations>=200||!Number.isFinite(maxResidual)) throw new Error('El solucionador no convergió. Revisa la topología, las resistencias y las presiones de frontera.');
    const results=edges.map(e=>{
      const dp=P.get(e.from)-P.get(e.to), q=Math.sign(dp)*Math.sqrt(Math.abs(dp)/e.R), area=e.area;
      return {...e,pressureDrop:dp,flow:q,velocity:area>0?Math.abs(q)/area:null};
    });
    const totalIn=results.filter(e=>fixed.has(e.from)&&fixed.get(e.from)===supply).reduce((s,e)=>s+e.flow,0)
      + results.filter(e=>fixed.has(e.to)&&fixed.get(e.to)===supply).reduce((s,e)=>s-e.flow,0);
    return {iterations,residual:maxResidual,pressures:Object.fromEntries(P),branches:results,totalIn};
  }
  window.AERIQNetwork={calculate};
})();
