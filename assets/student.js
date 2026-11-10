import {doc,getDoc,setDoc,serverTimestamp,onSnapshot} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import {onAuthStateChanged,signInAnonymously} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {studentDb as db,studentAuth as auth,TEACHER_ID,CONFIG,CYCLES,ENROLLMENTS,RESULTS,SECTION_ORDER,SECTION_NAMES,safe} from './firebase.js';

const $=id=>document.getElementById(id);
const BANKS='nuwair12_question_banks';
let uid='',cycleId='',cycleNumber=1,activeWeek=0,name='',banks={},progress={},cycleUnsub=null,authReady=false,authError='';
const positive=['ممتاز! 🌟 إجابة صحيحة','أحسنتِ 👏 واصلي التميّز','رائعة يا نجمة ✨','إجابة موفقة 💛'];
const supportive=['محاولة جميلة 🌷 تعلّمي من الإجابة الصحيحة','لا بأس، القادم أفضل 💪','أنتِ قادرة على التقدّم ⭐','كل محاولة فرصة للتعلّم 🌸'];
let section='',qIndex=0,currentWeek=0,answeredNow=false;

function audioStart(){const a=$('nasheedAudio');if(!a)return;a.volume=.8;const p=a.play();if(p?.catch)p.catch(()=>{});}
audioStart();for(const ev of ['pointerdown','touchstart','click','keydown'])document.addEventListener(ev,audioStart,{once:true,capture:true});
$('enterBtn').onclick=()=>{$('cover').classList.add('hidden');$('app').classList.remove('hidden');audioStart();render();};

const key=()=>`nuwair12_progress_${uid}`;
function loadLocal(){try{progress=JSON.parse(localStorage.getItem(key()))||{}}catch{progress={}};name=progress.name||'';}
function saveLocal(){progress.name=name;try{localStorage.setItem(key(),JSON.stringify(progress))}catch{}}
const resultId=w=>`${cycleId}_${uid}_w${w}`;
const weekObj=w=>progress[w]||(progress[w]={imla:[],nahw:[],mana:[],qiraa:[],jumla:[]});
const answeredCount=w=>SECTION_ORDER.reduce((n,s)=>n+(weekObj(w)[s]?.filter(Boolean).length||0),0);
const weekDone=w=>answeredCount(w)===50;
function firstAvailableWeek(){for(let w=1;w<=activeWeek;w++)if(!weekDone(w))return w;return 0;}
function totalAnswered(){let n=0,c=0;for(let w=1;w<=10;w++)for(const s of SECTION_ORDER)for(const a of (weekObj(w)[s]||[]))if(a){n++;if(a.correct)c++;}return {n,c};}
function questionData(w,s,i){return banks[w]?.[s]?.questions?.[i]||null;}
async function loadQuestionBanks(){
  for(let w=1;w<=10;w++){
    try{
      const snap=await getDoc(doc(db,BANKS,`week_${w}`));
      if(!snap.exists())continue;
      const data=snap.data();
      if(data.status==='approved'&&data.publishedBank&&typeof data.publishedBank==='object')banks[w]=data.publishedBank;
    }catch(e){
      // قد لا تكون مسودة الأسبوع معتمدة؛ تحتفظ الصفحة بالنسخة الثابتة الاحتياطية إن وجدت.
      console.debug('question bank unavailable',w,e?.code||e);
    }
  }
  render();
}
async function ensureEnrollment(){
  const ref=doc(db,ENROLLMENTS,uid),snap=await getDoc(ref);
  if(snap.exists()){cycleId=snap.data().cycleId;return;}
  const cfg=await getDoc(doc(db,CONFIG,'current'));if(!cfg.exists())return;
  cycleId=cfg.data().currentCycleId;
  if(cycleId)await setDoc(ref,{ownerUid:uid,cycleId,createdAt:serverTimestamp()});
}
async function loadRemote(){
  if(!cycleId)return;
  for(let w=1;w<=10;w++){
    try{const s=await getDoc(doc(db,RESULTS,resultId(w)));if(!s.exists())continue;const d=s.data();name=name||d.studentName||'';if(d.answers&&typeof d.answers==='object')progress[w]=d.answers;}catch{}
  }
  saveLocal();
}
function watchCycle(){
  if(cycleUnsub){cycleUnsub();cycleUnsub=null;}
  if(!cycleId)return;
  cycleUnsub=onSnapshot(doc(db,CYCLES,cycleId),snap=>{
    if(!snap.exists())return;
    const nextWeek=Number(snap.data().activeWeek||0),nextNumber=Number(snap.data().number||1);
    const changed=nextWeek!==activeWeek||nextNumber!==cycleNumber;
    activeWeek=nextWeek;cycleNumber=nextNumber;
    if(changed)render();
  },e=>console.error('cycle watch',e));
}
async function loadState(){
  const cfg=await getDoc(doc(db,CONFIG,'current'));
  if(!cfg.exists()){activeWeek=0;cycleId='';render();return;}
  await ensureEnrollment();if(!cycleId)cycleId=cfg.data().currentCycleId;
  const c=await getDoc(doc(db,CYCLES,cycleId));if(c.exists()){activeWeek=Number(c.data().activeWeek||0);cycleNumber=Number(c.data().number||1);}
  watchCycle();
  await loadRemote();render();
}
async function syncWeek(w){
  if(!cycleId||!uid||!name)return;
  const obj=weekObj(w);let correct=0,wrong=0;const sectionScores={};
  for(const s of SECTION_ORDER){let c=0,b=0;for(const a of (obj[s]||[]))if(a){a.correct?c++:b++;}sectionScores[s]={correct:c,wrong:b};correct+=c;wrong+=b;}
  const answered=correct+wrong;
  try{await setDoc(doc(db,RESULTS,resultId(w)),{ownerUid:uid,teacherId:TEACHER_ID,studentName:name,cycleId,week:w,correct,wrong,answered,completed:answered===50,sectionScores,answers:obj,updatedAt:serverTimestamp()});}
  catch(e){console.error(e);$('mainStatus').textContent='تم الحفظ على جهازك، وتعذّر إرسال آخر إجابة إلى Firebase. تحققي من الإنترنت.';}
}
function render(){
  if(!$('app')||$('app').classList.contains('hidden'))return;
  const t=totalAnswered();$('scoreChip').textContent=`الإجابات: ${t.n} • الصحيح: ${t.c}`;$('progressText').textContent=Math.round(t.n/500*100)+'٪ من الرحلة';$('totalProgress').style.width=(t.n/500*100)+'%';$('cycleChip').textContent=`الدفعة ${cycleNumber}`;
  $('welcome').textContent=name?`أهلًا يا ${name} 🌷`:'أهلًا بكِ 🌷';
  $('namePanel').classList.toggle('hidden',!!name||!cycleId||!authReady);
  $('waitingPanel').classList.add('hidden');$('missionsPanel').classList.add('hidden');$('quizPanel').classList.add('hidden');
  if(!cycleId){$('mainStatus').textContent='لم تُهيّئ المعلمة المبادرة بعد.';$('waitingPanel').classList.remove('hidden');$('waitingText').textContent='عودي بعد إعلان المعلمة بدء المبادرة.';return;}
  if(!authReady){
    $('mainStatus').textContent=activeWeek>0?'✅ الأسبوع الأول مفعّل — جارٍ تجهيز دخول الطالبة…':'بانتظار تفعيل المعلمة للأسبوع الأول.';
    $('waitingPanel').classList.remove('hidden');
    $('waitingText').textContent=authError?authError:(activeWeek>0?'التفعيل وصل بنجاح. جارٍ تسجيل دخول آمن للطالبة…':'ستفتح المعلمة الأسبوع الأول يدويًا عند بدء المبادرة.');
    return;
  }
  if(!name){$('mainStatus').textContent=activeWeek>0?'الأسبوع الأول متاح الآن. اكتبي اسمكِ للبدء.':'بانتظار تفعيل المعلمة للأسبوع الأول.';if(!activeWeek){$('waitingPanel').classList.remove('hidden');$('waitingText').textContent='ستفتح المعلمة الأسبوع الأول يدويًا عند بدء المبادرة.';}return;}
  const w=firstAvailableWeek();
  if(w){currentWeek=w;$('mainStatus').textContent=`الأسبوع ${w} متاح الآن`;$('weekChip').textContent=`الأسبوع ${w} من 10`;renderMissions();return;}
  if(activeWeek===0){$('mainStatus').textContent='بانتظار تفعيل المعلمة للأسبوع الأول.';$('waitingPanel').classList.remove('hidden');return;}
  if(activeWeek<10){$('mainStatus').textContent=`🎉 أتممتِ الأسبوع ${activeWeek}!`;$('waitingPanel').classList.remove('hidden');$('waitingText').textContent=`بانتظار أن تفعّل المعلمة الأسبوع ${activeWeek+1}. إجاباتكِ السابقة محفوظة.`;return;}
  $('mainStatus').textContent='🏅 أتممتِ جميع أسابيع المبادرة!';$('waitingPanel').classList.remove('hidden');$('waitingText').textContent='أحسنتِ! يمكنكِ مراجعة إجاباتكِ السابقة في أي وقت.';
}
function renderMissions(){
  $('missionsPanel').classList.remove('hidden');const grid=$('missions');grid.innerHTML='';
  for(const s of SECTION_ORDER){const arr=weekObj(currentWeek)[s]||[];const n=arr.filter(Boolean).length;const b=document.createElement('button');b.className='mission'+(n===10?' done':'');b.disabled=n===10;b.innerHTML=`<div class="icon">${{imla:'✍️',nahw:'📐',mana:'💡',qiraa:'📖',jumla:'📝'}[s]}</div><h3>${safe(SECTION_NAMES[s])}</h3><p>${n===10?'🎉 أتممتِ هذا القسم':'10 أسئلة تفاعلية'}</p><div class="progress"><div style="width:${n*10}%"></div></div><div class="mini" style="margin-top:7px">${n} / 10</div>`;b.onclick=()=>openSection(s);grid.appendChild(b);}
}
function firstUnansweredIndex(arr){for(let i=0;i<10;i++)if(!arr[i])return i;return -1;}
function openSection(s){section=s;const arr=weekObj(currentWeek)[s]||[];qIndex=firstUnansweredIndex(arr);if(qIndex<0)return render();showQuestion();}
function showQuestion(){
  const q=questionData(currentWeek,section,qIndex);if(!q){$('mainStatus').textContent='أسئلة هذا الأسبوع لم تُعتمد بعد.';return;}
  $('missionsPanel').classList.add('hidden');$('quizPanel').classList.remove('hidden');$('sectionTitle').textContent=SECTION_NAMES[section];$('counter').textContent=`الأسبوع ${currentWeek} • سؤال ${qIndex+1} من 10`;answeredNow=false;
  $('passage').innerHTML='';const passage=banks[currentWeek]?.[section]?.passage;if(passage){const d=document.createElement('div');d.className='passage';d.textContent=passage;$('passage').appendChild(d)}
  $('prompt').textContent=q.p;$('answers').innerHTML='';$('feedback').classList.add('hidden');$('nextBtn').classList.add('hidden');
  const opts=[...q.opts].sort(()=>Math.random()-.5);for(const opt of opts){const b=document.createElement('button');b.className='answer';b.textContent=opt;b.onclick=()=>choose(opt,b,q);$('answers').appendChild(b);}
}
async function choose(opt,btn,q){
  if(answeredNow)return;answeredNow=true;const ok=opt===q.answer;for(const b of $('answers').querySelectorAll('button')){b.disabled=true;if(b.textContent===q.answer)b.classList.add('right');}if(!ok)btn.classList.add('wrong');
  const arr=weekObj(currentWeek)[section];arr[qIndex]={choice:opt,correct:ok,question:q.p,options:[...q.opts],answer:q.answer};saveLocal();
  $('feedback').className='feedback '+(ok?'good':'bad');$('feedback').textContent=(ok?positive[Math.floor(Math.random()*positive.length)]:supportive[Math.floor(Math.random()*supportive.length)]+` — الإجابة الصحيحة: ${q.answer}`);$('feedback').classList.remove('hidden');$('nextBtn').classList.remove('hidden');await syncWeek(currentWeek);
}
$('nextBtn').onclick=()=>{const arr=weekObj(currentWeek)[section]||[];const next=firstUnansweredIndex(arr);if(next<0){render();return;}qIndex=next;showQuestion();};
$('backBtn').onclick=()=>render();
$('startBtn').onclick=()=>{const v=$('studentName').value.trim();if(v.length<2)return alert('اكتبي اسمًا من حرفين على الأقل.');name=v;saveLocal();render();};
$('archiveBtn').onclick=()=>{const a=$('archive');a.classList.toggle('hidden');if(!a.classList.contains('hidden'))renderArchive();};
function renderArchive(){const root=$('archive');root.innerHTML='';let any=false;for(let w=1;w<=10;w++){const wo=weekObj(w);const count=answeredCount(w);if(!count)continue;any=true;const sec=document.createElement('div');sec.className='archive-week';sec.innerHTML=`<h3>الأسبوع ${w} — ${count} إجابة</h3>`;for(const s of SECTION_ORDER){(wo[s]||[]).forEach((a,i)=>{if(!a)return;const q=questionData(w,s,i);const prompt=a.question||q?.p||`السؤال ${i+1}`,correctAnswer=a.answer||q?.answer;const d=document.createElement('div');d.className='archive-item';d.innerHTML=`<span class="section-badge">${safe(SECTION_NAMES[s])}</span><br>${safe(prompt)}<br><span class="${a.correct?'ok':'bad'}">إجابتكِ: ${safe(a.choice)} ${a.correct?'✅':'❌'}</span>${!a.correct&&correctAnswer?`<br><span class="ok">الصحيح: ${safe(correctAnswer)}</span>`:''}`;sec.appendChild(d);});}root.appendChild(sec);}if(!any)root.innerHTML='<p class="sub">لا توجد إجابات بعد.</p>';}

async function loadPublicActivation(){
  try{
    const cfg=await getDoc(doc(db,CONFIG,'current'));
    if(!cfg.exists()){cycleId='';activeWeek=0;render();return;}
    if(!cycleId)cycleId=cfg.data().currentCycleId||'';
    if(cycleId){
      const c=await getDoc(doc(db,CYCLES,cycleId));
      if(c.exists()){activeWeek=Number(c.data().activeWeek||0);cycleNumber=Number(c.data().number||1);}
    }
    render();
  }catch(e){console.error('public activation',e);}
}
const refreshState=()=>{loadPublicActivation();if(uid){loadQuestionBanks().then(()=>loadState()).catch(e=>console.error('refresh state',e));}};
$('refreshStateBtn')?.addEventListener('click',refreshState);
window.addEventListener('pageshow',refreshState);
window.addEventListener('focus',refreshState);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshState();});

Promise.all([1,2,3].map(async w=>{const r=await fetch(`./assets/week${w}.json`);if(!r.ok)throw new Error(`week${w}.json`);banks[w]=await r.json();})).then(()=>render()).catch(console.error);
onAuthStateChanged(auth,async u=>{
  if(!u){
    authReady=false;authError='';render();
    try{await signInAnonymously(auth)}catch(e){
      console.error(e);authReady=false;authError='الأسبوع مفعّل، لكن تعذّر إنشاء دخول الطالبة. تأكدي من تفعيل Anonymous في Firebase Authentication ثم أعيدي فتح الرابط.';render();
    }
    return;
  }
  if(!u.isAnonymous){
    // لا نستخدم حساب المعلمة في صفحة الطالبات. التطبيق المنفصل يمنع التعارض، وهذه حماية إضافية.
    authReady=false;authError='جارٍ تجهيز دخول الطالبة…';render();return;
  }
  uid=u.uid;authReady=true;authError='';loadLocal();
  try{await loadQuestionBanks();await loadState();}catch(e){console.error('student state',e);authError='وصل التفعيل، لكن تعذّر تحميل بيانات الطالبة. اضغطي تحديث حالة التفعيل.';render();}
});
loadPublicActivation();
