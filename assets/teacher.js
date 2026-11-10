import {doc,getDoc,setDoc,updateDoc,collection,getDocs,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import {signInWithEmailAndPassword,signOut,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {db,auth,TEACHER_EMAIL,TEACHER_ID,CONFIG,CYCLES,RESULTS,SECTION_ORDER,SECTION_NAMES,safe} from './firebase.js';

const $=id=>document.getElementById(id);
const BANKS='nuwair12_question_banks';
const SECTION_ICONS={imla:'✍️',nahw:'📐',mana:'💡',qiraa:'📖',jumla:'📝'};
let logged=false,config=null,cycles=[],selectedCycle='',selectedWeek=1,rows=[];
let bankRecords={},editingWeek=1,editingBank=null,bankDirty=false;
const clone=value=>JSON.parse(JSON.stringify(value));
const emptyBank=()=>Object.fromEntries(SECTION_ORDER.map(s=>[s,{title:SECTION_NAMES[s],passage:null,questions:[]} ]));

$('loginBtn').onclick=async()=>{const email=$('email').value.trim(),pw=$('password').value;try{$('loginMsg').textContent='جارٍ الدخول…';await signInWithEmailAndPassword(auth,email,pw);}catch(e){console.error(e);$('loginMsg').textContent='تعذر الدخول. تحققي من البريد وكلمة المرور.';}};
$('logoutBtn').onclick=()=>signOut(auth);
onAuthStateChanged(auth,async u=>{
  logged=!!u&&u.email===TEACHER_EMAIL;
  $('loginCard').classList.toggle('hidden',logged);
  $('dashboard').classList.toggle('hidden',!logged);
  if(u&&!logged){await signOut(auth);$('loginMsg').textContent='هذا الحساب غير مخوّل للوحة نوير.';return;}
  if(logged){
    await loadControl();
    await loadQuestionBanks();
    await loadResults();
    renderWeeks();
  }
});

async function loadControl(){
  const snap=await getDoc(doc(db,CONFIG,'current'));config=snap.exists()?snap.data():null;
  $('setupBox').classList.toggle('hidden',!!config);cycles=[];
  if(!config){$('controlNotice').textContent='لم تُهيّئي المبادرة بعد. اضغطي زر التهيئة مرة واحدة، ثم اعتمدي الأسئلة وفعّلي الأسبوع الأول عند وقت الإطلاق.';$('weeks').innerHTML='';return;}
  const cs=await getDocs(collection(db,CYCLES));cs.forEach(x=>{const d=x.data();if(d.teacherId===TEACHER_ID)cycles.push({id:x.id,...d})});
  cycles.sort((a,b)=>(a.number||0)-(b.number||0));
  selectedCycle=selectedCycle||config.currentCycleId;renderCyclePicker();renderWeeks();
  $('controlNotice').textContent=`الدفعة الحالية: ${cycles.find(c=>c.id===config.currentCycleId)?.number||1}. لا يُفتح أي أسبوع إلا بعد اعتماد أسئلته ثم ضغط زر التفعيل.`;
}
$('setupBtn').onclick=async()=>{
  if(!confirm('تهيئة المبادرة لأول مرة؟ لن يبدأ أي أسبوع حتى تعتمدي أسئلته وتضغطي تفعيل الأسبوع الأول.'))return;
  try{
    await setDoc(doc(db,CYCLES,'cycle_1'),{teacherId:TEACHER_ID,number:1,activeWeek:0,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
    await setDoc(doc(db,CONFIG,'current'),{teacherId:TEACHER_ID,currentCycleId:'cycle_1',cycleCount:1,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
    await loadControl();
  }catch(e){console.error(e);alert('تعذرت التهيئة. تأكدي من نشر قواعد Firebase الجديدة.');}
};
function renderCyclePicker(){const p=$('cyclePicker');p.innerHTML='';for(const c of cycles){const o=document.createElement('option');o.value=c.id;o.textContent=`الدفعة ${c.number}${c.id===config.currentCycleId?' (الحالية)':''}`;p.appendChild(o);}p.value=selectedCycle;}
$('cyclePicker').onchange=e=>{selectedCycle=e.target.value;selectedWeek=1;renderWeeks();renderTabs();renderResults();};

// ---------------- إدارة مسودات الأسئلة ----------------
async function loadQuestionBanks(){
  bankRecords={};
  for(let w=1;w<=10;w++){
    const id=`week_${w}`,ref=doc(db,BANKS,id);
    try{
      const snap=await getDoc(ref);
      if(snap.exists()){
        const d=snap.data();
        bankRecords[w]={...d,draftBank:d.draftBank||d.publishedBank||emptyBank()};
        continue;
      }
      let seed=emptyBank();
      if(w<=3){
        const response=await fetch(`../assets/week${w}.json`);
        if(response.ok)seed=await response.json();
      }
      const approved=w<=3&&SECTION_ORDER.every(s=>(seed[s]?.questions||[]).length===10);
      const record={teacherId:TEACHER_ID,week:w,status:approved?'approved':'draft',pendingReview:false,draftBank:seed,publishedBank:approved?seed:null,publishedVersion:approved?1:0,createdAt:serverTimestamp(),updatedAt:serverTimestamp()};
      await setDoc(ref,record,{merge:true});
      bankRecords[w]={...record};
    }catch(e){
      console.error('question bank load',w,e);
      bankRecords[w]={teacherId:TEACHER_ID,week:w,status:'draft',pendingReview:false,draftBank:emptyBank(),publishedBank:null,loadError:true};
    }
  }
  renderBankManager();renderWeeks();
}
function bankStatusLabel(rec){
  if(!rec||rec.loadError)return 'تعذر تحميل المسودة — راجعي قواعد Firestore';
  if(rec.status==='approved'&&rec.pendingReview)return 'معتمد سابقًا — توجد تعديلات محفوظة تنتظر اعتمادك';
  if(rec.status==='approved')return 'معتمد وجاهز للنشر عند التفعيل';
  return 'مسودة — لم تُعتمد بعد';
}
function bankCounts(bank){return SECTION_ORDER.map(s=>({section:s,count:bank?.[s]?.questions?.length||0}));}
function renderBankManager(){
  const picker=$('bankWeekPicker');if(!picker)return;
  picker.innerHTML='';
  for(let w=1;w<=10;w++){const o=document.createElement('option');o.value=String(w);o.textContent=`الأسبوع ${w}`;picker.appendChild(o);}
  picker.value=String(editingWeek);
  const rec=bankRecords[editingWeek];
  $('bankStatus').textContent=`${bankStatusLabel(rec)}${rec?.publishedVersion?` • الإصدار المنشور ${rec.publishedVersion}`:''}`;
  $('bankStatus').className='notice '+(rec?.status==='approved'&&!rec?.pendingReview?'good':'info');
  const summary=$('bankSummary');summary.innerHTML='';
  bankCounts(rec?.draftBank).forEach(x=>{const item=document.createElement('div');item.className='mini-stat';const name=document.createElement('span');name.textContent=SECTION_NAMES[x.section];const count=document.createElement('b');count.textContent=`${x.count} / 10 أسئلة`;item.append(name,count);summary.appendChild(item);});
  editingBank=clone(rec?.draftBank||emptyBank());bankDirty=false;renderBankEditor();
}
$('bankWeekPicker').onchange=e=>{
  if(bankDirty&&!confirm('عندك تعديلات غير محفوظة. الانتقال للأسبوع الآخر سيلغيها. متابعة؟')){e.target.value=String(editingWeek);return;}
  editingWeek=Number(e.target.value);renderBankManager();
};
function markBankDirty(){bankDirty=true;$('bankStatus').textContent='توجد تعديلات غير محفوظة. احفظي المسودة قبل الانتقال أو الاعتماد.';$('bankStatus').className='notice';}
function addField(parent,label,value,onInput,rows=1){
  const wrap=document.createElement('label');wrap.className='bank-field';
  const cap=document.createElement('span');cap.textContent=label;wrap.appendChild(cap);
  const el=rows>1?document.createElement('textarea'):document.createElement('input');
  el.className='field';if(rows>1)el.rows=rows;el.value=value||'';el.addEventListener('input',()=>onInput(el.value));wrap.appendChild(el);parent.appendChild(wrap);return el;
}
function renderBankEditor(){
  const root=$('bankEditor');root.innerHTML='';
  if(!editingBank){root.textContent='لا توجد مسودة محمّلة.';return;}
  for(const s of SECTION_ORDER){
    const data=editingBank[s]||(editingBank[s]={title:SECTION_NAMES[s],passage:null,questions:[]});
    if(!Array.isArray(data.questions))data.questions=[];
    const sectionCard=document.createElement('section');sectionCard.className='bank-section';
    const heading=document.createElement('div');heading.className='row';
    const h=document.createElement('h3');h.textContent=`${SECTION_ICONS[s]} ${SECTION_NAMES[s]}`;
    const count=document.createElement('span');count.className='chip';count.textContent=`${data.questions.length} / 10`;
    heading.append(h,count);sectionCard.appendChild(heading);
    if(s==='qiraa')addField(sectionCard,'النص القرائي',data.passage||'',v=>{data.passage=v;markBankDirty();},5);
    data.questions.forEach((q,i)=>{
      const card=document.createElement('div');card.className='bank-question';
      const top=document.createElement('div');top.className='row';
      const title=document.createElement('b');title.textContent=`السؤال ${i+1}`;
      const del=document.createElement('button');del.type='button';del.className='btn danger small';del.textContent='حذف السؤال';
      del.onclick=()=>{if(!confirm(`حذف السؤال ${i+1} من المسودة؟`))return;data.questions.splice(i,1);data.questions.forEach((x,j)=>x.n=j+1);markBankDirty();renderBankEditor();};
      top.append(title,del);card.appendChild(top);
      addField(card,'نص السؤال',q.p||'',v=>{q.p=v;markBankDirty();},2);
      const options=document.createElement('div');options.className='bank-options';
      const currentAnswerIndex=Math.max(0,(q.opts||[]).indexOf(q.answer));
      q.opts=Array.isArray(q.opts)?q.opts:['','',''];while(q.opts.length<3)q.opts.push('');
      const answerIndex=q.opts.indexOf(q.answer);
      const optionSelect=document.createElement('select');optionSelect.className='field';
      q.opts.forEach((v,j)=>{const o=document.createElement('option');o.value=String(j);o.textContent=`الخيار ${j+1}: ${v||'فارغ'}`;optionSelect.appendChild(o);});
      optionSelect.value=String(Math.max(0,answerIndex));
      for(let j=0;j<3;j++){
        const inp=addField(options,`الخيار ${j+1}`,q.opts[j],v=>{
          const selected=q.opts.indexOf(q.answer);q.opts[j]=v;if(selected===j)q.answer=v;
          optionSelect.options[j].textContent=`الخيار ${j+1}: ${v||'فارغ'}`;markBankDirty();
        });
      }
      const answerWrap=document.createElement('label');answerWrap.className='bank-field';const answerLabel=document.createElement('span');answerLabel.textContent='الإجابة الصحيحة';answerWrap.appendChild(answerLabel);
      optionSelect.onchange=()=>{q.answer=q.opts[Number(optionSelect.value)]||'';markBankDirty();};answerWrap.appendChild(optionSelect);options.appendChild(answerWrap);card.appendChild(options);
      sectionCard.appendChild(card);
    });
    const add=document.createElement('button');add.type='button';add.className='btn soft small';add.textContent='＋ إضافة سؤال';add.disabled=data.questions.length>=10;
    add.onclick=()=>{data.questions.push({n:data.questions.length+1,p:'',opts:['','',''],answer:''});markBankDirty();renderBankEditor();};
    sectionCard.appendChild(add);root.appendChild(sectionCard);
  }
  const rec=bankRecords[editingWeek];
  $('saveDraftBtn').disabled=!!rec?.loadError;
  $('approveBankBtn').disabled=!!rec?.loadError;
}
function validateBank(bank){
  for(const s of SECTION_ORDER){
    const questions=bank?.[s]?.questions||[];
    if(questions.length!==10)return `${SECTION_NAMES[s]}: يجب أن يحتوي القسم على 10 أسئلة بالضبط (الموجود ${questions.length}).`;
    for(let i=0;i<questions.length;i++){
      const q=questions[i],opts=(q.opts||[]).map(x=>String(x||'').trim());
      if(!String(q.p||'').trim())return `${SECTION_NAMES[s]} — السؤال ${i+1}: اكتبي نص السؤال.`;
      if(opts.length!==3||opts.some(x=>!x))return `${SECTION_NAMES[s]} — السؤال ${i+1}: اكتبي الخيارات الثلاثة.`;
      if(new Set(opts).size!==3)return `${SECTION_NAMES[s]} — السؤال ${i+1}: الخيارات متكررة.`;
      if(!opts.includes(String(q.answer||'').trim()))return `${SECTION_NAMES[s]} — السؤال ${i+1}: حددي الإجابة الصحيحة من الخيارات.`;
    }
  }
  if(!String(bank.qiraa?.passage||'').trim())return 'أضيفي النص القرائي قبل اعتماد الأسبوع.';
  return '';
}
async function saveDraft(){
  if(!logged||!editingBank)return;
  const ref=doc(db,BANKS,`week_${editingWeek}`),old=bankRecords[editingWeek]||{};
  const status=old.status==='approved'?'approved':'draft';
  try{
    await setDoc(ref,{teacherId:TEACHER_ID,week:editingWeek,status,pendingReview:true,draftBank:clone(editingBank),updatedAt:serverTimestamp()},{merge:true});
    bankRecords[editingWeek]={...old,teacherId:TEACHER_ID,week:editingWeek,status,pendingReview:true,draftBank:clone(editingBank),loadError:false};
    bankDirty=false;renderBankManager();renderWeeks();
    $('bankStatus').textContent=status==='approved'?'تم حفظ التعديلات كمسودة. النسخة المنشورة للطالبات لم تتغير حتى تعتمدي الأسبوع.':'تم حفظ المسودة. لم تظهر للطالبات لأنها لم تُعتمد بعد.';
    $('bankStatus').className='notice good';
  }catch(e){console.error(e);alert('تعذر حفظ المسودة. تأكدي من تحديث قواعد Firestore.');}
}
async function approveBank(){
  if(!logged||!editingBank)return;
  const problem=validateBank(editingBank);if(problem){alert(`لا يمكن اعتماد الأسبوع بعد:\n${problem}`);return;}
  const hasResults=rows.some(r=>Number(r.week)===editingWeek);
  const warning=hasResults?' تنبيه: توجد نتائج محفوظة لهذا الأسبوع. ستبقى النتائج كما هي، لكن النسخة الجديدة من الأسئلة ستظهر عند تحديث صفحة الطالبة وقد تختلف عن الأسئلة التي بدأت بها.':' لن تظهر للطالبات إلا عند تفعيل الأسبوع من لوحة التحكم.';
  if(!confirm(`اعتماد أسئلة الأسبوع ${editingWeek} كاملة؟${warning}`))return;
  const old=bankRecords[editingWeek]||{},version=Number(old.publishedVersion||0)+1;
  try{
    await setDoc(doc(db,BANKS,`week_${editingWeek}`),{teacherId:TEACHER_ID,week:editingWeek,status:'approved',pendingReview:false,draftBank:clone(editingBank),publishedBank:clone(editingBank),publishedVersion:version,approvedAt:serverTimestamp(),updatedAt:serverTimestamp()},{merge:true});
    bankRecords[editingWeek]={...old,teacherId:TEACHER_ID,week:editingWeek,status:'approved',pendingReview:false,draftBank:clone(editingBank),publishedBank:clone(editingBank),publishedVersion:version,loadError:false};
    bankDirty=false;renderBankManager();renderWeeks();
    $('bankStatus').textContent=`تم اعتماد الأسبوع ${editingWeek} كاملًا — الإصدار ${version}. أصبح جاهزًا للتفعيل اليدوي.`;$('bankStatus').className='notice good';
  }catch(e){console.error(e);alert('تعذر اعتماد الأسبوع. تأكدي من نشر قواعد Firestore الجديدة.');}
}
$('saveDraftBtn').onclick=saveDraft;
$('approveBankBtn').onclick=approveBank;
$('refreshBtn').onclick=async()=>{await loadControl();await loadQuestionBanks();await loadResults();};

function renderWeeks(){
  const root=$('weeks');root.innerHTML='';const c=cycles.find(x=>x.id===selectedCycle);if(!c)return;
  const active=Number(c.activeWeek||0),isCurrent=selectedCycle===config.currentCycleId;
  for(let w=1;w<=10;w++){
    const rec=bankRecords[w],published=rec?.status==='approved'&&!rec?.pendingReview;
    const done=w<=active,next=w===active+1;
    const card=document.createElement('div');card.className='week-card '+(done?'active':(!published?'locked':''));
    const h=document.createElement('h3');h.textContent=`الأسبوع ${w}`;
    const status=document.createElement('div');status.className='status-dot';status.textContent=done?'✅ مفعّل':(published?'✅ الأسئلة معتمدة':(rec?.pendingReview?'📝 تعديلات بانتظار الاعتماد':'📝 مسودة تحتاج مراجعة'));
    const p=document.createElement('p');p.className='sub';p.textContent='5 أقسام • 10 أسئلة في كل قسم';
    card.append(h,status,p);
    const review=document.createElement('button');review.className='btn soft small';review.textContent='مراجعة / تعديل الأسئلة';review.onclick=()=>{editingWeek=w;bankDirty=false;renderBankManager();$('bankManager').scrollIntoView({behavior:'smooth',block:'start'});};card.appendChild(review);
    if(isCurrent&&next&&published){const b=document.createElement('button');b.className='btn good small';b.style.marginTop='8px';b.textContent=`تفعيل الأسبوع ${w}`;b.onclick=()=>activateWeek(w);card.appendChild(b);}
    root.appendChild(card);
  }
  renderCycleAction(c);
}
async function activateWeek(w){
  const c=cycles.find(x=>x.id===selectedCycle),rec=bankRecords[w];
  if(!c||selectedCycle!==config.currentCycleId||w!==Number(c.activeWeek||0)+1||rec?.status!=='approved'||rec?.pendingReview)return;
  if(!confirm(`تفعيل الأسبوع ${w} الآن للطالبات؟ لن يُفتح تلقائيًا قبل ضغطك على هذا الزر.`))return;
  try{await updateDoc(doc(db,CYCLES,selectedCycle),{activeWeek:w,updatedAt:serverTimestamp()});await loadControl();}
  catch(e){console.error(e);alert('تعذر التفعيل. تأكدي من القواعد والاتصال.');}
}
function renderCycleAction(c){
  const box=$('cycleActions');box.innerHTML='';if(selectedCycle!==config.currentCycleId)return;
  if(Number(c.activeWeek||0)===10){const b=document.createElement('button');b.className='btn alt';b.textContent='بدء دفعة جديدة من الطالبات';b.onclick=startNewCycle;box.appendChild(b);}
  else box.innerHTML='<p class="sub">بدء دفعة جديدة يظهر بعد تفعيل الأسابيع العشرة. طالبات الدفعات السابقة يبقين في دفعتهن ونتائجهن محفوظة.</p>';
}
async function startNewCycle(){
  if(!confirm('بدء دفعة جديدة؟ ستبقى نتائج الدفعات السابقة محفوظة، والطالبات الجدد يدخلن الدفعة الجديدة.'))return;
  const n=Number(config.cycleCount||1)+1,id='cycle_'+n;
  try{await setDoc(doc(db,CYCLES,id),{teacherId:TEACHER_ID,number:n,activeWeek:0,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});await updateDoc(doc(db,CONFIG,'current'),{currentCycleId:id,cycleCount:n,updatedAt:serverTimestamp()});selectedCycle=id;await loadControl();await loadResults();}
  catch(e){console.error(e);alert('تعذر بدء الدفعة الجديدة.');}
}

// ---------------- نتائج الطالبات ----------------
async function loadResults(){
  if(!logged)return;
  try{const s=await getDocs(collection(db,RESULTS));rows=[];s.forEach(x=>{const d=x.data();if(d.teacherId===TEACHER_ID)rows.push({...d,docId:x.id});});renderTabs();renderResults();}
  catch(e){console.error(e);$('resultsArea').innerHTML='<div class="error">تعذر تحميل النتائج. تأكدي من قواعد Firebase.</div>';}
}
function renderTabs(){const p=$('weekTabs');p.innerHTML='';for(let w=1;w<=10;w++){const b=document.createElement('button');b.className='tab'+(selectedWeek===w?' active':'');b.textContent='الأسبوع '+w;b.onclick=()=>{selectedWeek=w;renderTabs();renderResults();};p.appendChild(b);}}
function renderResults(){
  if(!selectedCycle){$('resultsArea').innerHTML='';return;}
  const list=rows.filter(x=>x.cycleId===selectedCycle&&Number(x.week)===selectedWeek);
  const correct=list.reduce((n,x)=>n+Number(x.correct||0),0),wrong=list.reduce((n,x)=>n+Number(x.wrong||0),0);
  $('summary').textContent=`الأسبوع ${selectedWeek}: ${list.length} طالبة • الصحيح ${correct} • الخطأ ${wrong}`;
  if(!list.length){$('resultsArea').innerHTML='<p class="sub">لا توجد نتائج لهذا الأسبوع حتى الآن.</p>';return;}
  const t=document.createElement('table');t.className='results-table';t.innerHTML='<thead><tr><th>الطالبة</th><th>الإجمالي</th><th>الإملاء</th><th>النحو</th><th>المعنى</th><th>القراءة</th><th>التعبير</th><th>الحالة</th></tr></thead>';
  const body=document.createElement('tbody');
  for(const r of list){const tr=document.createElement('tr');const sc=s=>{const v=r.sectionScores?.[s]||{};return `${v.correct||0} صح / ${v.wrong||0} خطأ`;};tr.innerHTML=`<td><b>${safe(r.studentName||'طالبة')}</b></td><td>${r.correct||0} ✅ / ${r.wrong||0} ❌</td>${SECTION_ORDER.map(s=>`<td>${sc(s)}</td>`).join('')}<td>${r.completed?'أتمّت 🎉':'تتابع الحل'}</td>`;body.appendChild(tr);}
  t.appendChild(body);$('resultsArea').innerHTML='';$('resultsArea').appendChild(t);
}
$('downloadBtn').onclick=()=>{
  const cols=['الدفعة','الأسبوع','اسم الطالبة','الصحيح','الخطأ','مكتمل',...SECTION_ORDER.flatMap(s=>[SECTION_NAMES[s]+' صحيح',SECTION_NAMES[s]+' خطأ'])];
  const cyc=id=>cycles.find(c=>c.id===id)?.number||'';
  const cell=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
  const lines=[cols,...rows.map(r=>[cyc(r.cycleId),r.week,r.studentName,r.correct,r.wrong,r.completed?'نعم':'لا',...SECTION_ORDER.flatMap(s=>[r.sectionScores?.[s]?.correct||0,r.sectionScores?.[s]?.wrong||0])])].map(x=>x.map(cell).join(','));
  const blob=new Blob(['\uFEFF'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='nuwair-results.csv';a.click();URL.revokeObjectURL(url);
};
