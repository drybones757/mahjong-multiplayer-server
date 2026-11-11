
/* LOS Mahjong — rules and bot logic. Runs without a network connection.
   Traditional face artwork: Daniel Schmitz / TeX Live Mahjong, MIT license. */
(function(root){'use strict';
const E={};
const SUITS=['W','B','D'];
const WINDS=['E','S','X','N'];
const HONORS=['E','S','X','N','R','G','H'];
const BONUS=['F1','F2','F3','F4','T1','T2','T3','T4'];
const KINDS=[...SUITS.flatMap(s=>Array.from({length:9},(_,i)=>s+(i+1))),...HONORS];
const ORPHANS=['W1','W9','B1','B9','D1','D9',...HONORS];
const sortIdx=new Map(KINDS.map((v,i)=>[v,i]));
const LEVELS=['Easy','Medium','Hard','Expert'];
const NAME={E:'East',S:'South',X:'West',N:'North',R:'Red Dragon',G:'Green Dragon',H:'White Dragon'};
for(let i=1;i<=9;i++)for(let [s,n] of [['W','Character'],['B','Bamboo'],['D','Dot']])NAME[s+i]=i+' '+n;
for(let i=1;i<=4;i++){NAME['F'+i]=['Plum','Orchid','Chrysanthemum','Bamboo Flower'][i-1];NAME['T'+i]=['Spring','Summer','Autumn','Winter'][i-1];}
const copy=x=>JSON.parse(JSON.stringify(x));
const sortTiles=tiles=>tiles.sort((a,b)=>(sortIdx.get(a)??100)-(sortIdx.get(b)??100));
const counts=tiles=>{let a=Array(34).fill(0);for(const t of tiles){const i=sortIdx.get(t);if(i!==undefined)a[i]++}return a};
const countTile=(tiles,t)=>tiles.filter(x=>x===t).length;
const removeTiles=(arr,what)=>{for(const x of what){const i=arr.indexOf(x);if(i<0)throw Error('Tile not owned: '+x);arr.splice(i,1)}sortTiles(arr)};
const isBonus=t=>BONUS.includes(t);
const isHonor=t=>HONORS.includes(t);
const isTerminal=t=>!isHonor(t)&&['1','9'].includes(t.slice(-1));
const isSimple=t=>!isHonor(t)&&!isTerminal(t);
const suit=t=>SUITS.includes(t[0])?t[0]:null;
const seatWind=(s,p)=>WINDS[(p-s.dealer+4)%4];
const seatNumber=(s,p)=>(p-s.dealer+4)%4+1;
// Seat numbering goes East→South→West→North in the counterclockwise play direction.
const nextPlayer=p=>(p+1)%4;
const roundWind=s=>WINDS[Math.floor(s.dealerAdvances/4)%4];
const add=(r,n,v)=>{if(v>0)r.push({name:n,faan:v})};
const scoreSum=r=>r.reduce((a,p)=>a+p.faan,0);
const eligibleSuitGroups=arr=>new Set(arr.filter(x=>suit(x)).map(suit));
function allTiles(hand,melds){return hand.concat(melds.flatMap(m=>m.tiles));}
function basicPatterns(hand,melds){
 const list=[];const ts=allTiles(hand,melds);const ss=eligibleSuitGroups(ts);const honors=ts.some(isHonor);
 if(ts.every(isSimple))add(list,'No Terminals / No Honors',1);
 if(ss.size<=2)add(list,'One Missing Suit',1);
 if(ss.size===1){add(list, honors?'Mixed One-Suit':'Pure One-Suit',honors?4:8)}
 if(ts.length>0&&ts.every(isHonor))add(list,'All Honors',32);
 if(!melds.some(m=>m.type==='pong'||m.type==='chow'||(m.type==='kong'&&!m.concealed)))add(list,'Concealed Hand',1);
 if(melds.length===0&&hand.length===14){
   const c=counts(hand);for(let s=0;s<3;s++){
     const a=c.slice(s*9,s*9+9),other=c.reduce((a,b)=>a+b,0)-a.reduce((a,b)=>a+b,0);
     const gates=[3,1,1,1,1,1,1,1,3];
     if(other===0&&gates.every((v,i)=>a[i]>=v)&&a.reduce((a,b)=>a+b,0)===14) {add(list,'Nine Gates',48);break}
   }
 }
 return list;
}
function flowerPatterns(s,p){
 const flowers=s.players[p].flowers, ix=String(seatNumber(s,p)),r=[];
 if(flowers.length===0)add(r,'No Flowers or Seasons',1);
 for(const t of ['F'+ix,'T'+ix])if(flowers.includes(t))add(r,t[0]==='F'?'Matching Flower':'Matching Season',1);
 if(['F1','F2','F3','F4'].every(x=>flowers.includes(x)))add(r,'Complete Four Flowers',1);
 if(['T1','T2','T3','T4'].every(x=>flowers.includes(x)))add(r,'Complete Four Seasons',1);
 return r;
}
function winningBonus(s,p,context){
 const r=[];if(context.type==='self'&&context.lastLive)add(r,'Final Draw',1);
 if(context.type!=='self'&&context.lastLive)add(r,'Final Discard',1);
 if(context.type==='self'&&context.kongReplacement)add(r,'Kong Replacement Win',1);
 if(context.type==='rob')add(r,'Robbing an Added Kong',1);
 if(context.type==='self'&&p===s.dealer&&s.discardCount===0)add(r,'Blessing of Heaven',16);
 if(context.type==='discard'&&p!==s.dealer&&context.from===s.dealer&&s.discardCount===1)add(r,'Blessing of Earth',16);
 return r;
}
function isOrphanWin(hand,melds){
 if(melds.length||hand.length!==14)return false;
 const c=counts(hand);return ORPHANS.every(t=>c[sortIdx.get(t)]>=1)&&hand.every(t=>ORPHANS.includes(t));
}
function getSevenPairs(hand,melds){
 if(melds.length||hand.length!==14)return null;
 const c=counts(hand);if(c.some(v=>v%2!==0))return null;
 if(c.reduce((n,v)=>n+v/2,0)!==7)return null;
 const quads=c.filter(v=>v===4).length;
 const isTerm=hand.every(t=>isTerminal(t)||isHonor(t));
 const options=[{name:'Seven Pairs',faan:3},{name:quads===1?'Luxury Seven Pairs':quads===2?'Double Luxury Seven Pairs':'Triple Luxury Seven Pairs',faan:[3,8,16,48][quads]}];
 if(isTerm)options.push({name:'Seven Pairs of Terminals',faan:13});
 options.sort((a,b)=>b.faan-a.faan);
 return {...options[0],quads};
}
function regularPartitions(hand,melds){
 const need=4-melds.length, out=[],seen=new Set();if(need<0||hand.length!==need*3+2)return out;
 const c=counts(hand);
 for(let i=0;i<34;i++){
  if(c[i]<2)continue;c[i]-=2;
  const pair=KINDS[i], sets=[];
  function search(){
   const k=c.findIndex(v=>v>0);
   if(k<0){if(sets.length===need){const key=sets.map(x=>x.kind+':'+x.tiles[0]).sort().join('|')+'#'+pair;if(!seen.has(key)){seen.add(key);out.push({pair,sets:copy(sets)})}}return}
   if(sets.length>=need)return;
   if(c[k]>=3){c[k]-=3;sets.push({kind:'pong',tiles:[KINDS[k],KINDS[k],KINDS[k]],concealed:true});search();sets.pop();c[k]+=3}
   if(k<27&&k%9<=6&&c[k+1]>0&&c[k+2]>0){c[k]--;c[k+1]--;c[k+2]--;sets.push({kind:'chow',tiles:[KINDS[k],KINDS[k+1],KINDS[k+2]],concealed:true});search();sets.pop();c[k]++;c[k+1]++;c[k+2]++}
  }
  search();c[i]+=2;
 }
 return out;
}
function structuredPatterns(s,p,hand,melds,form,context){
 const r=[],sets=[...melds.map(m=>({kind:m.type==='kong'?'kong':m.type==='pong'?'pong':'chow',tiles:m.tiles,concealed:!!m.concealed})),...form.sets];
 const tr=sets.filter(m=>m.kind==='pong'||m.kind==='kong');const ch=sets.filter(m=>m.kind==='chow');const pair=form.pair;
 if(ch.length===4)add(r,'All Sequences',1);
 if(tr.some(m=>isTerminal(m.tiles[0])))add(r,'Pung of Terminals',1);
 if(tr.length===4)add(r,'All Triplets',3);
 const hc=new Set(tr.filter(m=>isHonor(m.tiles[0])).map(m=>m.tiles[0]));
 for(const t of hc){add(r,'Value Honor · '+NAME[t],1);if(t===seatWind(s,p))add(r,'Seat Wind · '+NAME[t],1);if(t===roundWind(s))add(r,'Prevailing Wind · '+NAME[t],1)}
 const dragon=['R','G','H'].filter(t=>hc.has(t));
 if(dragon.length===3)add(r,'Big Three Dragons',16);
 else if(dragon.length===2&&['R','G','H'].some(t=>!hc.has(t)&&pair===t))add(r,'Small Three Dragons',6);
 const winds=WINDS.filter(t=>hc.has(t));
 if(winds.length===4)add(r,'Big Four Winds',40);
 else if(winds.length===3&&WINDS.some(t=>!hc.has(t)&&pair===t))add(r,'Small Four Winds',32);
 else if(winds.length===3)add(r,'Big Three Winds',12);
 else if(winds.length===2&&WINDS.some(t=>!hc.has(t)&&pair===t))add(r,'Small Three Winds',3);
 let concealed=tr.filter(m=>m.concealed).length;
 if(context.type!=='self'&&context.tile){
   // If Hu used another player's tile to finish an undeclared Pung, that Pung isn't concealed.
   // Check whether an alternative assignment to the pair/Chow could have taken that tile first.
   const otherUse=pair===context.tile||ch.some(m=>m.concealed&&m.tiles.includes(context.tile));
   if(!otherUse&&tr.some(m=>m.concealed&&m.kind==='pong'&&m.tiles[0]===context.tile)) concealed=Math.max(0,concealed-1);
 }
 if(concealed>=4)add(r,'Four Concealed Triplets',13);
 else if(concealed===3)add(r,'Three Concealed Triplets',3);
 else if(concealed===2)add(r,'Two Concealed Triplets',1);
 const kongs=sets.filter(m=>m.kind==='kong');
 if(kongs.length)add(r,['','One Kong','Two Kongs','Three Kongs','Four Kongs'][kongs.length],[0,1,2,12,48][kongs.length]);
 const concealedK=kongs.filter(m=>m.concealed).length;
 if(concealedK)add(r,'Declared Concealed Kong × '+concealedK,concealedK);
 // Only the highest qualifying identical-sequence tier is awarded.
 const chcount={};for(const m of ch){const key=m.tiles.join('-');chcount[key]=(chcount[key]||0)+1}
 const n=Object.values(chcount).sort((a,b)=>b-a), pairs=n.filter(x=>x>=2).length;
 if(n[0]===4)add(r,'Four Identical Sequences',48);
 else if(n[0]===3)add(r,'Three Identical Sequences',12);
 else if(pairs>=2)add(r,'Two Identical Sequences Twice',6);
 else if(n[0]>=2)add(r,'Two Identical Sequences',1);
 for(let start=1;start<=7;start++){
   if(SUITS.every(su=>ch.some(m=>m.tiles.join(',')===[su+start,su+(start+1),su+(start+2)].join(',')))){add(r,'Three Similar Sequences',4);break}
 }
 for(let start=1;start<=9;start++){
   let matching=SUITS.filter(su=>tr.some(m=>m.tiles[0]===su+start));
   if(matching.length===3){add(r,'Three Similar Triplets',12);break}
   if(matching.length===2&&suit(pair)&&pair.endsWith(String(start))&&!matching.some(x=>x===suit(pair))){add(r,'Small Three Similar Triplets',3);break}
 }
 for(const su of SUITS){
   if(['1','4','7'].every(x=>ch.some(m=>m.tiles[0]===su+x))) {add(r,'Nine Tile Straight',4);break}
 }
 for(const su of SUITS){let ranks=tr.filter(m=>suit(m.tiles[0])===su).map(m=>+m.tiles[0].slice(1));
  if([1,2,3,4,5,6].some(a=>[a,a+1,a+2,a+3].every(x=>ranks.includes(x)))){add(r,'Four Consecutive Triplets',20);break}
  if(!r.some(x=>x.name==='Four Consecutive Triplets')&&[1,2,3,4,5,6,7].some(a=>[a,a+1,a+2].every(x=>ranks.includes(x)))){add(r,'Three Consecutive Triplets',10);break}
 }
 // Half Flush / Mixed One-Suit: all numbered tiles (including the pair) must
 // belong to the same suit; the pair may instead be an honor tile.
 // Basic scoring already awards this only for one numbered suit + honors.
 const ts=allTiles(hand,melds), honors=ts.some(isHonor);
 const greater=ts.every(x=>isTerminal(x)||isHonor(x))&&tr.length===4;
 const lesser=sets.every(m=>m.tiles.some(x=>isTerminal(x)||isHonor(x)))&&(isTerminal(pair)||isHonor(pair));
 if(greater)add(r,honors?'Mixed Greater Terminals':'Pure Greater Terminals',honors?10:40);
 else if(lesser)add(r,honors?'Mixed Lesser Terminals':'Pure Lesser Terminals',honors?4:5);
 return r;
}
function calculate(s,p,hand,context={type:'self'}){
 const melds=s.players[p].melds;
 if(!hand)hand=s.players[p].hand;
 let options=[];
 const base=basicPatterns(hand,melds),flowers=flowerPatterns(s,p),wins=winningBonus(s,p,context);
 if(isOrphanWin(hand,melds)){
  // Concealed Hand on Thirteen Terminals not awarded by house amendment (only Seven Pairs explicitly).
  const r=base.filter(x=>x.name!=='Concealed Hand'&&x.name!=='Nine Gates');add(r,'Thirteen Terminals / Orphans',16);
  options.push({kind:'orphans',patterns:r.concat(flowers,wins),decomposition:null});
 }
 const sp=getSevenPairs(hand,melds);
 if(sp){const r=base.filter(x=>x.name!=='Nine Gates');add(r,sp.name,sp.faan);options.push({kind:'seven',patterns:r.concat(flowers,wins),decomposition:null})}
 for(const form of regularPartitions(hand,melds)){
   const r=base.concat(structuredPatterns(s,p,hand,melds,form,context),flowers,wins);
   options.push({kind:'regular',patterns:r,decomposition:form});
 }
 options.sort((a,b)=>scoreSum(b.patterns)-scoreSum(a.patterns));
 if(!options.length)return null;
 const best=options[0];return {kind:best.kind,faan:scoreSum(best.patterns),patterns:best.patterns,decomposition:best.decomposition};
}
function buildWall(rand=Math.random){const wall=[];for(const t of KINDS)for(let i=0;i<4;i++)wall.push(t);wall.push(...BONUS);for(let i=wall.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[wall[i],wall[j]]=[wall[j],wall[i]]}return wall}
function validateSettings(input={}){
 const n=(v,f,min,max)=>Math.max(min,Math.min(max,Number.isFinite(+v)?+v:f));
 return {wager:Math.round(n(input.wager,20,0,100000)*10)/10,minFaan:Math.round(n(input.minFaan,8,0,100)),starting:Math.round(n(input.starting,1000,0,1e7)*10)/10,
  mode:['hands','winds','unlimited'].includes(input.mode)?input.mode:'hands',hands:Math.round(n(input.hands,8,1,999)),windRounds:Math.round(n(input.windRounds,2,1,4)),
  bots:Array.isArray(input.bots)?[0,1,2].map(i=>LEVELS.includes(input.bots[i])?input.bots[i]:'Medium'):['Easy','Medium','Hard'],speed:['instant','fast','normal','slow'].includes(input.speed)?input.speed:'normal',assist:!!input.assist};
}
function createGame(options={},rand=Math.random){const settings=validateSettings(options);const s={settings,players:Array.from({length:4},(_,i)=>({id:i,name:i===0?'You':'Bot '+i,credits:settings.starting,hand:[],flowers:[],melds:[],discards:[],lastDraw:null})),dealer:0,dealerAdvances:0,handNumber:0,finishedHands:0,wall:[],current:0,phase:'between',pending:null,result:null,lastDiscard:null,lastDiscardFromLastLive:false,discardCount:0,drawKind:null,lastLive:false,selected:null,events:[],history:[],finished:false,notice:''};newHand(s,rand);return s}
function log(s,action,p,tile='',desc=''){s.events.push({step:s.events.length+1,p,action,tile,desc})}
function drawFrom(s,p,replacement=false,reason='draw'){
 // One 144-tile wall: ordinary draws from the front, flower/season/Kong replacements from the back.
 // No reserved/dead wall: every remaining tile can be drawn.
 let source=s.wall;let tile=source.length?(replacement?source.pop():source.shift()):null;
 if(!tile)return null;
 // The final wall tile may arrive from either end.
 s.lastLive=(s.wall.length===0);if(!replacement)s.drawKind='live';
 if(isBonus(tile)){
  s.players[p].flowers.push(tile);log(s,'flower',p,tile,'Exposed bonus tile; draws replacement');
  return drawFrom(s,p,true,reason);
 }
 s.players[p].hand.push(tile);sortTiles(s.players[p].hand);
 s.players[p].lastDraw=tile;
 log(s,replacement?'replacement':'draw',p,tile,reason);
 return tile;
}
function newHand(s,rand=Math.random){
 s.handNumber++;s.wall=buildWall(rand);s.current=s.dealer;s.phase='deal';s.pending=null;s.result=null;s.lastDiscard=null;s.lastDiscardFromLastLive=false;s.discardCount=0;s.lastLive=false;s.drawKind=null;s.selected=null;s.events=[];s.decisionLog=[];s._choiceTrace=null;s.notice='';
 for(const p of s.players){p.hand=[];p.flowers=[];p.melds=[];p.discards=[];p.lastDraw=null}
 // Deal 13 tiles to each player, replacing every flower immediately from the back.
 for(let k=0;k<13;k++)for(let p=0;p<4;p++)drawFrom(s,p,false,'initial deal');
 drawFrom(s,s.dealer,false,'dealer opening draw');s.phase='discard';
 log(s,'start',s.dealer,'','New hand. Dealer: '+s.players[s.dealer].name);
}
function availableChows(hand,tile){
 if(!suit(tile))return [];
 const n=+tile.slice(1),su=tile[0],out=[];
 for(let start=n-2;start<=n;start++){
  if(start<1||start>7)continue;
  const tri=[su+start,su+(start+1),su+(start+2)],need=tri.filter(t=>t!==tile);
  if(need.every(t=>hand.includes(t)))out.push({tiles:tri,need});
 }
 return out;
}
function legalClaims(s,p,tile,from,type='discard'){
 if(p===from)return null;
 const hand=s.players[p].hand;
 const ctx={type:type==='rob'?'rob':'discard',tile,from,lastLive:type==='discard'&&s.lastDiscardFromLastLive};
 const possible=calculate(s,p,hand.concat([tile]),ctx);
 const result={hu:possible,validHu:!!possible&&possible.faan>=s.settings.minFaan,pong:false,kong:false,chows:[]};
 if(type!=='rob'){
  result.pong=countTile(hand,tile)>=2;
  result.kong=countTile(hand,tile)>=3&&s.wall.length>0;
  if(nextPlayer(from)===p)result.chows=availableChows(hand,tile);
 }
 return result;
}
function selfHu(s,p){const context={type:'self',tile:s.players[p].lastDraw,from:p,lastLive:s.lastLive,kongReplacement:s.drawKind==='kong'};return calculate(s,p,s.players[p].hand,context)}
function availableKongs(s,p){
 if(s.phase!=='discard'||s.current!==p||s.wall.length===0)return {concealed:[],added:[]};
 let concealed=[];const c=counts(s.players[p].hand);c.forEach((v,i)=>{if(v===4)concealed.push(KINDS[i])});
 const added=s.players[p].melds.filter(m=>m.type==='pong'&&s.players[p].hand.includes(m.tiles[0])).map(m=>m.tiles[0]);
 return {concealed,added};
}
function discard(s,p,tile){
 if(s.phase!=='discard'||s.current!==p)return false;
 let pl=s.players[p];if(!pl.hand.includes(tile))return false;
 recordDiscardDecision(s,p,tile);
 removeTiles(pl.hand,[tile]);pl.discards.push(tile);s.lastDiscard={p,tile};s.lastDiscardFromLastLive=s.lastLive;s.discardCount++;log(s,'discard',p,tile);s.phase='claim';s.selected=null;
 s.pending={type:'discard',tile,from:p,humanOption:null,choices:[],bots:[]};
 for(let q=0;q<4;q++)if(q!==p){const o=legalClaims(s,q,tile,p);if(q===0)s.pending.humanOption=o;else{s.pending.bots.push({p:q,claim:chooseBotClaim(s,q,tile,p,o)})}}
 return true;
}
function getDrawWait(s,p){return selfHu(s,p)}
function _estimateShanten(hand,meldCount){
 const key=hand.slice().sort((a,b)=>sortIdx.get(a)-sortIdx.get(b));
 const c=counts(key);
 let best=8;
 function rec(i,m,t,pair){
  while(i<34&&!c[i])i++;
  if(i>=34){const tcap=Math.min(t,4-meldCount-m);let sh=8-2*(m+meldCount)-tcap-pair;best=Math.min(best,sh);return}
  if(m+meldCount>4||m+meldCount+t>4||m+meldCount>=5)return;
  // remove a triplet or chow
  if(c[i]>=3){c[i]-=3;rec(i,m+1,t,pair);c[i]+=3}
  if(i<27&&i%9<=6&&c[i+1]&&c[i+2]){c[i]--;c[i+1]--;c[i+2]--;rec(i,m+1,t,pair);c[i]++;c[i+1]++;c[i+2]++}
  if(c[i]>=2){c[i]-=2;if(!pair)rec(i,m,t,1);rec(i,m,t+1,pair);c[i]+=2}
  if(i<27&&i%9<=7&&c[i+1]){c[i]--;c[i+1]--;rec(i,m,t+1,pair);c[i]++;c[i+1]++}
  if(i<27&&i%9<=6&&c[i+2]){c[i]--;c[i+2]--;rec(i,m,t+1,pair);c[i]++;c[i+2]++}
  c[i]--;rec(i,m,t,pair);c[i]++;
 }
 rec(0,0,0,0);
 if(meldCount===0){
  const distinct=c.filter(v=>v>0).length,pairs=c.reduce((n,v)=>n+Math.floor(v/2),0);
  best=Math.min(best,6-Math.min(7,pairs)+Math.max(0,7-distinct));
  const uniqueO=ORPHANS.filter(t=>c[sortIdx.get(t)]>0).length;
  const dup=ORPHANS.some(t=>c[sortIdx.get(t)]>=2)?1:0;
  best=Math.min(best,13-uniqueO-dup);
 }
 return best;
}
const shapeCache=new Map();
function shanten(hand,meldCount=0){const key=sortTiles(hand.slice()).join('')+'|'+meldCount;if(shapeCache.has(key))return shapeCache.get(key);const v=_estimateShanten(hand,meldCount);if(shapeCache.size>15000)shapeCache.clear();shapeCache.set(key,v);return v}
function botPotential(s,p,hand,melds){
 let bonus=0,all=allTiles(hand,melds),hon=all.filter(isHonor),ss=eligibleSuitGroups(all);
 if(ss.size===1)bonus+=hon.length>0?1.1:2.4;
 if(ss.size<=2)bonus+=0.2;
 const c=counts(hand), pairs=c.filter(v=>v>=2).length,trip=c.filter(v=>v>=3).length;
 bonus+=trip*0.17+pairs*0.12;
 if(melds.length===0&&pairs>=4)bonus+=pairs*0.17;
 if(all.every(isSimple))bonus+=0.4;
 for(let i=27;i<34;i++)if(c[i]>=2){bonus+=0.17;if(c[i]>=3)bonus+=0.2}
 return bonus;
}
function visibleCounts(s,viewer){const seen={};for(const t of KINDS)seen[t]=0;for(let i=0;i<4;i++){
  for(const t of s.players[i].discards)seen[t]++;
  for(const m of s.players[i].melds)if(i===viewer||!m.concealed)for(const t of m.tiles)seen[t]++;
 }
 for(const t of s.players[viewer].hand)seen[t]++;
 return seen;
}
function danger(s,p,tile){
 const visible=visibleCounts(s,p),turn=s.discardCount,level=s.settings.bots[p-1]||'Medium';if(turn<12||level==='Easy')return 0;
 const alreadyThrown=s.players.some((pl,i)=>i!==p&&pl.discards.includes(tile));
 let d=alreadyThrown?0:0.4;
 if(visible[tile]>=3)d-=0.35;
 if(isHonor(tile)&&visible[tile]<2)d+=0.5;
 for(let i=0;i<4;i++)if(i!==p){let opp=s.players[i];let suits=eligibleSuitGroups(opp.melds.flatMap(m=>m.concealed?[]:m.tiles));if(suit(tile)&&suits.size===1&&suits.has(suit(tile)))d+=0.22}
 return Math.max(0,d);
}
// The bot values a legal Hu that reaches the HOUSE Faan threshold, not just a
// structurally complete "chicken hand". All waits use own tiles and public
// information only; no unseen hand or wall contents enter these estimates.
function faanOutlook(s,p,hand,melds){
 const ts=allTiles(hand,melds), ss=eligibleSuitGroups(ts), honors=ts.some(isHonor);
 const blooms=flowerPatterns(s,p).reduce((a,x)=>a+x.faan,0);
 let fan=blooms,plans=[];
 if(!melds.some(m=>m.type==='pong'||m.type==='chow'||(m.type==='kong'&&!m.concealed)))fan+=1;
 if(ts.every(isSimple)){fan+=1;plans.push('all simples')}
 if(ss.size<=2)fan+=1;
 if(ss.size===1){fan+=honors?4:8;plans.push(honors?'half flush (one suit + honors)':'pure one-suit')}
 if(ts.length&&ts.every(isHonor)){fan+=32;plans.push('all honors')}
 for(const t of HONORS){
  const ct=ts.filter(x=>x===t).length;
  if(ct>=3){fan+=1;if(t===seatWind(s,p))fan+=1;if(t===roundWind(s))fan+=1}
 }
 const trip=melds.filter(m=>m.type==='pong'||m.type==='kong').length;
 // Complete exposed triplet group is an achieved indication of scoring direction.
 if(trip===4){fan+=3;plans.push('all triplets')}
 if(melds.length===0){
  const c=counts(hand),pairs=c.filter(n=>n>=2).length,quads=c.filter(n=>n===4).length;
  if(pairs>=5){fan+=quads>0?[3,8,16,48][Math.min(3,quads)]:3;plans.push('seven pairs')}
 }
 return {faan:fan,plans};
}
function scoreWaits(s,p,after,discarded,visible){
 let legal=[],chicken=[],bestFaan=0,copies=0;
 // Ignore transient 1st-discard Heaven/Earth bonuses in a speculative future win.
 const state={...s,discardCount:Math.max(2,s.discardCount)};
 for(const win of KINDS){
  const available=Math.max(0,4-(visible[win]||0)-(discarded===win?1:0));
  if(!available)continue;
  const result=calculate(state,p,after.concat([win]),{type:'discard',tile:win,from:(p+1)%4,lastLive:false});
  if(!result)continue;
  bestFaan=Math.max(bestFaan,result.faan);
  const item={tile:win,faan:result.faan,copies:available};
  if(result.faan>=s.settings.minFaan){legal.push(item);copies+=available}
  else chicken.push(item);
 }
 legal.sort((a,b)=>b.faan-a.faan||b.copies-a.copies);
 return {legal:legal.slice(0,8),chicken:chicken.slice(0,5),bestFaan,eligibleCopies:copies};
}
function inspectDiscards(s,p,level='Expert',randomize=false){
 const pl=s.players[p],hand=pl.hand,unique=[...new Set(hand)];
 const seen=visibleCounts(s,p),meldCount=pl.melds.length;
 let options=[];
 for(const tile of unique){
  const after=hand.slice();removeTiles(after,[tile]);
  const sh=shanten(after,meldCount),potential=botPotential(s,p,after,pl.melds);
  const outlook=faanOutlook(s,p,after,pl.melds);
  let companions=0,ct=counts(after),idx=sortIdx.get(tile);
  if(suit(tile)) for(const k of [idx-2,idx-1,idx+1,idx+2]) if(k>=0&&k<27&&Math.floor(k/9)===Math.floor(idx/9))companions+=ct[k]>0?1:0;
  const safety=danger(s,p,tile),defense=(level==='Expert'?1.8:level==='Hard'?0.7:0);
  const shScore=-sh*12,companionPenalty=companions*0.08;
  const visibleBonus=(level==='Expert'||level==='Hard')?seen[tile]*0.025:0;
  const riskPenalty=safety*defense;
  const noise=randomize?Math.random()*(level==='Medium'?.7:level==='Hard'?.2:level==='Expert'?.1:0):0;
  // A plausible high-Faan direction has a modest advantage; it is NOT yet a
  // guaranteed winning score. A ready hand is checked tile by tile exactly.
  const faanWeight=Math.min(8,outlook.faan)*0.75;
  let faanBonus=faanWeight,waits=null;
  if(sh===0){
   waits=scoreWaits(s,p,after,tile,seen);
   if(waits.eligibleCopies){faanBonus+=9+Math.min(5,waits.eligibleCopies)*1.1+Math.min(4,Math.max(0,waits.bestFaan-s.settings.minFaan))*0.35}
   else faanBonus-=18; // structurally ready but no reachable, qualifying Hu
  }else if(sh===1&&outlook.faan<s.settings.minFaan){
   faanBonus-=Math.min(3,(s.settings.minFaan-outlook.faan)*0.35);
  }
  const val=shScore+potential-companionPenalty+visibleBonus-riskPenalty+noise+faanBonus;
  options.push({tile,shanten:sh,score:Math.round(val*1000)/1000,
   faanPotential:outlook.faan,faanPlans:outlook.plans,minFaan:s.settings.minFaan,
   validWaits:waits?.legal||[],lowFaanWaits:waits?.chicken||[],eligibleCopies:waits?.eligibleCopies||0,
   bestWaitFaan:waits?.bestFaan||0,
   parts:{shanten:shScore,potential,companions:-companionPenalty,visibleBonus,defense:-riskPenalty,randomness:noise,faan:faanBonus},visible:seen[tile],danger:safety});
 }
 options.sort((x,y)=>y.score-x.score||sortIdx.get(x.tile)-sortIdx.get(y.tile));
 return options;
}
function chooseDiscard(s,p){
 const level=s.settings.bots[p-1]||'Medium',hand=s.players[p].hand;
 const ranked=inspectDiscards(s,p,level,level!=='Easy');
 const selected=level==='Easy'?hand[Math.floor(Math.random()*hand.length)]:ranked[0]?.tile;
 // Store the actual calculated alternatives (including random noise) for later review.
 s._choiceTrace={p,level,ranked:ranked.slice(0,16),selected,random:level==='Easy'};
 return selected;
}
function recordDiscardDecision(s,p,tile){
 if(!Array.isArray(s.decisionLog))s.decisionLog=[];
 const trace=s._choiceTrace?.p===p&&s._choiceTrace?.selected===tile?s._choiceTrace:null;
 const ranked=trace?.ranked||inspectDiscards(s,p,'Expert');
 const best=ranked[0],chosen=ranked.find(x=>x.tile===tile);
 s.decisionLog.push({step:s.events.length+1,p,kind:'discard',chosen:tile,recommended:best?.tile||null,
  level:trace?.level||'Expert (learning reference)',random:!!trace?.random,
  gap:best&&chosen?Math.round((best.score-chosen.score)*100)/100:0,
  choices:copy(ranked),
  // A 14-tile hand is owned by the acting player; stored solely for post-hand replay/debug.
  hand:s.players[p].hand.slice(),melds:copy(s.players[p].melds)});
 s._choiceTrace=null;
}
function humanHint(s){
 if(s.current!==0||s.phase!=='discard')return null;
 const ranked=inspectDiscards(s,0,'Expert',false);
 return ranked.length?{best:ranked[0],other:ranked.slice(1,4),waiting:shanten(s.players[0].hand,s.players[0].melds.length)}:null;
}
function chooseBotClaim(s,p,tile,from,options){
 if(options.validHu)return {kind:'hu'};
 const level=s.settings.bots[p-1]||'Medium';
 if(level==='Easy'){
  if(options.kong&&Math.random()<0.18)return {kind:'kong'};
  if(options.pong&&Math.random()<0.22)return {kind:'pong'};
  if(options.chows.length&&Math.random()<0.15)return {kind:'chow',tiles:options.chows[0].tiles};
  return null;
 }
 const before=shanten(s.players[p].hand,s.players[p].melds.length);
 const existing=s.players[p].melds, base=0;
 const beforeFaan=faanOutlook(s,p,s.players[p].hand,existing).faan;
 let cand=[];
 if(options.pong){const h=s.players[p].hand.slice();removeTiles(h,[tile,tile]);cand.push({kind:'pong',sh:shanten(h,s.players[p].melds.length+1),need:2})}
 if(options.kong){const h=s.players[p].hand.slice();removeTiles(h,[tile,tile,tile]);cand.push({kind:'kong',sh:shanten(h,s.players[p].melds.length+1),need:3})}
 for(const chow of options.chows){const h=s.players[p].hand.slice();removeTiles(h,chow.need);cand.push({kind:'chow',tiles:chow.tiles,sh:shanten(h,s.players[p].melds.length+1),need:2})}
 for(const c of cand){
  const baseTiles=c.kind==='chow'?c.tiles:Array(c.kind==='kong'?4:3).fill(tile);
  const futureMeld={type:c.kind,tiles:baseTiles,concealed:false};
  const after=s.players[p].hand.slice();
  removeTiles(after,c.kind==='chow'?c.tiles.filter(t=>t!==tile):Array(c.need).fill(tile));
  c.faanPotential=faanOutlook(s,p,after,existing.concat([futureMeld])).faan;
  c.value=-12*c.sh+c.faanPotential*0.75;
 }
 cand.sort((a,b)=>b.value-a.value||(['kong','pong','chow'].indexOf(a.kind)-['kong','pong','chow'].indexOf(b.kind)));
 const best=cand[0];
 if(!best)return null;
 // Avoid calls that wreck a valuable Faan route unless progress clearly warrants it.
 const wouldLoseFaan=best.faanPotential+2<beforeFaan;
 if(level==='Medium')return best.sh<before&&(!wouldLoseFaan||before-best.sh>=2)?best:null;
 if(best.sh<before&&(!wouldLoseFaan||before-best.sh>=2))return best;
 if(best.kind==='kong'&&best.sh<=before&&s.wall.length>0)return best;
 return null;
}
function _claimPriority(claim){return claim?({kong:3,pong:2,chow:1}[claim.kind]||0):0}
function claim(s,choice){
 if(s.phase!=='claim'||!s.pending)return false;
 const pend=s.pending,from=pend.from,tile=pend.tile;
 const entries=pend.bots.slice();if(choice&&pend.humanOption){
  const o=pend.humanOption;
  if(choice.kind==='hu'&&(o.hu||choice.force))entries.push({p:0,claim:{kind:'hu',force:!!choice.force}});
  if(choice.kind==='pong'&&o.pong)entries.push({p:0,claim:{kind:'pong'}});
  if(choice.kind==='kong'&&o.kong)entries.push({p:0,claim:{kind:'kong'}});
  if(choice.kind==='chow'&&o.chows.some(c=>c.tiles.join()==choice.tiles.join()))entries.push({p:0,claim:choice});
 }
 const hus=entries.filter(x=>x.claim&&x.claim.kind==='hu').map(x=>x.p);
 if(hus.length){enterScore(s,hus,pend.type,tile,from);return true}
 // Hu first; for equal Kong/Pong claims, the nearer seat counterclockwise from the discarder wins.
 entries.sort((a,b)=>_claimPriority(b.claim)-_claimPriority(a.claim)||((a.p-from+4)%4)-((b.p-from+4)%4));
 const winner=entries.find(x=>x.claim);
 s.pending=null;
 if(winner){
  const p=winner.p,m=winner.claim,pl=s.players[p];
  const num=m.kind==='kong'?3:m.kind==='pong'?2:2;
  let toRemove=m.kind==='chow'?m.tiles.filter(x=>x!==tile):Array(num).fill(tile);
  removeTiles(pl.hand,toRemove);
  const tiles=m.kind==='chow'?m.tiles:Array(num+1).fill(tile);
  pl.melds.push({type:m.kind==='kong'?'kong':m.kind==='pong'?'pong':'chow',tiles,concealed:false});
  log(s,m.kind,p,tile,'Claimed from '+s.players[from].name);
  // Keep discarded tile visible in discard history but mark as called.
  const arr=s.players[from].discards;arr.pop();s.current=p;
  if(m.kind==='kong'){
   s.lastLive=false;s.drawKind='kong';
   const got=drawFrom(s,p,true,'Kong replacement');
   if(!got){endDraw(s);return true}
   s.drawKind='kong';
  }else{s.lastLive=false;s.drawKind='claim'}
  s.phase='discard';return true;
 }
 s.current=nextPlayer(from);
 const got=drawFrom(s,s.current,false,'normal draw');
 if(!got)endDraw(s);else s.phase='discard';
 return true;
}
function declareConcealedKong(s,p,tile){
 const avail=availableKongs(s,p);
 if(!avail.concealed.includes(tile))return false;
 removeTiles(s.players[p].hand,[tile,tile,tile,tile]);
 s.players[p].melds.push({type:'kong',tiles:[tile,tile,tile,tile],concealed:true});
 log(s,'concealed-kong',p,tile,'Concealed Kong, four tiles face down');
 s.lastLive=false;s.drawKind='kong';
 const got=drawFrom(s,p,true,'Concealed Kong replacement');if(!got)endDraw(s);else{s.phase='discard';s.drawKind='kong'}return true;
}
function declareAddedKong(s,p,tile){
 const avail=availableKongs(s,p);if(!avail.added.includes(tile))return false;
 s.phase='claim';s.pending={type:'rob',tile,from:p,humanOption:null,bots:[]};
 for(let q=0;q<4;q++)if(q!==p){const o=legalClaims(s,q,tile,p,'rob');if(q===0)s.pending.humanOption=o;else if(o.validHu)s.pending.bots.push({p:q,claim:{kind:'hu'}})}
 log(s,'added-kong-proposal',p,tile,'Attempting to add to exposed Pong');return true;
}
function resolveRob(s,choice){
 if(!s.pending||s.pending.type!=='rob')return false;
 const {from,tile,bots,humanOption}=s.pending;
 const winners=bots.filter(x=>x.claim?.kind==='hu').map(x=>x.p);
 if(choice?.kind==='hu'&&(humanOption?.hu||choice.force))winners.push(0);
 if(winners.length){
  // Robbed tile leaves the declaring player's hand; exposed Pung remains a Pung.
  removeTiles(s.players[from].hand,[tile]);
  enterScore(s,winners,'rob',tile,from);return true;
 }
 removeTiles(s.players[from].hand,[tile]);
 const meld=s.players[from].melds.find(m=>m.type==='pong'&&m.tiles[0]===tile);
 meld.type='kong';meld.tiles.push(tile);
 log(s,'added-kong',from,tile,'Upgraded exposed Pong to Kong');
 s.pending=null;s.current=from;s.lastLive=false;s.drawKind='kong';
 const got=drawFrom(s,from,true,'Added Kong replacement');if(!got)endDraw(s);else{s.phase='discard';s.drawKind='kong'}return true;
}
function enterScore(s,winners,type,tile,from){
 const context={type,tile,from,lastLive:s.lastDiscardFromLastLive,kongReplacement:s.drawKind==='kong'};
 const results=winners.map(p=>({p,detail:calculate(s,p,s.players[p].hand.concat(type==='self'?[]:[tile]),{...context, type:type==='rob'?'rob':type}) || {kind:'unrecognized',faan:0,patterns:[],decomposition:null},adjust:0,decision:'pending',note:''}));
 s.result={type,winners:results,from,tile,settled:false};s.pending=null;s.phase='score';log(s,'hu',winners[0],tile,winners.map(x=>s.players[x].name).join(' & ')+' win');
}
function declareSelfHu(s,p,force=false){if(s.phase!=='discard'||s.current!==p)return false;const res=selfHu(s,p);if(!res&&!force)return false;enterScore(s,[p],'self',s.players[p].lastDraw,p);return true}
function endDraw(s){s.phase='score';s.result={type:'draw',winners:[],from:-1,tile:null,settled:false};s.pending=null;log(s,'exhaustive',-1,'','No tiles remain in the wall')}
function getPayments(s){
 if(!s.result)return null;const result=s.result,changes=[0,0,0,0];
 if(result.type==='draw')return {changes,details:[],pool:0,eligible:true};
 const winners=result.winners.map(w=>({p:w.p,faan:w.detail.faan+w.adjust,base:s.settings.wager*(1+0.1*(w.detail.faan+w.adjust-s.settings.minFaan))}));
 if(winners.some(w=>w.faan<s.settings.minFaan))return {eligible:false,changes,details:winners,pool:0};
 // Free-play mode: score and record the Hu, but never transfer credits.
 if(s.settings.wager===0)return {eligible:true,changes,details:winners,pool:0};
 const tenth=n=>Math.round(n*10),base10=winners.map(w=>tenth(w.base));
 if(result.type==='self'){
  const p=winners[0].p,payment=base10[0]*2;
  for(let q=0;q<4;q++)if(q!==p){changes[q]-=payment;changes[p]+=payment}
 }else if(winners.length===1){
  const p=winners[0].p,base=base10[0];
  for(let q=0;q<4;q++)if(q!==p){const pay=base*(q===result.from?2:1);changes[q]-=pay;changes[p]+=pay}
 }else{
  const highest=Math.max(...base10);const others=[0,1,2,3].filter(q=>!winners.some(w=>w.p===q));
  // Double Hu: discarder 2x + fourth player 1x; Triple Hu: sole discarder 2x.
  for(const q of others){const pay=highest*(q===result.from?2:1);changes[q]-=pay}
  const pool=-changes.reduce((a,b)=>a+b,0),weight=base10.reduce((a,b)=>a+b,0);
  let allocated=0;const shares=winners.map((w,i)=>{const exact=pool*base10[i]/weight;const flo=Math.floor(exact);allocated+=flo;return {p:w.p,amount:flo,remainder:exact-flo,index:i}});
  shares.sort((a,b)=>b.remainder-a.remainder||a.index-b.index);
  for(let i=0;i<pool-allocated;i++)shares[i%shares.length].amount++;
  for(const v of shares)changes[v.p]+=v.amount;
 }
 const delta=changes.map(x=>x/10);return {eligible:true,changes:delta,details:winners,pool:Math.round(delta.filter(v=>v>0).reduce((a,b)=>a+b,0)*10)/10};
}
function settle(s){
 if(s.phase!=='score'||!s.result)return false;
 const payout=getPayments(s);if(!payout.eligible)return false;
 for(let i=0;i<4;i++)s.players[i].credits=Math.round((s.players[i].credits+payout.changes[i])*10)/10;
 const current=s.result;current.settled=true;current.payout=payout;
 s.history.push({hand:s.handNumber,dealer:s.dealer,round:roundWind(s),events:copy(s.events),decisions:copy(s.decisionLog||[]),result:copy(current),endHands:s.players.map(p=>({name:p.name,hand:p.hand.slice(),melds:copy(p.melds),flowers:p.flowers.slice(),discards:p.discards.slice(),credits:p.credits}))});
 s.finishedHands++;
 const dealerWon=current.winners.some(w=>w.p===s.dealer);
 if(!dealerWon){s.dealer=nextPlayer(s.dealer);s.dealerAdvances++}
 s.finished=(s.settings.mode==='hands'&&s.finishedHands>=s.settings.hands)||(s.settings.mode==='winds'&&s.dealerAdvances>=s.settings.windRounds*4);
 s.phase=s.finished?'ended':'between';log(s,'settled',-1,'',current.type==='draw'?'Draw; dealer rotates':'Credits settled');return true;
}
E.KINDS=KINDS;E.BONUS=BONUS;E.NAME=NAME;E.WINDS=WINDS;E.LEVELS=LEVELS;
E.sortTiles=sortTiles;E.countTile=countTile;E.removeTiles=removeTiles;E.validateSettings=validateSettings;E.createGame=createGame;E.newHand=newHand;E.seatWind=seatWind;E.seatNumber=seatNumber;E.roundWind=roundWind;E.getDrawWait=getDrawWait;E.legalClaims=legalClaims;E.availableChows=availableChows;E.availableKongs=availableKongs;E.discard=discard;E.claim=claim;E.resolveRob=resolveRob;E.declareConcealedKong=declareConcealedKong;E.declareAddedKong=declareAddedKong;E.declareSelfHu=declareSelfHu;E.calculate=calculate;E.getPayments=getPayments;E.settle=settle;E.chooseDiscard=chooseDiscard;E.inspectDiscards=inspectDiscards;E.faanOutlook=faanOutlook;E.shanten=shanten;E.humanHint=humanHint;E.winningBonus=winningBonus;E.isBonus=isBonus;E.copy=copy;
root.MahjongEngine=E;if(typeof module!=='undefined'&&module.exports)module.exports=E;
})(typeof window!=='undefined'?window:globalThis);
