'use strict';
const $ = id => document.getElementById(id);
const defaults = [2,3,7,5,3,1,1,1,1,1];
const defaultLabels = ['挨拶','話題1','話題2','話題3','まとめ'];
const items = defaults.map((min,index)=>({id:index,min,sec:0,label:defaultLabels[index]||'',enabled:index<5}));
let running=false,started=false,finished=false,base=0,origin=0,muted=true,audioContext=null,alertTimeout,noticeTimeout;
const fired=new Set();
const elapsedNow=()=>base+(running?Math.max(0,Date.now()-origin):0);
const secondsOf=item=>item.min*60+item.sec;
const formatTime=seconds=>{seconds=Math.max(0,Math.floor(seconds));const h=Math.floor(seconds/3600),m=Math.floor(seconds%3600/60),s=seconds%60;return(h?String(h).padStart(2,'0')+':':'')+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');};
const displayName=item=>item.label.trim()||'項目'+String(item.id+1).padStart(2,'0');
// Durations run in row order; each deadline is the cumulative duration.
const active=()=>items.filter(x=>x.enabled);
function schedule(){let end=0;return active().map(item=>{const start=end;end+=secondsOf(item);return {...item,start,end};});}
const totalSeconds=()=>active().reduce((sum,item)=>sum+secondsOf(item),0);
function notice(message){$('notice').textContent=message;clearTimeout(noticeTimeout);noticeTimeout=setTimeout(()=>$('notice').textContent='',4000);}
function readSettings(){
 const proposed=items.map(item=>{const row=$('row-'+item.id);return {...item,enabled:row.querySelector('.enabled').checked,label:row.querySelector('.label-input').value,min:Number(row.querySelector('.minutes').value),sec:Number(row.querySelector('.seconds').value)};});
 for(const item of proposed.filter(x=>x.enabled)){const row=$('row-'+item.id);if(!row.querySelector('.minutes').value.trim()||!row.querySelector('.seconds').value.trim()||!Number.isInteger(item.min)||!Number.isInteger(item.sec)||item.min<0||item.min>999||item.sec<0||item.sec>59||secondsOf(item)===0){$('error').textContent='No. '+String(item.id+1).padStart(2,'0')+' の時間を確認してください。分は0〜999、秒は0〜59で、1秒以上に設定します。';return false;}}
 if(!proposed.some(x=>x.enabled)){$('error').textContent='少なくとも1個のお知らせを有効にしてください。';return false;}
 Object.assign(items,proposed);$('error').textContent='';return true;
}
function renderRows(){
 $('rows').innerHTML=items.map(item=>'<div class="row" id="row-'+item.id+'"><input class="enabled" type="checkbox" '+(item.enabled?'checked':'')+' aria-label="お知らせ'+(item.id+1)+'を有効にする"><span class="row-number">'+String(item.id+1).padStart(2,'0')+'</span><input class="label-input" type="text" maxlength="40" value="'+item.label+'" placeholder="項目'+String(item.id+1).padStart(2,'0')+'" aria-label="お知らせ'+(item.id+1)+'の名前"><div class="time-inputs"><input class="minutes" type="number" inputmode="numeric" min="0" max="999" step="1" value="'+item.min+'" aria-label="お知らせ'+(item.id+1)+'の分"><span>分</span><input class="seconds" type="number" inputmode="numeric" min="0" max="59" step="1" value="0" aria-label="お知らせ'+(item.id+1)+'の秒"><span>秒</span></div></div>').join('');
 $('rows').addEventListener('input',()=>{if(!started){readSettings();render();}});
}
async function prepareAudio(){try{audioContext=audioContext||new(window.AudioContext||window.webkitAudioContext)();if(audioContext.state!=='running')await audioContext.resume();return audioContext.state==='running';}catch{return false;}}
function chime(){if(muted||!audioContext||audioContext.state!=='running')return;const t=audioContext.currentTime;[660,880,1100].forEach((hz,index)=>{const o=audioContext.createOscillator(),g=audioContext.createGain();o.type='sine';o.frequency.value=hz;g.gain.setValueAtTime(0,t+index*.22);g.gain.linearRampToValueAtTime(.18,t+index*.22+.015);g.gain.exponentialRampToValueAtTime(.001,t+index*.22+.45);o.connect(g);g.connect(audioContext.destination);o.start(t+index*.22);o.stop(t+index*.22+.5);});}
function clearAlert(){clearTimeout(alertTimeout);$('monitor').classList.remove('alerting');$('alert').hidden=true;}
function showAlert(due,test=false){
 clearTimeout(alertTimeout);$('monitor').classList.remove('alerting');void $('monitor').offsetWidth;$('monitor').classList.add('alerting');
 $('alert-title').textContent=test?'お知らせのテスト':finished?'予定時間が終了しました':due.map(displayName).join(' / ')+' の時間が終了';
 $('alert-detail').textContent=test?'点滅と音の設定を確認できます。':finished?'すべての項目が終了しました。':'次の項目に進みました。';
 $('alert').hidden=false;chime();alertTimeout=setTimeout(()=>$('monitor').classList.remove('alerting'),6000);
}
function render(){
 const ms=elapsedNow(),seconds=ms/1000,list=schedule(),next=list.find(x=>!fired.has(x.id)),total=totalSeconds(),completed=list.filter(x=>fired.has(x.id)).length;
 $('elapsed').textContent=formatTime(Math.ceil(Math.max(0,total-seconds)));$('total-note').textContent='経過 '+formatTime(seconds)+' / 合計 '+formatTime(total);$('status').classList.toggle('running',running);$('status').lastElementChild.textContent=running?'進行中':finished?'終了':started?'一時停止中':'待機中';
 $('start').textContent=running?'一時停止':finished?'もう一度開始':started?'再開する':'開始する';$('reset').disabled=!started;
 $('next-caption').textContent=next?(started?'現在の項目 · ':'最初の項目 · ')+String(next.id+1).padStart(2,'0'):'すべての項目が終了';
 $('next-label').textContent=next?displayName(next):'おつかれさまでした';
 $('remaining').textContent=next?formatTime(Math.ceil(Math.max(0,next.end-seconds))):'00:00';$('remaining-label').textContent=next?'この項目の残り':'終了';
 $('count').textContent=list.length+'項目';$('total-budget').textContent=formatTime(total);$('progress-value').textContent=completed+' / '+list.length+' 項目';
 const percent=total?Math.min(100,seconds/total*100):0;$('fill').style.width=percent+'%';document.querySelector('.track').setAttribute('aria-valuenow',String(Math.round(percent)));
 for(const item of items){const row=$('row-'+item.id),done=fired.has(item.id);row.classList.toggle('off',!item.enabled);row.classList.toggle('done',done);row.classList.toggle('next-row',next?.id===item.id);row.querySelector('.row-number').textContent=done?'✓':String(item.id+1).padStart(2,'0');row.querySelectorAll('input').forEach(input=>input.disabled=started);}
}
function tick(){if(running){const seconds=elapsedNow()/1000,total=totalSeconds(),due=schedule().filter(item=>!fired.has(item.id)&&seconds>=item.end);if(seconds>=total){base=total*1000;origin=0;running=false;finished=true;}if(due.length){due.forEach(item=>fired.add(item.id));showAlert(due);}}render();}
function toggleTimer(){if(running){tick();base=elapsedNow();running=false;}else{if(finished)resetTimer();if(!started&&!readSettings())return;started=true;origin=Date.now();running=true;if(!muted)void prepareAudio();}render();}
function resetTimer(){running=false;started=false;finished=false;base=0;origin=0;fired.clear();clearAlert();$('error').textContent='';render();}
$('start').addEventListener('click',toggleTimer);$('reset').addEventListener('click',resetTimer);$('ack').addEventListener('click',clearAlert);
$('sound').addEventListener('click',async()=>{if(muted){if(!await prepareAudio()){notice('音を有効にできませんでした。点滅でお知らせします。');return;}muted=false;}else{muted=true;if(audioContext)await audioContext.suspend();}$('sound').setAttribute('aria-pressed',String(muted));$('sound').querySelector('span').textContent=muted?'ミュート中':'音あり';$('sound').querySelector('svg').innerHTML=muted?'<path d="M11 5L6 9H3v6h3l5 4V5zM16 9l6 6m0-6l-6 6"/>':'<path d="M11 5L6 9H3v6h3l5 4V5zM15 8a6 6 0 010 8m3-11a10 10 0 010 14"/>';});
$('test').addEventListener('click',async()=>{if(!muted)await prepareAudio();showAlert([],true);});
function toggleDisplayMode(){const expanded=document.body.classList.toggle('display-mode');$('fullscreen').querySelector('span').textContent=expanded?'設定に戻る':'表示を拡大';$('fullscreen').setAttribute('aria-pressed',String(expanded));window.scrollTo({top:0});}
$('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else toggleDisplayMode();}catch{toggleDisplayMode();}});
document.addEventListener('fullscreenchange',()=>{$('fullscreen').querySelector('span').textContent=document.fullscreenElement?'全画面を終了':'全画面';});
document.addEventListener('keydown',event=>{if(event.code==='Space'&&!event.repeat&&!['INPUT','TEXTAREA','BUTTON','SELECT'].includes(document.activeElement?.tagName)&&!document.activeElement?.isContentEditable){event.preventDefault();toggleTimer();}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick();});
renderRows();render();setInterval(tick,100);
// The same state can be read by browser agents when WebMCP is supported.
const modelContext=document.modelContext,lifecycle=new AbortController();
if(modelContext?.registerTool){try{Promise.resolve(modelContext.registerTool({name:'read_timer_state',title:'タイマーの状態を確認',description:'Read the sequential presentation timer, total duration, elapsed time, remaining time and scheduled sections without changing the timer.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute(input){if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length)throw new Error('Expected an empty object.');return {running,finished,elapsedSeconds:Math.floor(elapsedNow()/1000),totalSeconds:totalSeconds(),remainingSeconds:Math.ceil(Math.max(0,totalSeconds()-elapsedNow()/1000)),muted,sections:schedule().map(item=>({number:item.id+1,durationSeconds:secondsOf(item),startSeconds:item.start,endSeconds:item.end,label:displayName(item),passed:fired.has(item.id)}))};}},{signal:lifecycle.signal})).catch(()=>{});}catch{}window.addEventListener('pagehide',event=>{if(!event.persisted)lifecycle.abort();});}
