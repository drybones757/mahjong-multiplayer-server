'use strict';
/* Custom Faan Mahjong multiplayer server. All concealed state remains on this server.
 * Zero external npm dependencies; Node 20+.
 * Transport: RFC6455 WebSocket, JSON messages. No player-supplied game state accepted.
 */
import './engine.js';
const E=globalThis.MahjongEngine;
const crypto=globalThis.crypto;
function randomInt(n){let v=new Uint32Array(1);const ceiling=Math.floor(0x100000000/n)*n;do{crypto.getRandomValues(v)}while(v[0]>=ceiling);return v[0]%n;}
function randomHex(n){const x=new Uint8Array(n);crypto.getRandomValues(x);return Array.from(x,b=>b.toString(16).padStart(2,'0')).join('');}
let rooms = new Map();
const codeChars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const randomCode = () => Array.from({length:6}, () => codeChars[randomInt(codeChars.length)]).join('');
const randomToken = () => randomHex(24);
const fairRandom = () => randomInt(0x1000000)/0x1000000;
const now = () => Date.now();
// Every discard gets the same claim window, regardless of hidden claim eligibility.
// The host can pick one of these timings, but the schedule never depends on who can claim.
const CLAIM_WINDOWS=[2500,4000,6000];
const normalizeClaimMs=v=>CLAIM_WINDOWS.includes(Number(v))?Number(v):4000;
function err(ws, code, message) { send(ws, {type:'error', code, message}); }
function isHost(room, participant) { return room.host === participant?.token; }
function validName(name) { return String(name||'Player').trim().slice(0,22).replace(/[<>\x00-\x1f]/g,'') || 'Player'; }
function safeSettings(obj={}) {
  const n=E.validateSettings(obj);
  return {mode:n.mode,hands:n.hands,windRounds:n.windRounds,minFaan:n.minFaan,wager:n.wager,starting:n.starting,bots:n.bots,speed:n.speed};
}
function members(room){return [...room.members.values()];}
function seatMember(room,seat){return members(room).find(m=>m.seat===seat)||null;}
function findSeat(room,seat){return seatMember(room,seat) || (room.bots.has(seat)?{bot:true,seat,name:'Bot '+(seat+1),connected:true}:null);}
function sanitizeMeld(m,hide){return {type:m.type,concealed:!!m.concealed,tiles:hide&&m.concealed?Array(m.tiles.length).fill('BACK'):m.tiles.slice()};}
function view(room,member){
 const g=room.game;const seat=member.seat;
 const seats=Array.from({length:4},(_,i)=>{const m=findSeat(room,i);return m?{seat:i,name:m.name,bot:!!m.bot,connected:!!(m.bot||m.ws&&!m.ws.closed),you:i===seat,host:i===0}:null});
 const res={type:'state',code:room.code,roomStatus:g?'playing':'lobby',host:isHost(room,member),you:seat,name:member.name,
  seats,allowBots:room.allowBots,claimMs:room.claimMs,settings:room.settings,notice:room.notice||'',serverTime:now()};
 if(!g)return res;
 const handComplete=g.phase==='between'||g.phase==='ended';
 res.game={phase:g.phase,current:g.current,dealer:g.dealer,handNumber:g.handNumber,finishedHands:g.finishedHands,
  round: E.roundWind(g),dealerAdvances:g.dealerAdvances,finished:g.finished,
  wallCount:g.wall.length,minFaan:g.settings.minFaan,wager:g.settings.wager,
  lastDiscard:g.lastDiscard,discardCount:g.discardCount,
  players:g.players.map((p,i)=>({name:p.name,credits:p.credits,flowers:p.flowers.slice(),discards:p.discards.slice(),
   melds:p.melds.map(m=>sanitizeMeld(m,i!==seat&&!handComplete)),hand:i===seat||handComplete?p.hand.slice():null,
   handCount:p.hand.length,lastDraw:i===seat?p.lastDraw:null})),
  events:g.events.filter(e=>['flower','discard','pong','chow','kong','concealed-kong','added-kong','hu','exhaustive'].includes(e.action)).slice(-25).map(e=>({p:e.p,action:e.action,tile:e.action==='flower'||e.action==='discard'||e.action==='pong'||e.action==='chow'||e.action==='kong'?e.tile:null})),
  result:handComplete&&g.result?E.copy(g.result):null,
  claim:room.claim?{type:room.claim.type,tile:room.claim.tile,from:room.claim.from,
    deadline:room.claim.deadline,durationMs:room.claimMs,
    // Never expose eligible seats or other players' reply status: both leak hand information.
    yours:room.claim.waiting.includes(seat)&&!room.claim.responses.has(seat)?claimOffers(g,seat):null,
    myResponse:room.claim.waiting.includes(seat)&&room.claim.responses.has(seat)?(room.claim.responses.get(seat)?.kind||'pass'):null}:null};
 return res;
}
function broadcast(room){room.updated=now();for(const m of members(room))if(m.ws&&!m.ws.closed)send(m.ws,view(room,m));}
function sync(room,ws){const m=ws.member;if(m)send(ws,view(room,m));}
function claimOffers(g,p){
 const q=g.pending;if(!q||q.from===p)return null;
 const o=E.legalClaims(g,p,q.tile,q.from,q.type);
 return {hu:!!o?.validHu,huFaan:o?.validHu?o.hu.faan:0,pong:!!o?.pong,kong:!!o?.kong,
  chows:(o?.chows||[]).map(x=>({tiles:x.tiles,need:x.need}))};
}
function validChoice(offer,choice){
 if(!choice||choice.kind==='pass')return null;
 if(choice.kind==='hu'&&offer.hu)return {kind:'hu'};
 if(choice.kind==='pong'&&offer.pong)return {kind:'pong'};
 if(choice.kind==='kong'&&offer.kong)return {kind:'kong'};
 if(choice.kind==='chow'){
  const c=offer.chows.find(x=>x.tiles.join(',')===(Array.isArray(choice.tiles)?choice.tiles.join(','):''));
  if(c)return {kind:'chow',tiles:c.tiles};
 }
 return undefined;
}
function prepareClaim(room){
 const g=room.game,q=g.pending;
 if(!q){room.claim=null;return}
 // Original solo engine computes potential bot claims for all positions 2–4.
 // Those choices must NOT be treated as real humans' decisions.
 const computed=(q.bots||[]).filter(x=>room.bots.has(x.p)&&x.claim);
 q.bots=[];
 q.humanOption=null;
 let waiting=[];const responses=new Map();
 for(let p=0;p<4;p++){
  if(p===q.from)continue;
  if(room.bots.has(p)){
   const automatic=computed.find(x=>x.p===p)?.claim||null;
   responses.set(p,automatic);
  }else{
   const o=claimOffers(g,p);
   if(o&&(o.hu||o.pong||o.kong||o.chows.length))waiting.push(p);
   else responses.set(p,null);
  }
 }
 const created=now();
 room.claim={type:q.type,tile:q.tile,from:q.from,waiting,responses,created,deadline:created+room.claimMs};
}
function resolveClaim(room){
 const q=room.claim,g=room.game;
 if(!q||now()<q.deadline)return;
 // Silence counts as Pass. All seats, including ineligible ones, use one fixed timer.
 for(const p of q.waiting)if(!q.responses.has(p))q.responses.set(p,null);
 g.pending.bots=[...q.responses].filter(([p,c])=>c).map(([p,claim])=>({p,claim}));
 room.claim=null;
 if(g.pending.type==='rob')E.resolveRob(g,null); else E.claim(g,null);
}
function drive(room){
 const g=room.game;
 for(let count=0;count<55;count++){
  if(!g)return;
  if(g.phase==='score'){
   if(!E.settle(g)){room.notice='Scoring error; hand stopped.';return}
   continue;
  }
  if(g.phase==='between'||g.phase==='ended')return;
  if(g.phase==='claim'){
   if(!room.claim)prepareClaim(room);
   if(now()>=room.claim.deadline){resolveClaim(room);continue}
   return;
  }
  if(g.phase==='discard'){
   const p=g.current;if(!room.bots.has(p))return;
   const legalHu=E.getDrawWait(g,p);
   if(legalHu&&legalHu.faan>=g.settings.minFaan){E.declareSelfHu(g,p);continue}
   const avail=E.availableKongs(g,p);
   const chance={Easy:.03,Medium:.15,Hard:.26,Expert:.36}[g.settings.bots[p-1]]||.15;
   if(avail.added.length&&Math.random()<chance){E.declareAddedKong(g,p,avail.added[0]);continue}
   if(avail.concealed.length&&Math.random()<chance){E.declareConcealedKong(g,p,avail.concealed[0]);continue}
   const tile=E.chooseDiscard(g,p);
   if(!tile||!E.discard(g,p,tile)){room.notice='Automatic player could not discard.';return}
   continue;
  }
  return;
 }
 room.notice='Server reached a move limit. Resend an action to continue.';
}
function processAction(room,member,msg){
 const g=room.game,p=member.seat;
 if(!g||p===null||p===undefined||room.bots.has(p))throw Error('You do not control an active seat.');
 const a=msg.action;
 if(a==='next'){
  if(!isHost(room,member))throw Error('Only Player 1 starts the next hand.');
  if(g.phase!=='between')throw Error('The hand has not finished.');
  E.newHand(g,fairRandom);room.claim=null;drive(room);broadcast(room);return;
 }
 if(g.phase==='discard'&&g.current===p){
  if(a==='discard'){
   if(typeof msg.tile!=='string'||!E.discard(g,p,msg.tile))throw Error('You cannot discard that tile.');
  }else if(a==='hu'){
   const r=E.getDrawWait(g,p);
   if(!r||r.faan<g.settings.minFaan||!E.declareSelfHu(g,p))throw Error('Hu does not meet the minimum Faan.');
  }else if(a==='concealedKong'||a==='addedKong'){
   if(typeof msg.tile!=='string')throw Error('Specify a Kong tile.');
   const ok=a==='concealedKong'?E.declareConcealedKong(g,p,msg.tile):E.declareAddedKong(g,p,msg.tile);
   if(!ok)throw Error('You cannot declare that Kong.');
  }else throw Error('Choose a valid move.');
  room.claim=null;drive(room);broadcast(room);return;
 }
 if(g.phase==='claim'&&room.claim&&room.claim.waiting.includes(p)){
  if(room.claim.responses.has(p))throw Error('Your response has already been recorded.');
  if(now()>=room.claim.deadline)throw Error('The claim window has closed.');
  if(a!=='claim')throw Error('Choose a claim; otherwise you will pass automatically.');
  const offered=claimOffers(g,p),choice=validChoice(offered,msg.choice);
  if(choice===undefined)throw Error('This claim is not legal.');
  room.claim.responses.set(p,choice);
  // A private confirmation only. Broadcasting a response immediately can leak
  // eligibility through websocket traffic timing, even without showing the seat.
  sync(room,member.ws);return;
 }
 throw Error('It is not your turn.');
}
// Full-match review is released only after phase='ended'. All candidate evaluations
// were captured AT THE TIME of each decision, using only that actor's hand and
// exposed public tiles. They are never streamed during a live game.
function finishedReview(room){
 const g=room.game;
 if(!g||g.phase!=='ended')throw Error('Game Review is available only after the entire match finishes.');
 return {type:'review',version:1,final:true,
  notice:'These are heuristic move comparisons, not a proven optimal-play score. Claim and Hu moves are shown in the event timeline but are not graded yet.',
  players:g.players.map((p,i)=>({seat:i,name:p.name,bot:room.bots.has(i),credits:p.credits})),
  hands:g.history.map(h=>({hand:h.hand,round:h.round,dealer:h.dealer,
   result:h.result?{type:h.result.type,from:h.result.from,tile:h.result.tile,
    winners:h.result.winners?.map(w=>({seat:w.p,faan:w.detail?.faan,patterns:(w.detail?.patterns||[]).map(x=>({name:x.name,faan:x.faan}))}))||[],
    credits:h.result.payout?.changes||[0,0,0,0]}:null,
   // Only public events in the timeline; do not distribute raw game snapshots.
   events:(h.events||[]).filter(e=>['flower','discard','pong','chow','kong','concealed-kong','added-kong','hu','exhaustive'].includes(e.action)).map(e=>({step:e.step||0,seat:e.p,action:e.action,tile:e.tile||null})),
   decisions:(h.decisions||[]).map(d=>{
    const options=d.choices||[],chosen=options.find(o=>o.tile===d.chosen),best=options[0],gap=Number(d.gap||0);
    return {step:d.step,seat:d.p,kind:'discard',played:d.chosen,best:d.recommended,
     gap,grade:d.chosen===d.recommended?'Best':gap<1.5?'Close':gap<4?'Inaccuracy':gap<8?'Mistake':'Major mistake',
     hand:(d.hand||[]).slice(),melds:(d.melds||[]).map(m=>({type:m.type,tiles:m.tiles})),
     actual:chosen?{shanten:chosen.shanten,score:chosen.score,faanPotential:chosen.faanPotential,
      qualifyingWaits:chosen.validWaits||[],bestWaitFaan:chosen.bestWaitFaan||0}:null,
     alternatives:options.slice(0,3).map(o=>({tile:o.tile,score:o.score,shanten:o.shanten,
      faanPotential:o.faanPotential,qualifyingWaits:o.validWaits||[],bestWaitFaan:o.bestWaitFaan||0}))};
   })})),
 };
}
function makeRoom(ws,msg){
 const code=(()=>{let t;do{t=randomCode()}while(rooms.has(t));return t})();
 const token=randomToken(),name=validName(msg.name);
 const room={code,host:token,members:new Map(),bots:new Set(),allowBots:msg.allowBots!==false,
  settings:safeSettings(msg.settings),claimMs:normalizeClaimMs(msg.claimMs),game:null,claim:null,notice:'',created:now(),updated:now()};
 const member={token,name,seat:0,ws,created:now()};
 room.members.set(token,member);rooms.set(code,room);attach(ws,room,member);
 send(ws,{type:'joined',code,token,seat:0});broadcast(room);
}
function attach(ws,room,member){
 if(ws.member&&ws.member!==member){const old=ws.member; if(old.ws===ws)old.ws=null}
 if(member.ws&&member.ws!==ws&&!member.ws.closed){const prev=member.ws;prev.member=null;send(prev,{type:'replaced',message:'This seat was reconnected on another device.'});prev.close()}
 member.ws=ws;ws.member=member;ws.room=room;room.updated=now();ws.serializeAttachment({code:room.code,token:member.token});
}
function joinRoom(ws,msg){
 const code=String(msg.code||'').trim().toUpperCase(),room=rooms.get(code);
 if(!room)throw Error('Room not found. Check the code or whether the server restarted.');
 if(room.game)throw Error('This game has started. Only existing players can reconnect.');
 if(members(room).length>=4)throw Error('The room is full.');
 let seat=Number.isInteger(msg.seat)&&msg.seat>=1&&msg.seat<=3?msg.seat:null;
 if(seat!==null&&seatMember(room,seat))throw Error('That player seat is taken.');
 if(seat===null)seat=[1,2,3].find(p=>!seatMember(room,p));
 if(seat===undefined)throw Error('No seat is available.');
 const token=randomToken(),member={token,name:validName(msg.name),seat,ws,created:now()};
 room.members.set(token,member);attach(ws,room,member);
 send(ws,{type:'joined',code,token,seat});broadcast(room);
}
function reconnect(ws,msg){
 const code=String(msg.code||'').trim().toUpperCase(),room=rooms.get(code),token=String(msg.token||'');
 const member=room?.members.get(token);
 if(!member)throw Error('Reconnect information expired or invalid. Join another room.');
 attach(ws,room,member);send(ws,{type:'joined',code,token,seat:member.seat,reconnected:true});broadcast(room);
}
function handle(ws,msg){
 if(!msg||typeof msg!=='object'||Array.isArray(msg))throw Error('Invalid message.');
 if(['create','join','reconnect'].includes(msg.type)&&ws.member)throw Error('Leave your current room before entering another.');
 if(msg.type==='create')return makeRoom(ws,msg);
 if(msg.type==='join')return joinRoom(ws,msg);
 if(msg.type==='reconnect')return reconnect(ws,msg);
 const room=ws.room,member=ws.member;
 if(!room||!member)throw Error('Create or join a room first.');
 room.updated=now();
 if(msg.type==='sync'){sync(room,ws);return}
 if(msg.type==='review'){send(ws,finishedReview(room));return;}
 // No Admin Hu, forced calls, AI advice, or live decision traces in online rooms.
 if(msg.type==='hint'||msg.type==='debug'||msg.type==='coach'||msg.type==='adminHu'||msg.type==='forceHu')throw Error('Live AI assistance and Admin Hu are disabled in online games.');
 if(msg.type==='action'&&(msg.force||msg.admin||msg.override||msg.adjust))throw Error('Admin overrides are disabled in online games.');
 if(msg.type==='seat'){
  if(room.game)throw Error('Seats are locked once play begins.');
  const seat=Number(msg.seat);
  if(!Number.isInteger(seat)||seat<1||seat>3||isHost(room,member))throw Error('Only guests can choose seats 2, 3, or 4.');
  if(seatMember(room,seat))throw Error('That seat is occupied.');
  member.seat=seat;broadcast(room);return;
 }
 if(msg.type==='settings'){
  if(room.game||!isHost(room,member))throw Error('Only the host can edit settings before starting.');
  room.settings=safeSettings(msg.settings);room.allowBots=!!msg.allowBots;room.claimMs=normalizeClaimMs(msg.claimMs);broadcast(room);return;
 }
 if(msg.type==='start'){
  if(room.game||!isHost(room,member))throw Error('Only Player 1 can start the game.');
  const n=members(room).filter(m=>m.ws&&!m.ws.closed).length;
  if(!room.allowBots&&n!==4)throw Error('Four connected human players are required when bot substitution is disabled.');
  // Before starting, disconnected guests count as missing seats.
  if(room.allowBots)for(const m of members(room))if(m.seat>0&&(!m.ws||m.ws.closed))room.members.delete(m.token);
  room.bots=new Set([1,2,3].filter(p=>!seatMember(room,p)));
  room.game=E.createGame(room.settings,fairRandom);
  for(let p=0;p<4;p++)room.game.players[p].name=findSeat(room,p)?.name||'Bot '+(p+1);
  room.notice='Game started by Player 1.';drive(room);broadcast(room);return;
 }
 if(msg.type==='action'){
  // Resolve overdue claim windows before checking whether this client can move.
  if(room.claim&&now()>=room.claim.deadline){resolveClaim(room);drive(room);broadcast(room);}
  return processAction(room,member,msg);
 }
 if(msg.type==='leave'){
  if(room.game)throw Error('You can disconnect and later reconnect, but cannot abandon a seat mid-game.');
  if(isHost(room,member)){
   for(const m of members(room))if(m.ws&&m.ws!==ws)send(m.ws,{type:'closed',message:'The host closed this room.'});
   rooms.delete(room.code);for(const m of members(room)){if(m.ws){m.ws.room=null;m.ws.member=null}};
  }else {room.members.delete(member.token);broadcast(room)}
  ws.member=null;ws.room=null;send(ws,{type:'left'});return;
 }
 throw Error('Unknown action.');
}

// One hibernating SQLite-backed Durable Object holds this small family game's rooms.
// The old Android clients continue to use the exact same /ws JSON protocol.
function send(ws,data){if(ws&&!ws.closed){try{ws.send(JSON.stringify(data));}catch(e){ws.closed=true;}}}
function restore(saved){
 rooms=new Map();
 for(const x of (saved||[])){
  const room={code:x.code,host:x.host,allowBots:x.allowBots,settings:x.settings,notice:x.notice||'',
   created:x.created,updated:x.updated,game:x.game,claimMs:normalizeClaimMs(x.claimMs),bots:new Set(x.bots||[]),
   claim:x.claim?{...x.claim,responses:new Map(x.claim.responses||[])}:null,members:new Map()};
  for(const m of (x.members||[]))room.members.set(m.token,{...m,ws:null});
  rooms.set(room.code,room);
 }
}
function snapshot(){
 return [...rooms.values()].map(r=>({code:r.code,host:r.host,allowBots:r.allowBots,claimMs:r.claimMs,settings:r.settings,
  notice:r.notice,created:r.created,updated:r.updated,game:r.game,bots:[...r.bots],
  claim:r.claim?{...r.claim,responses:[...r.claim.responses]}:null,
  members:members(r).map(m=>({token:m.token,name:m.name,seat:m.seat,created:m.created}))}));
}
export class MahjongRooms {
 constructor(ctx,env){
  this.ctx=ctx;this.env=env;
  this.ready=ctx.blockConcurrencyWhile(async()=>{
   restore(await ctx.storage.get('mahjong_rooms')||[]);
   for(const ws of ctx.getWebSockets()){
    ws.closed=false;
    const a=ws.deserializeAttachment();const room=rooms.get(a?.code),m=room?.members.get(a?.token);
    if(m){ws.room=room;ws.member=m;m.ws=ws;}else{ws.room=null;ws.member=null;}
   }
  });
 }
 async fetch(request){
  await this.ready;
  const path=new URL(request.url).pathname;
  if(path==='/'||path==='/health')return Response.json({app:'Custom Faan Mahjong',multiplayer:'ready',rooms:rooms.size,version:'cloudflare-2.3'});
  if(path!=='/ws'||request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('Not found',{status:404});
  const pair=new WebSocketPair(),client=pair[0],server=pair[1];
  this.ctx.acceptWebSocket(server);
  server.closed=false;server.room=null;server.member=null;server.rate=0;server.rateAt=now();
  return new Response(null,{status:101,webSocket:client});
 }
 async webSocketMessage(ws,data){
  await this.ready;
  if(typeof data!=='string'||data.length>65536){err(ws,'protocol','Invalid message size');return;}
  const t=now();if(t-(ws.rateAt||0)>1000){ws.rateAt=t;ws.rate=0;}
  if(++ws.rate>25){err(ws,'protocol','Too many requests');return;}
  let msg;try{msg=JSON.parse(data)}catch(e){err(ws,'json','Invalid JSON');return;}
  try{handle(ws,msg);}catch(e){err(ws,'rules',e.message)}
  await this.save();
 }
 async webSocketClose(ws){
  await this.ready;ws.closed=true;
  if(ws.member?.ws===ws){ws.member.ws=null;if(ws.room)broadcast(ws.room);}
  await this.save();
 }
 async webSocketError(ws){await this.webSocketClose(ws);}
 async alarm(){
  await this.ready;const t=now();
  for(const r of rooms.values()){
   if(r.claim&&t>=r.claim.deadline){resolveClaim(r);drive(r);broadcast(r);}
   if(t-r.updated>86400000){for(const m of members(r))try{m.ws?.close(1000,'Room expired')}catch(e){}rooms.delete(r.code)}
  }
  await this.save();
 }
 async save(){
  // A new message or alarm persists the complete room and concealed state. Never expose storage via HTTP.
  await this.ctx.storage.put('mahjong_rooms',snapshot());
  const t=now(),due=[];
  for(const r of rooms.values()){
   due.push(r.updated+86400000);
   if(r.claim)due.push(r.claim.deadline);
  }
  if(due.length)await this.ctx.storage.setAlarm(Math.max(t+1000,Math.min(...due)));
  else await this.ctx.storage.deleteAlarm();
 }
}
export default {
 async fetch(request,env){
  const path=new URL(request.url).pathname;
  if(!['/','/health','/ws'].includes(path))return new Response('Not found',{status:404});
  if(path==='/ws'&&request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('WebSocket upgrade required',{status:426});
  const id=env.ROOMS.idFromName('family-rooms');return env.ROOMS.get(id).fetch(request);
 }
};