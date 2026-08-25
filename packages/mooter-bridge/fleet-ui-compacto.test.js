const fs=require('fs'),vm=require('vm'),assert=require('assert');
const path=require('path');
/**
 * O MODO COMPACTO do widget da thread — o que mais gente vai ver do Mooter.
 *
 * A regra que justifica o produto tem de valer AQUI TAMBÉM, e com mais força:
 * um ponto a pulsar sobre trabalho encravado, numa thread, é a mentira mais
 * visível que este produto pode contar.
 *
 * O teste extrai a função REAL do HTML e corre-a contra um DOM mínimo.
 */
const h=fs.readFileSync(path.join(__dirname,'fleet-ui.html'),'utf8');
let p=0,f=0; const t=(n,c,d)=>{c?(p++,console.log('  ✅ '+n)):(f++,console.log('  ❌ '+n+(d?'\n     → '+d:'')));};

// extrair pintaCompacto e correr com um DOM falso mínimo
function grab(nome){
  const i=h.indexOf('function '+nome+'(');
  let d=0; for(let k=h.indexOf('{',i);k<h.length;k++){ if(h[k]==='{')d++; else if(h[k]==='}'){d--; if(!d) return h.slice(i,k+1);} }
}
const nos=[];
const fakeEl=()=>({className:'',textContent:'',style:{},title:'',children:[],
  appendChild(c){this.children.push(c);return c;}});
const src=`
var COR={cc:'#c15f3c',moo:'#6f66c0'};
function esc(s){return String(s==null?'':s);}
function el(tag,cls,html){var d=NEW();d.className=cls||'';if(html!=null)d.textContent=html;NOS.push(d);return d;}
function vivo(x){return x==='running'||x==='dispatched';}
var document={getElementById:function(){var d=NEW();NOS.push(d);ROOT=d;return d;}};
${grab('pintaCompacto')}
`;
const ctx={NEW:fakeEl,NOS:nos,ROOT:null,console};
vm.createContext(ctx);
vm.runInContext(src+'\nglobalThis.__f=pintaCompacto;globalThis.__root=function(){return ROOT;};',ctx);

console.log('\n▸ A REGRA na thread · running nao e working');
nos.length=0;
ctx.__f({jobs:[{job_id:'a',state:'running',agent:'cc',agent_label:'Claude Code',model_used:'haiku',
  eta_bar:{pulse:{state:'parado',text:'sem crescer ha 27 min'}}}]});
let txt=nos.map(n=>n.className+'|'+n.textContent).join('\n');
t('o job parado NAO recebe a classe .on (nao pulsa)', !/mrow on/.test(txt), txt);
t('e a linha diz-lhe "sem crescer"', /sem crescer/.test(txt));
t('nao desenha barra a mexer sobre trabalho parado', !/mbar/.test(txt), txt);

nos.length=0;
ctx.__f({jobs:[{job_id:'b',state:'running',agent:'moo',agent_label:'Ollama',model_used:'qwen3.6:27b',eta_bar:{}}]});
txt=nos.map(n=>n.className+'|'+n.textContent).join('\n');
t('o job a crescer RECEBE .on', /mrow on/.test(txt));
t('e desenha barra indeterminada (sem percentagem medida)', /mbar ind/.test(txt));

nos.length=0;
ctx.__f({jobs:[{job_id:'c',state:'running',agent:'cc',agent_label:'Claude Code',eta_bar:{percentage:60}}]});
txt=nos.map(n=>n.className+'|'+n.textContent).join('\n');
t('com percentagem medida, a barra NAO e indeterminada', /mbar\|/.test(txt)&&!/mbar ind/.test(txt));
t('modelo em falta aparece como n/d, nunca vazio', /modelo n\/d/.test(txt));

nos.length=0;
ctx.__f({jobs:[
 {job_id:'d',state:'running',agent:'cc',agent_label:'Claude Code',model_used:'haiku',eta_bar:{}},
 {job_id:'e',state:'running',agent:'cc',agent_label:'Claude Code',model_used:'haiku',eta_bar:{}}]});
txt=nos.map(n=>n.className+'|'+n.textContent).join('\n');
t('dois jobs no mesmo motor sao UMA linha', (txt.match(/mrow/g)||[]).length===1);
t('e a linha diz quantos', /2 jobs/.test(txt));

nos.length=0;
ctx.__f({jobs:[],ultima_wave:{wave:'tour-copy'}});
txt=nos.map(n=>n.className+'|'+n.textContent).join('\n');
t('sem jobs, diz a ultima wave em vez de ficar vazio', /Ultima wave: tour-copy/.test(txt));

console.log('\n▸ os dois botoes');
t('"Abrir o Cockpit" existe', h.includes('id="btnCockpit"'));
t('usa ui/message — a unica via real', /say\('Abre o Mooter Cockpit/.test(h));
t('"mais detalhe" nao chama tool nenhuma', /det\.hidden = !det\.hidden/.test(h));
t('o detalhe arranca escondido', /<div id="detalhe" hidden>/.test(h));
console.log('\n'+p+' passou · '+f+' falhou');
process.exit(f?1:0);
