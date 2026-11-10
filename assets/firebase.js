import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {getFirestore} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import {getAuth,setPersistence,browserLocalPersistence} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

const firebaseConfig={
  apiKey:'AIzaSyDqqgljMZT8zACMYtqmeL7XlCrsFTJmoNs',
  authDomain:'bosel-8eabf.firebaseapp.com',
  projectId:'bosel-8eabf',
  storageBucket:'bosel-8eabf.firebasestorage.app',
  messagingSenderId:'282365275437',
  appId:'1:282365275437:web:fbd387da4da918fde477a4',
  measurementId:'G-W6R19J0YKT'
};
const app=initializeApp(firebaseConfig);
export const db=getFirestore(app);
export const auth=getAuth(app);
setPersistence(auth,browserLocalPersistence).catch(()=>{});

// جلسة مستقلة للطالبات حتى لا تتعارض مع تسجيل دخول المعلمة على نفس الجهاز.
const studentApp=initializeApp(firebaseConfig,'nuwair-student-app');
export const studentDb=getFirestore(studentApp);
export const studentAuth=getAuth(studentApp);
setPersistence(studentAuth,browserLocalPersistence).catch(()=>{});

export const TEACHER_EMAIL='hmod222hoho@gmail.com';
export const TEACHER_ID='nuwair12';
export const CONFIG='nuwair12_config';
export const CYCLES='nuwair12_cycles';
export const ENROLLMENTS='nuwair12_enrollments';
export const RESULTS='nuwair12_results';
export const SECTION_ORDER=['imla','nahw','mana','qiraa','jumla'];
export const SECTION_NAMES={imla:'بوصلة الإملاء',nahw:'بوصلة النحو',mana:'بوصلة المعنى',qiraa:'بوصلة القراءة',jumla:'بوصلة التعبير'};
export const safe=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
