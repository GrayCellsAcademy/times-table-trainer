import { useState, useEffect, useRef } from "react";
import {
  registerUser, loginUser, logoutUser, onAuthChange,
  getUser, updateProgress, addCertificate,
  createClass, getClass, joinClass, getStudentsForClass, setUserClass,
} from "./firebase";
 
// ─── Constants ───────────────────────────────────────────────────
const MIN_TABLE = 2;
const MAX_TABLE = 12;
const MULTIPLIERS = [1,2,3,4,5,6,7,8,9,10,11,12];
const STAGE1_TIME_GOAL = 30;
const QUESTION_TIME = 10;
 
const TABLE_COLORS = {
  2:"#f472b6",3:"#fb923c",4:"#facc15",5:"#4ade80",
  6:"#22d3ee",7:"#818cf8",8:"#e879f9",9:"#f87171",
  10:"#fbbf24",11:"#86efac",12:"#67e8f9",
};
 
// ─── Game helpers ────────────────────────────────────────────────
function shuffle(arr) {
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a;
}
function buildS3Questions(table, mastered) {
  const nq = MULTIPLIERS.map(m=>({a:table,b:m,streakNeeded:3,streak:0}));
  const oq = mastered.flatMap(t=>MULTIPLIERS.map(m=>({a:t,b:m,streakNeeded:1,streak:0})));
  return shuffle([...nq,...oq]);
}
function buildPracticeQs(mastered) {
  return shuffle(mastered.flatMap(t=>MULTIPLIERS.map(m=>({a:t,b:m,streakNeeded:2,streak:0}))));
}
 
// ─── Shared UI components ─────────────────────────────────────────
 
function Stars() {
  const st=useRef(Array.from({length:20},(_,i)=>({x:5+(i*17)%90,y:5+(i*23)%85,size:6+i%3*4,delay:i*0.3,dur:2+i%3}))).current;
  return <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0}}>{st.map((s,i)=><div key={i} style={{position:"absolute",left:`${s.x}%`,top:`${s.y}%`,fontSize:s.size,opacity:.13,color:["#fbbf24","#f472b6","#34d399","#60a5fa","#a78bfa"][i%5],animation:`twinkle ${s.dur}s ease-in-out ${s.delay}s infinite`}}>★</div>)}</div>;
}
 
function Confetti() {
  const pieces=useRef(Array.from({length:55},(_,i)=>({x:Math.random()*100,delay:Math.random()*1.5,dur:1.8+Math.random()*1.6,size:8+Math.random()*10,color:["#f472b6","#fbbf24","#4ade80","#60a5fa","#e879f9","#fb923c","#67e8f9"][i%7],shape:i%3===0?"★":i%3===1?"●":"■",drift:(Math.random()-.5)*80}))).current;
  return <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:100,overflow:"hidden"}}>{pieces.map((p,i)=><div key={i} style={{position:"absolute",left:`${p.x}%`,top:"-5%",fontSize:p.size,color:p.color,animation:`confettiFall ${p.dur}s ease-in ${p.delay}s both`,"--drift":`${p.drift}px`}}>{p.shape}</div>)}</div>;
}
 
function ProgressBar({current,total,color}) {
  const pct=total>0?Math.round((current/total)*100):0;
  return <div style={{width:"100%",height:13,background:"rgba(255,255,255,0.14)",borderRadius:99,overflow:"hidden",margin:"7px 0"}}><div style={{height:"100%",width:`${pct}%`,background:color,borderRadius:99,transition:"width 0.4s ease",boxShadow:`0 0 8px ${color}`}}/></div>;
}
 
function CountdownTimer({seconds, total}) {
  const radius = 26;
  const circ = 2 * Math.PI * radius;
  const pct = seconds / total;
  const danger = seconds <= 3;
  const warn = seconds <= 6;
  const color = danger ? "#ef4444" : warn ? "#fbbf24" : "#4ade80";
  return (
    <div style={{display:"flex",justifyContent:"center",marginBottom:12}}>
      <div style={{position:"relative",width:70,height:70,display:"flex",alignItems:"center",justifyContent:"center"}}>
        <svg width={70} height={70} style={{position:"absolute",top:0,left:0,transform:"rotate(-90deg)"}}>
          <circle cx={35} cy={35} r={radius} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={5}/>
          <circle cx={35} cy={35} r={radius} fill="none" stroke={color} strokeWidth={5}
            strokeDasharray={circ} strokeDashoffset={circ*(1-pct)}
            strokeLinecap="round"
            style={{transition:"stroke-dashoffset 0.9s linear, stroke 0.3s"}}/>
        </svg>
        <div style={{fontFamily:"'Fredoka One',cursive",fontSize:24,color,textShadow:`0 0 12px ${color}88`,lineHeight:1,animation:danger?"superPulse 0.6s ease-in-out infinite":"none"}}>
          {seconds}
        </div>
      </div>
    </div>
  );
}
 
function Toast({msg,color}) {
  if(!msg) return null;
  return <div style={{position:"fixed",top:"18%",left:"50%",transform:"translateX(-50%)",background:color,color:"#fff",fontFamily:"'Fredoka One',cursive",fontSize:"clamp(18px,4vw,32px)",padding:"11px 28px",borderRadius:99,boxShadow:`0 6px 28px ${color}88`,zIndex:400,animation:"popIn 0.25s cubic-bezier(0.34,1.56,0.64,1)",whiteSpace:"nowrap"}}>{msg}</div>;
}
 
function WrongPanel({wrong,onDismiss}) {
  return (
    <div style={{background:"rgba(239,68,68,0.13)",border:"2px solid rgba(239,68,68,0.5)",borderRadius:20,padding:"16px 20px",animation:"bounceIn 0.3s ease"}}>
      <div style={{fontSize:"clamp(16px,3.5vw,22px)",color:"#fca5a5",fontFamily:"'Fredoka One',cursive",marginBottom:7}}>{wrong.timedOut ? "⏰ Time's up!" : "Not quite! 😅"}</div>
      <div style={{fontSize:"clamp(24px,5.5vw,40px)",fontFamily:"'Fredoka One',cursive",color:"#fff",marginBottom:5}}>
        {wrong.a} × {wrong.b} = <span style={{color:"#4ade80",textShadow:"0 0 14px #4ade8088"}}>{wrong.correct}</span>
      </div>
      <div style={{fontSize:"clamp(11px,2.2vw,14px)",color:"rgba(255,255,255,0.72)",marginBottom:14}}>
        Remember: {wrong.a} × {wrong.b} = counting by {wrong.a}, {wrong.b} time{wrong.b!==1?"s":""}.
      </div>
      <button style={{fontFamily:"'Fredoka One',cursive",fontSize:"clamp(14px,2.8vw,19px)",padding:"12px",width:"100%",borderRadius:99,border:"none",background:"#4ade80",color:"#fff",cursor:"pointer",boxShadow:"0 4px 14px #4ade8088"}}
        onMouseDown={e=>{e.preventDefault();onDismiss();}} onTouchEnd={e=>{e.preventDefault();onDismiss();}}>
        Got it — keep going! ➡️
      </button>
    </div>
  );
}
 
function Celebration({title,subtitle,body,emoji,buttonLabel,buttonColor,onContinue,showConfetti=true}) {
  return (
    <div style={{position:"fixed",inset:0,zIndex:200,background:"linear-gradient(135deg,rgba(6,3,30,0.97),rgba(22,6,60,0.97))",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      {showConfetti&&<Confetti/>}
      <div style={{textAlign:"center",zIndex:201,maxWidth:480,animation:"bounceIn 0.5s cubic-bezier(0.34,1.56,0.64,1)"}}>
        <div style={{fontSize:"clamp(56px,13vw,90px)",marginBottom:10,animation:"wiggle 1.2s ease-in-out infinite"}}>{emoji}</div>
        <h1 style={{fontFamily:"'Fredoka One',cursive",fontSize:"clamp(24px,6vw,46px)",color:"#fbbf24",margin:"0 0 8px",textShadow:"0 2px 20px rgba(251,191,36,0.8)"}}>{title}</h1>
        {subtitle&&<div style={{fontFamily:"'Fredoka One',cursive",fontSize:"clamp(14px,3.2vw,21px)",color:"rgba(255,255,255,0.85)",marginBottom:11}}>{subtitle}</div>}
        {body&&<div style={{background:"rgba(255,255,255,0.09)",borderRadius:18,padding:"13px 18px",marginBottom:20,fontSize:"clamp(12px,2.4vw,15px)",color:"rgba(255,255,255,0.85)",lineHeight:1.75}}>{body}</div>}
        <button style={{fontFamily:"'Fredoka One',cursive",fontSize:"clamp(16px,3.5vw,23px)",padding:"15px 42px",borderRadius:99,border:"none",background:buttonColor,color:"#fff",cursor:"pointer",boxShadow:`0 4px 22px ${buttonColor}99`,transition:"transform 0.15s"}}
          onMouseEnter={e=>e.currentTarget.style.transform="scale(1.07)"} onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}
          onClick={onContinue}>{buttonLabel}</button>
      </div>
    </div>
  );
}
 
function Certificate({cert, onClose}) {
  const borderColor = "#fbbf24";
  return (
    <div style={{position:"fixed",inset:0,zIndex:500,background:"rgba(0,0,0,0.88)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:"linear-gradient(145deg,#fef9e7,#fffde4,#fef3c7)",borderRadius:24,padding:"clamp(24px,5vw,44px)",maxWidth:560,width:"100%",position:"relative",boxShadow:"0 20px 60px rgba(0,0,0,0.5)",border:`6px double ${borderColor}`,fontFamily:"Georgia, serif",textAlign:"center"}}>
        {["top-left","top-right","bottom-left","bottom-right"].map(pos=>(
          <div key={pos} style={{position:"absolute",[pos.includes("top")?"top":"bottom"]:8,[pos.includes("left")?"left":"right"]:8,fontSize:22,color:borderColor,opacity:0.7}}>✦</div>
        ))}
        <div style={{fontSize:"clamp(32px,7vw,52px)",marginBottom:4}}>🏆</div>
        <div style={{fontSize:"clamp(9px,1.8vw,12px)",letterSpacing:"0.25em",textTransform:"uppercase",color:"#92400e",marginBottom:4}}>Certificate of Achievement</div>
        <div style={{borderTop:`2px solid ${borderColor}`,margin:"8px 20px"}}/>
        <div style={{fontSize:"clamp(11px,2vw,14px)",color:"#78350f",marginBottom:8}}>This certifies that</div>
        <div style={{fontFamily:"'Fredoka One',cursive",fontSize:"clamp(22px,5vw,38px)",color:"#1e1b4b",marginBottom:4,textShadow:"0 1px 2px rgba(0,0,0,0.1)"}}>{cert.studentName}</div>
        <div style={{borderBottom:`2px solid ${borderColor}`,margin:"8px 40px 12px"}}/>
        <div style={{fontSize:"clamp(11px,2vw,14px)",color:"#78350f",marginBottom:16,lineHeight:1.6}}>
          has successfully mastered the<br/>
          <strong style={{fontSize:"clamp(14px,2.8vw,18px)",color:"#7c3aed"}}>Complete Multiplication Times Table</strong><br/>
          from 2 × 1 through 12 × 12
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:5,justifyContent:"center",marginBottom:14}}>
          {Array.from({length:11},(_,i)=>i+2).map(t=>(
            <div key={t} style={{background:TABLE_COLORS[t],color:"#fff",fontFamily:"'Fredoka One',cursive",fontSize:"clamp(10px,1.8vw,13px)",padding:"3px 10px",borderRadius:99,boxShadow:`0 2px 6px ${TABLE_COLORS[t]}66`}}>{t}s ✓</div>
          ))}
        </div>
        <div style={{borderTop:`1px solid ${borderColor}`,margin:"8px 20px",opacity:0.5}}/>
        <div style={{fontSize:"clamp(10px,1.8vw,13px)",color:"#92400e",marginBottom:16}}>
          Awarded on {new Date(cert.date).toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"})}
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
          <button onClick={onClose} style={{fontFamily:"'Fredoka One',cursive",fontSize:"clamp(13px,2.5vw,16px)",padding:"10px 24px",borderRadius:99,border:"none",background:"#7c3aed",color:"#fff",cursor:"pointer",boxShadow:"0 3px 12px #7c3aed88"}}>Close</button>
          <button onClick={()=>window.print()} style={{fontFamily:"'Fredoka One',cursive",fontSize:"clamp(13px,2.5vw,16px)",padding:"10px 24px",borderRadius:99,border:"none",background:"#fbbf24",color:"#fff",cursor:"pointer",boxShadow:"0 3px 12px #fbbf2488"}}>🖨️ Print</button>
        </div>
      </div>
    </div>
  );
}
 
// ─── Spinner ──────────────────────────────────────────────────────
function Spinner() {
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"linear-gradient(135deg,#1e1b4b 0%,#312e81 40%,#4c1d95 100%)"}}>
      <div style={{fontFamily:"'Fredoka One',cursive",fontSize:28,color:"#fbbf24",animation:"float 1.2s ease-in-out infinite"}}>⭐ Loading...</div>
    </div>
  );
}
 
// ─── Teacher Dashboard ────────────────────────────────────────────
function TeacherDashboard({user, onBack}) {
  const [cls, setCls] = useState(null);
  const [students, setStudents] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [className, setClassName] = useState("");
  const [classPass, setClassPass] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [viewCert, setViewCert] = useState(null);
 
  useEffect(()=>{
    const load = async () => {
      if (user.classId) {
        const c = await getClass(user.classId);
        setCls(c);
        if (c) {
          const s = await getStudentsForClass(user.classId);
          setStudents(s);
        }
      } else {
        setShowCreate(true);
      }
      setLoading(false);
    };
    load();
  },[user.classId]);
 
  const handleCreateClass = async () => {
    if (!className.trim()||!classPass.trim()) { setErr("Please fill in both fields."); return; }
    try {
      setErr("");
      await createClass(className.trim(), classPass.trim(), user.id);
      window.location.reload();
    } catch(e) { setErr("Error creating class. Try again."); }
  };
 
  const stageLabel = (p) => {
    if (!p) return "—";
    if (p.masteredTables?.length===11) return "🏆 All Mastered!";
    const s = {s1:"Counting",s2:"Ordered Q&A",s3:"Mixed Q&A",practice:"Practice"}[p.stage]||p.stage;
    return `${p.currentTable}s — ${s}`;
  };
 
  const card = {background:"rgba(255,255,255,0.11)",backdropFilter:"blur(14px)",borderRadius:24,padding:"clamp(16px,3vw,48px)",border:"2px solid rgba(255,255,255,0.18)",boxShadow:"0 8px 36px rgba(0,0,0,0.28)",width:"min(92vw, 1100px)",position:"relative",zIndex:1};
 
  if (loading) return <Spinner/>;
 
  if (showCreate) return (
    <div style={{...card,textAlign:"center",animation:"bounceIn 0.4s ease"}}>
      <div style={{fontSize:48,marginBottom:8}}>🏫</div>
      <h2 style={{fontFamily:"'Fredoka One',cursive",fontSize:"clamp(20px,4.5vw,30px)",color:"#fbbf24",margin:"0 0 18px"}}>Create Your Class</h2>
      {err&&<div style={{color:"#f87171",marginBottom:10,fontSize:14}}>{err}</div>}
      <input value={className} onChange={e=>setClassName(e.target.value)} placeholder="Class name (e.g. Room 4B)" style={{width:"100%",boxSizing:"border-box",padding:"12px 16px",borderRadius:14,border:"2px solid rgba(255,255,255,0.3)",background:"rgba(255,255,255,0.15)",color:"#fff",fontSize:16,fontFamily:"'Nunito',sans-serif",marginBottom:10,outline:"none"}}/>
      <input value={classPass} onChange={e=>setClassPass(e.target.value)} placeholder="Class password (students use this to join)" style={{width:"100%",boxSizing:"border-box",padding:"12px 16px",borderRadius:14,border:"2px solid rgba(255,255,255,0.3)",background:"rgba(255,255,255,0.15)",color:"#fff",fontSize:16,fontFamily:"'Nunito',sans-serif",marginBottom:18,outline:"none"}}/>
      <div style={{display:"flex",gap:10,justifyContent:"center"}}>
        <button onClick={onBack} style={{fontFamily:"'Fredoka One',cursive",padding:"11px 24px",borderRadius:99,border:"none",background:"rgba(255,255,255,0.12)",color:"rgba(255,255,255,0.7)",cursor:"pointer",fontSize:15}}>← Back</button>
        <button onClick={handleCreateClass} style={{fontFamily:"'Fredoka One',cursive",padding:"11px 28px",borderRadius:99,border:"none",background:"#fbbf24",color:"#fff",cursor:"pointer",fontSize:16,boxShadow:"0 3px 14px #fbbf2488"}}>Create Class 🏫</button>
      </div>
    </div>
  );
 
  return (
    <div style={{...card,maxWidth:"min(92vw, 1100px)"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18,flexWrap:"wrap",gap:8}}>
        <div>
          <h2 style={{fontFamily:"'Fredoka One',cursive",fontSize:"clamp(18px,4vw,26px)",color:"#fbbf24",margin:0}}>🏫 {cls?.name}</h2>
          <div style={{fontSize:"clamp(11px,2vw,13px)",color:"rgba(255,255,255,0.5)",marginTop:3}}>Password: <strong style={{color:"rgba(255,255,255,0.7)"}}>{cls?.password}</strong> · {students.length} student{students.length!==1?"s":""}</div>
        </div>
        <button onClick={onBack} style={{fontFamily:"'Fredoka One',cursive",padding:"8px 18px",borderRadius:99,border:"1px solid rgba(255,255,255,0.22)",background:"rgba(255,255,255,0.07)",color:"rgba(255,255,255,0.65)",cursor:"pointer",fontSize:13}}>← Back</button>
      </div>
 
      {students.length===0 ? (
        <div style={{textAlign:"center",padding:"30px 0",color:"rgba(255,255,255,0.45)",fontSize:15}}>
          <div style={{fontSize:36,marginBottom:8}}>👋</div>
          No students yet. Share the class name &amp; password so they can join!
        </div>
      ) : (
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {students.map(s=>{
            const p=s.progress;
            const mastered=p.masteredTables?.length||0;
            const tc2=TABLE_COLORS[p.currentTable]||"#a78bfa";
            return (
              <div key={s.id} onClick={()=>setSelectedStudent(selectedStudent?.id===s.id?null:s)}
                style={{background:"rgba(255,255,255,0.08)",borderRadius:16,padding:"12px 16px",cursor:"pointer",border:`1.5px solid ${selectedStudent?.id===s.id?"rgba(255,255,255,0.35)":"rgba(255,255,255,0.12)"}`,transition:"all 0.2s"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:6}}>
                  <div>
                    <div style={{fontFamily:"'Fredoka One',cursive",fontSize:"clamp(14px,3vw,18px)",color:"#fff"}}>{s.name}</div>
                    <div style={{fontSize:"clamp(11px,2vw,13px)",color:"rgba(255,255,255,0.55)",marginTop:2}}>{stageLabel(p)}</div>
                  </div>
                  <div style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap"}}>
                    {p.certificates?.length>0&&(
                      <button onClick={e=>{e.stopPropagation();setViewCert(p.certificates[p.certificates.length-1]);}} style={{fontFamily:"'Fredoka One',cursive",fontSize:11,padding:"4px 10px",borderRadius:99,border:"none",background:"#fbbf24",color:"#fff",cursor:"pointer"}}>🏆 Cert</button>
                    )}
                    <div style={{background:tc2,color:"#fff",fontFamily:"'Fredoka One',cursive",fontSize:12,padding:"4px 10px",borderRadius:99}}>{mastered}/11</div>
                  </div>
                </div>
                {selectedStudent?.id===s.id&&(
                  <div style={{marginTop:12}}>
                    <div style={{fontSize:12,color:"rgba(255,255,255,0.4)",marginBottom:6}}>Mastered tables:</div>
                    <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                      {Array.from({length:11},(_,i)=>i+2).map(t=>(
                        <div key={t} style={{background:p.masteredTables?.includes(t)?TABLE_COLORS[t]:"rgba(255,255,255,0.08)",color:p.masteredTables?.includes(t)?"#fff":"rgba(255,255,255,0.3)",fontFamily:"'Fredoka One',cursive",fontSize:12,padding:"4px 10px",borderRadius:99,border:`1.5px solid ${p.masteredTables?.includes(t)?TABLE_COLORS[t]:"rgba(255,255,255,0.15)"}`}}>
                          {t}s {p.masteredTables?.includes(t)?"✓":""}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {viewCert&&<Certificate cert={viewCert} onClose={()=>setViewCert(null)}/>}
    </div>
  );
}
 
// ─── MAIN APP ─────────────────────────────────────────────────────
export default function TimesTableApp() {
 
  // ── Auth / user state ────────────────────────────────────────
  const [authLoading, setAuthLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null); // Firestore user doc
  const [firebaseUser, setFirebaseUser] = useState(null); // Firebase Auth user
 
  // ── App screens ──────────────────────────────────────────────
  // boot | login | signup | join_class | teacher_home | student_home | game | teacher_dashboard
  const [appScreen, setAppScreen] = useState("boot");
  const [viewCert, setViewCert] = useState(null);
  const [celebration, setCelebration] = useState(null);
 
  // ── Auth form state ──────────────────────────────────────────
  const [authMode, setAuthMode] = useState("login"); // "login" | "signup"
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authRole, setAuthRole] = useState(null);
  const [authErr, setAuthErr] = useState("");
  const [authWorking, setAuthWorking] = useState(false);
 
  // ── Join class form ──────────────────────────────────────────
  const [joinClassName, setJoinClassName] = useState("");
  const [joinClassPass, setJoinClassPass] = useState("");
  const [joinErr, setJoinErr] = useState("");
 
  // ── Game state ───────────────────────────────────────────────
  const [gameScreen, setGameScreen] = useState("home");
  const [currentTable, setCurrentTable] = useState(MIN_TABLE);
  const [masteredTables, setMasteredTables] = useState([]);
 
  const [s1Input,setS1Input]=useState(""); const [s1Next,setS1Next]=useState(MIN_TABLE);
  const [s1Timer,setS1Timer]=useState(0); const [s1Running,setS1Running]=useState(false);
  const [s1Done,setS1Done]=useState(false); const [s1Best,setS1Best]=useState(null);
  const [s1Tutorial,setS1Tutorial]=useState(true); const s1Ref=useRef(null);
 
  const [s2Questions,setS2Questions]=useState([]); const [s2Idx,setS2Idx]=useState(0);
  const [s2Passes,setS2Passes]=useState(0); const [s2Errors,setS2Errors]=useState(0);
  const [s2Input,setS2Input]=useState(""); const [s2Wrong,setS2Wrong]=useState(null);
  const s2Ref=useRef(null);
 
  const [s3Questions,setS3Questions]=useState([]); const [s3Idx,setS3Idx]=useState(0);
  const [s3Input,setS3Input]=useState(""); const [s3Remaining,setS3Remaining]=useState(0);
  const [s3Wrong,setS3Wrong]=useState(null); const s3Ref=useRef(null);
 
  const [practiceQs,setPracticeQs]=useState([]); const [practiceIdx,setPracticeIdx]=useState(0);
  const [practiceInput,setPracticeInput]=useState(""); const [practiceRemaining,setPracticeRemaining]=useState(0);
  const [practiceWrong,setPracticeWrong]=useState(null); const practiceRef=useRef(null);
 
  const [toast,setToast]=useState(null); const [toastColor,setToastColor]=useState("#22c55e");
  const toastTimer=useRef(null);
 
  // ── Per-question countdown (s2 & s3) ────────────────────────
  const [qTimer, setQTimer] = useState(QUESTION_TIME);
  const qTimerRef = useRef(null);
 
  // ── Listen for Firebase auth state ──────────────────────────
  useEffect(()=>{
    const unsub = onAuthChange(async (fbUser) => {
      if (fbUser) {
        setFirebaseUser(fbUser);
        const userData = await getUser(fbUser.uid);
        if (userData) {
          setCurrentUser(userData);
          setCurrentTable(userData.progress.currentTable || MIN_TABLE);
          setMasteredTables(userData.progress.masteredTables || []);
          setAppScreen(userData.role === "teacher" ? "teacher_home" : "student_home");
        }
      } else {
        setFirebaseUser(null);
        setCurrentUser(null);
        setAppScreen("login");
      }
      setAuthLoading(false);
    });
    return () => unsub();
  },[]);
 
  // ── Auth actions ─────────────────────────────────────────────
  const doSignup = async () => {
    if (!authName.trim()||!authEmail.trim()||!authPassword.trim()||!authRole) {
      setAuthErr("Please fill in all fields and choose a role."); return;
    }
    if (authPassword.length < 6) { setAuthErr("Password must be at least 6 characters."); return; }
    setAuthWorking(true); setAuthErr("");
    try {
      await registerUser(authEmail.trim(), authPassword, authName.trim(), authRole);
      // onAuthChange will handle navigation
      if (authRole === "student") setAppScreen("join_class");
    } catch(e) {
      setAuthErr(e.message.includes("email-already-in-use")
        ? "That email is already registered. Try logging in."
        : e.message.includes("invalid-email")
        ? "Please enter a valid email address."
        : "Sign up failed. Please try again.");
    }
    setAuthWorking(false);
  };
 
  const doLogin = async () => {
    if (!authEmail.trim()||!authPassword.trim()) { setAuthErr("Please enter your email and password."); return; }
    setAuthWorking(true); setAuthErr("");
    try {
      await loginUser(authEmail.trim(), authPassword);
      // onAuthChange handles the rest
    } catch(e) {
      setAuthErr("Incorrect email or password. Please try again.");
    }
    setAuthWorking(false);
  };
 
  const doLogout = async () => {
    await logoutUser();
    setCurrentUser(null); setFirebaseUser(null);
    setAuthEmail(""); setAuthPassword(""); setAuthName(""); setAuthRole(null); setAuthErr("");
    setAppScreen("login");
  };
 
  // ── Join class ───────────────────────────────────────────────
  const doJoinClass = async () => {
    if (!joinClassName.trim()||!joinClassPass.trim()) { setJoinErr("Please enter the class name and password."); return; }
    try {
      setJoinErr("");
      await joinClass(firebaseUser.uid, joinClassName.trim(), joinClassPass.trim());
      const updated = await getUser(firebaseUser.uid);
      setCurrentUser(updated);
      setAppScreen("student_home");
    } catch(e) {
      setJoinErr(e.message || "Class not found or wrong password.");
    }
  };
 
  // ── Persist progress to Firestore ───────────────────────────
  const persistProgress = async (table, mastered, stage) => {
    if (!firebaseUser) return;
    const progress = {
      currentTable: table,
      masteredTables: mastered,
      stage,
      certificates: currentUser?.progress?.certificates || [],
    };
    setCurrentUser(u => ({...u, progress}));
    await updateProgress(firebaseUser.uid, progress);
  };
 
  // ── Toast ────────────────────────────────────────────────────
  const showToast=(msg,color="#22c55e",dur=700)=>{
    clearTimeout(toastTimer.current); setToast(msg); setToastColor(color);
    toastTimer.current=setTimeout(()=>setToast(null),dur);
  };
 
  // ── Stage 1 timer ────────────────────────────────────────────
  useEffect(()=>{
    if(!s1Running) return;
    const id=setInterval(()=>setS1Timer(t=>t+0.1),100);
    return()=>clearInterval(id);
  },[s1Running]);
 
  // ── Focus effects ────────────────────────────────────────────
  useEffect(()=>{ if(gameScreen==="s1"&&!s1Tutorial) setTimeout(()=>s1Ref.current?.focus(),80); },[gameScreen,s1Tutorial]);
  useEffect(()=>{ if(gameScreen==="s2"&&!s2Wrong) setTimeout(()=>s2Ref.current?.focus(),80); },[gameScreen,s2Idx,s2Wrong]);
  useEffect(()=>{ if(gameScreen==="s3"&&!s3Wrong) setTimeout(()=>s3Ref.current?.focus(),80); },[gameScreen,s3Idx,s3Wrong]);
  useEffect(()=>{ if(gameScreen==="practice"&&!practiceWrong) setTimeout(()=>practiceRef.current?.focus(),80); },[gameScreen,practiceIdx,practiceWrong]);
 
  // ── Question countdown timer ─────────────────────────────────
  const resetQTimer = () => { clearInterval(qTimerRef.current); setQTimer(QUESTION_TIME); };
  const startQTimer = (onExpire) => {
    clearInterval(qTimerRef.current);
    setQTimer(QUESTION_TIME);
    let remaining = QUESTION_TIME;
    qTimerRef.current = setInterval(() => {
      remaining -= 1;
      setQTimer(remaining);
      if (remaining <= 0) { clearInterval(qTimerRef.current); onExpire(); }
    }, 1000);
  };
 
  useEffect(() => {
    if (gameScreen === "s2" && !s2Wrong) {
      startQTimer(() => {
        const q = s2Questions[s2Idx];
        if (q) setS2Wrong({a:q.a,b:q.b,correct:q.a*q.b,timedOut:true});
        setS2Errors(err=>err+1); setS2Input("");
      });
    } else if (gameScreen === "s3" && !s3Wrong) {
      const questions = s3Questions;
      const idx = s3Idx % (questions.length || 1);
      const q = questions[idx];
      startQTimer(() => {
        if (q) {
          setS3Questions(prev=>{
            const qs=[...prev]; const i=s3Idx%(qs.length||1);
            if(qs[i]) qs[i]={...qs[i],streak:0,streakNeeded:qs[i].streakNeeded+1};
            return qs;
          });
          setS3Wrong({a:q.a,b:q.b,correct:q.a*q.b,timedOut:true});
        }
        setS3Input("");
      });
    } else {
      clearInterval(qTimerRef.current);
    }
    return () => clearInterval(qTimerRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[gameScreen, s2Idx, s2Wrong, s3Idx, s3Wrong]);
 
  const tc = TABLE_COLORS[currentTable]||"#a78bfa";
 
  // ── Start table ──────────────────────────────────────────────
  const startTable=(table,jump)=>{
    setCurrentTable(table);
    setS1Input(""); setS1Next(table); setS1Timer(0); setS1Running(false); setS1Done(false); setS1Tutorial(true);
    setS2Questions(MULTIPLIERS.map(m=>({a:table,b:m}))); setS2Idx(0); setS2Passes(0); setS2Errors(0); setS2Input(""); setS2Wrong(null);
    setS3Wrong(null);
    if(jump==="s2") setGameScreen("s2");
    else if(jump==="s3"){const qs=buildS3Questions(table,masteredTables);setS3Questions(qs);setS3Idx(0);setS3Input("");setS3Remaining(qs.length);setGameScreen("s3");}
    else setGameScreen("s1");
    setAppScreen("game");
    persistProgress(table, masteredTables, jump||"s1");
  };
 
  const startPractice=(tables)=>{
    const qs=buildPracticeQs(tables);
    setPracticeQs(qs);setPracticeIdx(0);setPracticeInput("");setPracticeRemaining(qs.length);setPracticeWrong(null);
    setGameScreen("practice"); setAppScreen("game");
  };
 
  // ── Stage 1 ──────────────────────────────────────────────────
  const handleS1Key=(e)=>{
    if(e.key!=="Enter") return;
    const val=parseInt(s1Input.trim(),10); setS1Input("");
    if(!s1Running&&!s1Done){setS1Running(true);setS1Timer(0);}
    if(val===s1Next){
      if(s1Next===currentTable*12){setS1Running(false);setS1Done(true);const t=parseFloat(s1Timer.toFixed(1));setS1Best(p=>p===null?t:Math.min(p,t));}
      else{setS1Next(s1Next+currentTable);requestAnimationFrame(()=>s1Ref.current?.focus());}
    } else {showToast(`Nope! Next is ${s1Next}`,"#ef4444",900);requestAnimationFrame(()=>s1Ref.current?.focus());}
  };
  const s1Submit=()=>{handleS1Key({key:"Enter"});requestAnimationFrame(()=>s1Ref.current?.focus());};
  const s1Restart=()=>{setS1Input("");setS1Next(currentTable);setS1Timer(0);setS1Running(false);setS1Done(false);setS1Tutorial(false);setTimeout(()=>s1Ref.current?.focus(),50);};
  const s1Advance=()=>{
    setCelebration({emoji:"⚡",title:"Stage 1 Complete!",subtitle:`You can count by ${currentTable}s!`,
      body:`Next: Stage 2. Answer ${currentTable}×1 through ${currentTable}×12 in order — 3 perfect passes to advance!`,
      buttonLabel:"On to Stage 2! →",buttonColor:tc,
      onContinue:()=>{setCelebration(null);setS2Questions(MULTIPLIERS.map(m=>({a:currentTable,b:m})));setS2Idx(0);setS2Passes(0);setS2Errors(0);setS2Input("");setS2Wrong(null);setGameScreen("s2");persistProgress(currentTable,masteredTables,"s2");}});
  };
 
  // ── Stage 2 ──────────────────────────────────────────────────
  const handleS2Key=(e)=>{
    if(e.key!=="Enter") return;
    const val=parseInt(s2Input.trim(),10); setS2Input("");
    const q=s2Questions[s2Idx]; const correct=q.a*q.b;
    if(val===correct){
      showToast("✓","#22c55e",450);
      const ni=s2Idx+1;
      if(ni>=s2Questions.length){
        if(s2Errors===0){
          const np=s2Passes+1;
          if(np>=3){
            setCelebration({emoji:"🎯",title:"Stage 2 Complete!",subtitle:`${currentTable}s in order — nailed it!`,
              body:`Stage 3 time! 🔀 Questions will be shuffled AND mixed with tables you've already learned. Each needs 3 correct in a row to clear!`,
              buttonLabel:"Mix it up! 🔀",buttonColor:tc,
              onContinue:()=>{setCelebration(null);const qs=buildS3Questions(currentTable,masteredTables);setS3Questions(qs);setS3Idx(0);setS3Input("");setS3Remaining(qs.length);setS3Wrong(null);setGameScreen("s3");persistProgress(currentTable,masteredTables,"s3");}});
            return;
          }
          setS2Passes(np);setS2Errors(0);setS2Idx(0);showToast(`Pass ${np}/3 ✓`,"#60a5fa",800);
        } else {setS2Passes(0);setS2Errors(0);setS2Idx(0);showToast("Mistakes — restart!","#ef4444",1000);}
      } else {setS2Idx(ni);}
      setTimeout(()=>s2Ref.current?.focus(),50);
    } else {setS2Errors(err=>err+1);setS2Wrong({a:q.a,b:q.b,correct});}
  };
  const s2Submit=()=>{handleS2Key({key:"Enter"});requestAnimationFrame(()=>s2Ref.current?.focus());};
  const dismissS2Wrong=()=>{resetQTimer();setS2Wrong(null);setS2Input("");setS2Idx(p=>(p+1)>=s2Questions.length?0:p+1);setTimeout(()=>s2Ref.current?.focus(),50);};
 
  // ── Stage 3 ──────────────────────────────────────────────────
  const handleS3Key=(e)=>{
    if(e.key!=="Enter") return;
    const val=parseInt(s3Input.trim(),10); setS3Input("");
    const questions=[...s3Questions]; const idx=s3Idx%questions.length;
    const q=questions[idx]; const correct=q.a*q.b;
    if(val===correct){
      showToast("✓","#22c55e",450);
      questions[idx]={...q,streak:q.streak+1};
      if(questions[idx].streak>=questions[idx].streakNeeded){
        questions.splice(idx,1);
        if(questions.length===0){
          const newMastered=[...masteredTables,currentTable];
          setMasteredTables(newMastered);
          if(newMastered.length===11){
            const cert={studentName:currentUser?.name||"Student",date:Date.now(),tables:newMastered};
            addCertificate(firebaseUser.uid, cert);
            const updatedProgress = {...currentUser.progress, masteredTables:newMastered, certificates:[...(currentUser.progress.certificates||[]),cert]};
            setCurrentUser(u=>({...u,progress:updatedProgress}));
            setCelebration({
              emoji:"🏆",title:"YOU ARE A MULTIPLICATION MASTER!",
              subtitle:"Every table from 2s to 12s — conquered!",
              body:`A special certificate has been awarded to ${currentUser?.name||"you"}. Check your profile to view and print it anytime! 🎓`,
              buttonLabel:"🏆 View My Certificate!",buttonColor:"#fbbf24",showConfetti:true,
              onContinue:()=>{
                setCelebration(null);
                setViewCert(cert);
                setAppScreen("student_home"); setGameScreen("home");
              }
            });
          } else {
            const nextColor=TABLE_COLORS[currentTable+1]||"#a78bfa";
            setCelebration({emoji:"🌟",title:`${currentTable}s Mastered!`,subtitle:"Incredible!",
              body:`Up next: the ${currentTable+1}s table. Let's start by counting!`,
              buttonLabel:`Start ${currentTable+1}s! 🚀`,buttonColor:nextColor,
              onContinue:()=>{setCelebration(null);startTable(currentTable+1);}});
            persistProgress(currentTable+1,newMastered,"s1");
          }
          return;
        }
        setS3Remaining(questions.length);
      }
      setS3Questions(questions);setS3Idx(p=>(p+1)%questions.length);setTimeout(()=>s3Ref.current?.focus(),50);
    } else {
      questions[idx]={...q,streak:0,streakNeeded:q.streakNeeded+1};
      setS3Questions(questions);setS3Wrong({a:q.a,b:q.b,correct});
    }
  };
  const s3Submit=()=>{handleS3Key({key:"Enter"});requestAnimationFrame(()=>s3Ref.current?.focus());};
  const dismissS3Wrong=()=>{resetQTimer();setS3Wrong(null);setS3Input("");setS3Idx(p=>p%s3Questions.length);setTimeout(()=>s3Ref.current?.focus(),50);};
 
  // ── Practice ─────────────────────────────────────────────────
  const handlePracticeKey=(e)=>{
    if(e.key!=="Enter") return;
    const val=parseInt(practiceInput.trim(),10); setPracticeInput("");
    const questions=[...practiceQs]; const idx=practiceIdx%questions.length;
    const q=questions[idx]; const correct=q.a*q.b;
    if(val===correct){
      showToast("✓","#22c55e",450);
      questions[idx]={...q,streak:q.streak+1};
      if(questions[idx].streak>=questions[idx].streakNeeded){
        questions.splice(idx,1);
        if(questions.length===0){
          setCelebration({emoji:"🎉",title:"Practice Complete!",subtitle:"You're on fire! 🔥",body:"Every practice question cleared. Keep it sharp!",buttonLabel:"Practice Again 🔄",buttonColor:"#818cf8",onContinue:()=>{setCelebration(null);startPractice(masteredTables);}});
          return;
        }
        setPracticeRemaining(questions.length);
      }
      setPracticeQs(questions);setPracticeIdx(p=>(p+1)%questions.length);setTimeout(()=>practiceRef.current?.focus(),50);
    } else {
      questions[idx]={...q,streak:0,streakNeeded:q.streakNeeded+1};
      setPracticeQs(questions);setPracticeWrong({a:q.a,b:q.b,correct});
    }
  };
  const practiceSubmit=()=>{handlePracticeKey({key:"Enter"});requestAnimationFrame(()=>practiceRef.current?.focus());};
  const dismissPracticeWrong=()=>{setPracticeWrong(null);setPracticeInput("");setPracticeIdx(p=>p%practiceQs.length);setTimeout(()=>practiceRef.current?.focus(),50);};
 
  // ── Styles ───────────────────────────────────────────────────
  const card={background:"rgba(255,255,255,0.11)",backdropFilter:"blur(14px)",borderRadius:26,padding:"clamp(16px,4vw,48px)",border:"2px solid rgba(255,255,255,0.17)",boxShadow:"0 8px 38px rgba(0,0,0,0.28)",width:"min(92vw, 1100px)",position:"relative",zIndex:1};
  const bigInput={width:"100%",boxSizing:"border-box",fontSize:"clamp(26px,6vw,46px)",fontFamily:"'Fredoka One',cursive",textAlign:"center",padding:"13px 18px",background:"rgba(255,255,255,0.17)",border:"3px solid rgba(255,255,255,0.33)",borderRadius:16,color:"#fff",outline:"none",boxShadow:"inset 0 2px 8px rgba(0,0,0,0.13)",caretColor:"#fff"};
  const btn=(color,extra={})=>({fontFamily:"'Fredoka One',cursive",fontSize:"clamp(14px,2.8vw,20px)",padding:"12px 28px",borderRadius:99,border:"none",background:color,color:"#fff",cursor:"pointer",boxShadow:`0 4px 16px ${color}88`,transition:"transform 0.12s",...extra});
  const submitBtn=(color)=>({...btn(color,{marginTop:11,width:"100%",fontSize:"clamp(17px,3.8vw,24px)",padding:"14px"})});
  const inputStyle={width:"100%",boxSizing:"border-box",padding:"12px 16px",borderRadius:14,border:"2px solid rgba(255,255,255,0.28)",background:"rgba(255,255,255,0.13)",color:"#fff",fontSize:16,fontFamily:"'Nunito',sans-serif",marginBottom:12,outline:"none"};
 
  const TableLabel=({stage})=>(
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
      <div style={{background:tc,color:"#fff",fontFamily:"'Fredoka One',cursive",fontSize:"clamp(12px,2.4vw,16px)",padding:"5px 14px",borderRadius:99,boxShadow:`0 2px 10px ${tc}88`}}>{currentTable}s Table</div>
      {stage&&<div style={{fontFamily:"'Fredoka One',cursive",fontSize:"clamp(12px,2.4vw,17px)",color:"#fbbf24"}}>{stage}</div>}
    </div>
  );
 
  const Footer=()=>(
    <div style={{position:"relative",zIndex:1,marginTop:14,display:"flex",gap:5,flexWrap:"wrap",justifyContent:"center"}}>
      {Array.from({length:MAX_TABLE-MIN_TABLE+1},(_,i)=>i+MIN_TABLE).map(t=>(
        <div key={t} style={{width:30,height:30,borderRadius:"50%",background:masteredTables.includes(t)?TABLE_COLORS[t]:t===currentTable?"rgba(255,255,255,0.22)":"rgba(255,255,255,0.07)",border:`2px solid ${masteredTables.includes(t)?TABLE_COLORS[t]:t===currentTable?"rgba(255,255,255,0.5)":"rgba(255,255,255,0.14)"}`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Fredoka One',cursive",fontSize:11,color:masteredTables.includes(t)?"#fff":t===currentTable?"#fff":"rgba(255,255,255,0.28)",boxShadow:t===currentTable?`0 0 10px ${tc}`:"none",transition:"all 0.3s"}}>
          {masteredTables.includes(t)?"✓":t}
        </div>
      ))}
    </div>
  );
 
  if (authLoading) return <Spinner/>;
 
  // ── Render ───────────────────────────────────────────────────
  return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,#1e1b4b 0%,#312e81 40%,#4c1d95 100%)",fontFamily:"'Nunito',sans-serif",padding:"clamp(12px,2vw,24px)",boxSizing:"border-box",position:"relative",overflow:"hidden"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fredoka+One&family=Nunito:wght@700;800;900&display=swap'); @keyframes twinkle{0%,100%{opacity:.08;transform:scale(1)}50%{opacity:.28;transform:scale(1.3)}} @keyframes popIn{from{transform:translateX(-50%) scale(0.5);opacity:0}to{transform:translateX(-50%) scale(1);opacity:1}} @keyframes bounceIn{0%{transform:scale(0.5);opacity:0}70%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}} @keyframes wiggle{0%,100%{transform:rotate(0)}25%{transform:rotate(-6deg)}75%{transform:rotate(6deg)}} @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}} @keyframes confettiFall{0%{transform:translateY(0) translateX(0) rotate(0);opacity:1}100%{transform:translateY(110vh) translateX(var(--drift)) rotate(720deg);opacity:0}} @keyframes superPulse{0%,100%{box-shadow:0 0 30px #fbbf24,0 0 60px #f472b6}50%{box-shadow:0 0 60px #fbbf24,0 0 100px #f472b6,0 0 140px #818cf8}} input:focus{border-color:rgba(255,255,255,0.8)!important;box-shadow:inset 0 2px 8px rgba(0,0,0,0.13),0 0 0 3px rgba(255,255,255,0.18)!important} button:hover{transform:scale(1.05)!important} button:active{transform:scale(0.97)!important} ::placeholder{color:rgba(255,255,255,0.32)} @media print{body>*:not(.cert-print){display:none}}`}</style>
 
      <Stars/>
      <Toast msg={toast} color={toastColor}/>
      {celebration&&<Celebration {...celebration}/>}
      {viewCert&&<Certificate cert={viewCert} onClose={()=>setViewCert(null)}/>}
 
      {/* ══ LOGIN / SIGNUP ══ */}
      {(appScreen==="login"||appScreen==="signup")&&(
        <div style={{...card,maxWidth:480,textAlign:"center",animation:"bounceIn 0.5s ease"}}>
          <div style={{fontSize:"clamp(42px,9vw,68px)",marginBottom:8,animation:"float 2s ease-in-out infinite"}}>🌟</div>
          <h1 style={{fontFamily:"'Fredoka One',cursive",fontSize:"clamp(22px,5vw,36px)",color:"#fbbf24",margin:"0 0 6px"}}>Times Table Trainer</h1>
 
          {/* Tab toggle */}
          <div style={{display:"flex",gap:0,background:"rgba(255,255,255,0.08)",borderRadius:99,padding:4,marginBottom:20,marginTop:12}}>
            {[["login","Log In"],["signup","Sign Up"]].map(([mode,label])=>(
              <button key={mode} onClick={()=>{setAuthMode(mode);setAuthErr("");}} style={{flex:1,fontFamily:"'Fredoka One',cursive",fontSize:"clamp(13px,2.5vw,17px)",padding:"10px",borderRadius:99,border:"none",background:authMode===mode?"#fbbf24":"transparent",color:authMode===mode?"#fff":"rgba(255,255,255,0.5)",cursor:"pointer",transition:"all 0.2s",boxShadow:"none"}}>
                {label}
              </button>
            ))}
          </div>
 
          {authErr&&<div style={{color:"#f87171",fontSize:13,marginBottom:12,background:"rgba(239,68,68,0.1)",padding:"8px 14px",borderRadius:10}}>{authErr}</div>}
 
          {authMode==="signup"&&(
            <>
              <input value={authName} onChange={e=>setAuthName(e.target.value)} placeholder="Your name" style={inputStyle}/>
              <div style={{marginBottom:12}}>
                <div style={{fontSize:"clamp(12px,2.2vw,14px)",color:"rgba(255,255,255,0.6)",marginBottom:8}}>I am a…</div>
                <div style={{display:"flex",gap:10,justifyContent:"center"}}>
                  {[["student","🧒 Student"],["teacher","👩‍🏫 Teacher"]].map(([role,label])=>(
                    <button key={role} onClick={()=>setAuthRole(role)} style={{...btn(authRole===role?"#f472b6":"rgba(255,255,255,0.13)",{boxShadow:authRole===role?undefined:"none",border:authRole===role?"none":"2px solid rgba(255,255,255,0.22)",fontSize:"clamp(14px,2.8vw,18px)",padding:"11px 22px"})}}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
 
          <input value={authEmail} onChange={e=>setAuthEmail(e.target.value)} placeholder="Email address" type="email" style={inputStyle}/>
          <input value={authPassword} onChange={e=>setAuthPassword(e.target.value)} placeholder="Password (min 6 characters)" type="password" style={{...inputStyle,marginBottom:16}} onKeyDown={e=>e.key==="Enter"&&(authMode==="login"?doLogin():doSignup())}/>
 
          <button style={btn("#fbbf24",{fontSize:"clamp(15px,3vw,20px)",padding:"13px 36px",width:"100%",opacity:authWorking?0.7:1})}
            onClick={authMode==="login"?doLogin:doSignup} disabled={authWorking}>
            {authWorking?"Working…":authMode==="login"?"Log In →":"Create Account →"}
          </button>
        </div>
      )}
 
      {/* ══ JOIN CLASS ══ */}
      {appScreen==="join_class"&&(
        <div style={{...card,maxWidth:480,textAlign:"center",animation:"bounceIn 0.4s ease"}}>
          <div style={{fontSize:44,marginBottom:8}}>🏫</div>
          <h2 style={{fontFamily:"'Fredoka One',cursive",fontSize:"clamp(18px,4vw,28px)",color:"#fbbf24",margin:"0 0 6px"}}>Join a Class</h2>
          <p style={{color:"rgba(255,255,255,0.65)",fontSize:13,marginBottom:16}}>Ask your teacher for the class name and password.</p>
          {joinErr&&<div style={{color:"#f87171",fontSize:13,marginBottom:10,background:"rgba(239,68,68,0.1)",padding:"8px 14px",borderRadius:10}}>{joinErr}</div>}
          <input value={joinClassName} onChange={e=>setJoinClassName(e.target.value)} placeholder="Class name" style={inputStyle}/>
          <input value={joinClassPass} onChange={e=>setJoinClassPass(e.target.value)} placeholder="Class password" style={{...inputStyle,marginBottom:16}}/>
          <div style={{display:"flex",gap:10,justifyContent:"center"}}>
            <button onClick={()=>setAppScreen("student_home")} style={btn("rgba(255,255,255,0.11)",{boxShadow:"none",border:"1px solid rgba(255,255,255,0.2)",fontSize:14})}>Skip for now</button>
            <button onClick={doJoinClass} style={btn("#22d3ee",{fontSize:15,padding:"11px 24px"})}>Join Class 🏫</button>
          </div>
        </div>
      )}
 
      {/* ══ TEACHER HOME ══ */}
      {appScreen==="teacher_home"&&(
        <div style={{...card,maxWidth:480,textAlign:"center",animation:"bounceIn 0.4s ease"}}>
          <div style={{fontSize:"clamp(36px,8vw,56px)",marginBottom:8}}>👩‍🏫</div>
          <h1 style={{fontFamily:"'Fredoka One',cursive",fontSize:"clamp(20px,4.5vw,32px)",color:"#fbbf24",margin:"0 0 4px"}}>Welcome, {currentUser?.name}!</h1>
          <p style={{color:"rgba(255,255,255,0.6)",fontSize:13,marginBottom:18}}>Teacher Account</p>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <button style={btn("#fbbf24",{fontSize:"clamp(15px,3vw,20px)",padding:"13px"})} onClick={()=>setAppScreen("teacher_dashboard")}>🏫 My Class Dashboard</button>
            <button style={btn("rgba(255,255,255,0.12)",{fontSize:"clamp(13px,2.5vw,16px)",padding:"10px",boxShadow:"none",border:"1px solid rgba(255,255,255,0.2)",marginTop:6})} onClick={doLogout}>
              Log Out
            </button>
          </div>
        </div>
      )}
 
      {/* ══ TEACHER DASHBOARD ══ */}
      {appScreen==="teacher_dashboard"&&currentUser&&(
        <TeacherDashboard user={currentUser} onBack={()=>setAppScreen("teacher_home")}/>
      )}
 
      {/* ══ STUDENT HOME ══ */}
      {appScreen==="student_home"&&(
        <div style={{...card,animation:"bounceIn 0.4s ease"}}>
          {/* Header row */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12,marginBottom:20}}>
            <div style={{display:"flex",alignItems:"center",gap:14}}>
              <div style={{fontSize:"clamp(34px,5vw,52px)",animation:"float 2s ease-in-out infinite"}}>👋</div>
              <div>
                <h1 style={{fontFamily:"'Fredoka One',cursive",fontSize:"clamp(18px,3.5vw,32px)",color:"#fbbf24",margin:0}}>
                  {masteredTables.length===11?"🏆 Welcome back, champion!":masteredTables.length>0?"Welcome back,":"Welcome,"} {currentUser?.name}!
                </h1>
                <div style={{color:"rgba(255,255,255,0.55)",fontSize:"clamp(12px,1.8vw,15px)",marginTop:3}}>
                  {masteredTables.length===11?"You've mastered all tables!":masteredTables.length>0?`${masteredTables.length} of 11 tables mastered — keep going!`:"Ready to start learning your times tables?"}
                </div>
              </div>
            </div>
            <button style={btn("rgba(255,255,255,0.1)",{fontSize:"clamp(11px,1.6vw,13px)",padding:"8px 16px",boxShadow:"none",border:"1px solid rgba(255,255,255,0.18)"})} onClick={doLogout}>
              Log Out
            </button>
          </div>
 
          {/* Two-column layout */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(280px, 1fr))",gap:16}}>
            {/* Action panel */}
            <div style={{background:"rgba(255,255,255,0.07)",borderRadius:18,padding:"clamp(14px,2.5vw,28px)",display:"flex",flexDirection:"column",gap:12}}>
              <div style={{fontFamily:"'Fredoka One',cursive",fontSize:"clamp(13px,2vw,17px)",color:"rgba(255,255,255,0.5)",marginBottom:2}}>YOUR LEARNING PATH</div>
              {masteredTables.length===0&&(
                <button style={btn("#f472b6",{fontSize:"clamp(14px,2.2vw,20px)",padding:"16px",width:"100%",textAlign:"left"})} onClick={()=>startTable(MIN_TABLE)}>
                  🚀 Begin Learning — Start with the {MIN_TABLE}s Table
                </button>
              )}
              {masteredTables.length>0&&masteredTables.length<11&&(
                <button style={btn(tc,{fontSize:"clamp(14px,2.2vw,20px)",padding:"16px",width:"100%",textAlign:"left"})} onClick={()=>startTable(currentTable)}>
                  📖 Continue Learning — {currentTable}s Table
                </button>
              )}
              {masteredTables.length>0&&(
                <button style={btn("#818cf8",{fontSize:"clamp(14px,2.2vw,20px)",padding:"16px",width:"100%",textAlign:"left"})} onClick={()=>startPractice(masteredTables)}>
                  🔀 Practice Tables I Already Know
                </button>
              )}
              {currentUser?.progress?.certificates?.length>0&&(
                <button style={btn("#fbbf24",{fontSize:"clamp(14px,2.2vw,18px)",padding:"14px",width:"100%",textAlign:"left"})} onClick={()=>setViewCert(currentUser.progress.certificates[currentUser.progress.certificates.length-1])}>
                  🏆 View My Certificate{currentUser.progress.certificates.length>1?"s":""}
                </button>
              )}
            </div>
 
            {/* Progress panel */}
            <div style={{background:"rgba(255,255,255,0.07)",borderRadius:18,padding:"clamp(14px,2.5vw,28px)"}}>
              <div style={{fontFamily:"'Fredoka One',cursive",fontSize:"clamp(13px,2vw,17px)",color:"rgba(255,255,255,0.5)",marginBottom:14}}>YOUR PROGRESS</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(52px, 1fr))",gap:8}}>
                {Array.from({length:MAX_TABLE-MIN_TABLE+1},(_,i)=>i+MIN_TABLE).map(t=>(
                  <div key={t} style={{background:masteredTables.includes(t)?TABLE_COLORS[t]:t===currentTable?"rgba(255,255,255,0.18)":"rgba(255,255,255,0.06)",border:`2px solid ${masteredTables.includes(t)?TABLE_COLORS[t]:t===currentTable?"rgba(255,255,255,0.5)":"rgba(255,255,255,0.12)"}`,borderRadius:12,padding:"10px 6px",textAlign:"center",fontFamily:"'Fredoka One',cursive",fontSize:"clamp(13px,1.8vw,16px)",color:masteredTables.includes(t)?"#fff":t===currentTable?"#fff":"rgba(255,255,255,0.3)",boxShadow:t===currentTable?`0 0 12px ${tc}`:"none",transition:"all 0.3s"}}>
                    <div>{t}s</div>
                    <div style={{fontSize:"clamp(10px,1.4vw,13px)",marginTop:2}}>{masteredTables.includes(t)?"✓":t===currentTable?"▶":"–"}</div>
                  </div>
                ))}
              </div>
              {masteredTables.length>0&&(
                <div style={{marginTop:14}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:"clamp(11px,1.6vw,13px)",color:"rgba(255,255,255,0.45)",marginBottom:5}}>
                    <span>Overall progress</span><span>{masteredTables.length}/11 tables</span>
                  </div>
                  <div style={{width:"100%",height:10,background:"rgba(255,255,255,0.1)",borderRadius:99,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${(masteredTables.length/11)*100}%`,background:"linear-gradient(90deg,#f472b6,#818cf8)",borderRadius:99,transition:"width 0.5s ease"}}/>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
 
      {/* ══ GAME ══ */}
      {appScreen==="game"&&(
        <>
          {/* Stage 1 */}
          {gameScreen==="s1"&&(
            <div style={{...card}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
                <div style={{background:tc,color:"#fff",fontFamily:"'Fredoka One',cursive",fontSize:"clamp(12px,2.4vw,16px)",padding:"5px 14px",borderRadius:99,boxShadow:`0 2px 10px ${tc}88`}}>{currentTable}s Table</div>
                <div style={{fontFamily:"'Fredoka One',cursive",fontSize:"clamp(12px,2.4vw,17px)",color:"#fbbf24"}}>Stage 1 of 3</div>
                <button style={{fontFamily:"'Fredoka One',cursive",fontSize:"clamp(11px,1.9vw,13px)",padding:"5px 13px",borderRadius:99,border:"1px solid rgba(255,255,255,0.2)",background:"rgba(255,255,255,0.07)",color:"rgba(255,255,255,0.6)",cursor:"pointer"}} onClick={()=>setAppScreen("student_home")}>← Home</button>
              </div>
              <div style={{maxWidth:520,margin:"0 auto",textAlign:"center"}}>
              {s1Tutorial?(
                <div style={{animation:"bounceIn 0.4s ease"}}>
                  <div style={{fontSize:"clamp(34px,7vw,54px)",marginBottom:8,animation:"float 2s ease-in-out infinite"}}>🔢</div>
                  <h2 style={{fontFamily:"'Fredoka One',cursive",fontSize:"clamp(17px,3.8vw,26px)",color:"#fff",margin:"0 0 10px"}}>Count by {currentTable}s!</h2>
                  <div style={{background:"rgba(255,255,255,0.08)",borderRadius:14,padding:"12px 14px",marginBottom:12,textAlign:"left"}}>
                    <p style={{color:"rgba(255,255,255,0.88)",fontSize:"clamp(12px,2.2vw,14px)",lineHeight:1.8,margin:"0 0 6px"}}>
                      Start at <strong style={{color:tc}}>{currentTable}</strong>, keep adding <strong style={{color:tc}}>{currentTable}</strong>, all the way to <strong style={{color:"#fbbf24"}}>{currentTable*12}</strong>.
                    </p>
                    <p style={{color:"rgba(255,255,255,0.88)",fontSize:"clamp(12px,2.2vw,14px)",lineHeight:1.8,margin:0}}>
                      First four: <span style={{fontFamily:"'Fredoka One',cursive",color:tc,fontSize:"clamp(13px,2.6vw,17px)"}}>{MULTIPLIERS.slice(0,4).map(m=>currentTable*m).join(" → ")} → ...</span>
                    </p>
                  </div>
                  <div style={{background:"rgba(255,255,255,0.05)",borderRadius:13,padding:"10px 13px",marginBottom:16,textAlign:"left"}}>
                    <p style={{color:"rgba(255,255,255,0.78)",fontSize:"clamp(11px,2vw,13px)",lineHeight:1.9,margin:0}}>
                      <strong style={{color:"#4ade80"}}>How:</strong> Type a number → press <strong style={{color:"#fbbf24"}}>Enter</strong> or tap <strong style={{color:"#fbbf24"}}>Submit</strong>. Timer starts on your first answer. Goal: reach <strong style={{color:tc}}>{currentTable*12}</strong> in {STAGE1_TIME_GOAL}s!
                    </p>
                  </div>
                  <button style={btn(tc,{fontSize:"clamp(14px,2.8vw,20px)",padding:"12px 30px"})} onClick={()=>{setS1Tutorial(false);setTimeout(()=>s1Ref.current?.focus(),50);}}>Got it — let's go! 🚀</button>
                </div>
              ):(
                <>
                  <div style={{fontFamily:"'Fredoka One',cursive",fontSize:"clamp(26px,6.5vw,48px)",color:s1Timer>STAGE1_TIME_GOAL?"#ef4444":"#4ade80",margin:"0 0 3px",textShadow:`0 0 18px ${s1Timer>STAGE1_TIME_GOAL?"#ef4444":"#4ade80"}88`}}>{s1Timer.toFixed(1)}s</div>
                  {s1Best!==null&&<div style={{fontSize:11,color:"rgba(255,255,255,0.35)",marginBottom:5}}>Best: {s1Best.toFixed(1)}s</div>}
                  <div style={{display:"flex",gap:4,justifyContent:"center",flexWrap:"wrap",marginBottom:11}}>
                    {MULTIPLIERS.map(m=>{const done=currentTable*m<s1Next;return <div key={m} style={{width:22,height:22,borderRadius:"50%",background:done?"#4ade80":"rgba(255,255,255,0.09)",border:`2px solid ${done?"#4ade80":"rgba(255,255,255,0.16)"}`,transition:"all 0.2s",boxShadow:done?"0 0 7px #4ade8055":"none"}}/>;  })}
                  </div>
                  {!s1Done?(
                    <>
                      <div style={{fontSize:"clamp(11px,2vw,14px)",color:"rgba(255,255,255,0.58)",marginBottom:9}}>
                        {!s1Running?<span>Type <strong style={{color:tc}}>{currentTable}</strong> to start!</span>:<span>✓ {(s1Next/currentTable)-1} done — keep going!</span>}
                      </div>
                      <input ref={s1Ref} value={s1Input} onChange={e=>setS1Input(e.target.value.replace(/\D/g,""))} onKeyDown={handleS1Key} placeholder="Type a number…" inputMode="numeric" style={bigInput}/>
                      <button style={submitBtn(tc)} onMouseDown={e=>{e.preventDefault();s1Submit();}} onTouchEnd={e=>{e.preventDefault();s1Submit();}}>Submit ✓</button>
                    </>
                  ):(
                    <div style={{animation:"bounceIn 0.4s ease"}}>
                      {s1Timer<=STAGE1_TIME_GOAL?(
                        <><div style={{fontFamily:"'Fredoka One',cursive",fontSize:"clamp(15px,3.2vw,22px)",color:"#4ade80",marginBottom:12}}>⚡ {s1Timer.toFixed(1)}s — Amazing!</div>
                        <button style={btn(tc,{fontSize:"clamp(14px,2.8vw,20px)",padding:"12px 30px"})} onClick={s1Advance}>Next Stage →</button></>
                      ):(
                        <><div style={{fontFamily:"'Fredoka One',cursive",fontSize:"clamp(13px,2.8vw,19px)",color:"#fbbf24",marginBottom:5}}>{s1Timer.toFixed(1)}s — Goal is {STAGE1_TIME_GOAL}s!</div>
                        <div style={{color:"rgba(255,255,255,0.48)",fontSize:"clamp(10px,1.8vw,12px)",marginBottom:12}}>Practice more or move on.</div>
                        <div style={{display:"flex",gap:9,justifyContent:"center",flexWrap:"wrap"}}>
                          <button style={btn("#ef4444")} onClick={s1Restart}>Try Again 🔄</button>
                          <button style={btn(tc)} onClick={s1Advance}>Move On →</button>
                        </div></>
                      )}
                    </div>
                  )}
                </>
              )}
              </div>
            </div>
          )}
 
          {/* Stage 2 */}
          {gameScreen==="s2"&&(()=>{const q=s2Questions[s2Idx]; return(
            <div style={{...card}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
                <div style={{background:tc,color:"#fff",fontFamily:"'Fredoka One',cursive",fontSize:"clamp(12px,2.4vw,16px)",padding:"5px 14px",borderRadius:99,boxShadow:`0 2px 10px ${tc}88`}}>{currentTable}s Table</div>
                <div style={{fontFamily:"'Fredoka One',cursive",fontSize:"clamp(12px,2.4vw,17px)",color:"#fbbf24"}}>Stage 2 of 3</div>
                <button style={{fontFamily:"'Fredoka One',cursive",fontSize:"clamp(11px,1.9vw,13px)",padding:"5px 13px",borderRadius:99,border:"1px solid rgba(255,255,255,0.2)",background:"rgba(255,255,255,0.07)",color:"rgba(255,255,255,0.6)",cursor:"pointer"}} onClick={()=>setAppScreen("student_home")}>← Home</button>
              </div>
              <div style={{maxWidth:520,margin:"0 auto",textAlign:"center"}}>
              <p style={{color:"rgba(255,255,255,0.6)",fontSize:"clamp(10px,1.9vw,13px)",marginBottom:9}}>Answer in order — 3 perfect passes to advance</p>
              <div style={{display:"flex",gap:9,justifyContent:"center",marginBottom:9}}>
                {[0,1,2].map(i=><div key={i} style={{width:30,height:30,borderRadius:"50%",background:i<s2Passes?"#4ade80":"rgba(255,255,255,0.11)",border:`3px solid ${i<s2Passes?"#4ade80":"rgba(255,255,255,0.22)"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,color:"#fff",transition:"all 0.3s"}}>{i<s2Passes?"✓":""}</div>)}
              </div>
              <ProgressBar current={s2Idx} total={s2Questions.length} color={tc}/>
              <div style={{fontSize:"clamp(10px,1.7vw,12px)",color:"rgba(255,255,255,0.38)",marginBottom:11}}>Q {s2Idx+1}/{s2Questions.length}</div>
              <div style={{fontFamily:"'Fredoka One',cursive",fontSize:"clamp(36px,9vw,62px)",color:"#fff",marginBottom:11,textShadow:`0 4px 18px ${tc}66`,animation:"float 3s ease-in-out infinite"}}>{q.a} × {q.b} = ?</div>
              {!s2Wrong&&<CountdownTimer seconds={qTimer} total={QUESTION_TIME}/>}
              {s2Wrong?<WrongPanel wrong={s2Wrong} onDismiss={dismissS2Wrong}/>:(
                <><input ref={s2Ref} value={s2Input} onChange={e=>setS2Input(e.target.value.replace(/\D/g,""))} onKeyDown={handleS2Key} placeholder="?" inputMode="numeric" style={bigInput} autoFocus/>
                <button style={submitBtn(tc)} onMouseDown={e=>{e.preventDefault();s2Submit();}} onTouchEnd={e=>{e.preventDefault();s2Submit();}}>Submit ✓</button></>
              )}
              </div>
            </div>
          );})()}
 
          {/* Stage 3 */}
          {gameScreen==="s3"&&s3Questions.length>0&&(()=>{const q=s3Questions[s3Idx%s3Questions.length]; const done=s3Remaining-s3Questions.length; return(
            <div style={{...card}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
                <div style={{background:tc,color:"#fff",fontFamily:"'Fredoka One',cursive",fontSize:"clamp(12px,2.4vw,16px)",padding:"5px 14px",borderRadius:99,boxShadow:`0 2px 10px ${tc}88`}}>{currentTable}s Table</div>
                <div style={{fontFamily:"'Fredoka One',cursive",fontSize:"clamp(12px,2.4vw,17px)",color:"#fbbf24"}}>Stage 3 of 3</div>
                <button style={{fontFamily:"'Fredoka One',cursive",fontSize:"clamp(11px,1.9vw,13px)",padding:"5px 13px",borderRadius:99,border:"1px solid rgba(255,255,255,0.2)",background:"rgba(255,255,255,0.07)",color:"rgba(255,255,255,0.6)",cursor:"pointer"}} onClick={()=>setAppScreen("student_home")}>← Home</button>
              </div>
              <div style={{maxWidth:520,margin:"0 auto",textAlign:"center"}}>
              <p style={{color:"rgba(255,255,255,0.6)",fontSize:"clamp(10px,1.9vw,13px)",marginBottom:2}}>Mixed order — clear all questions!</p>
              {masteredTables.length>0&&<p style={{color:"rgba(255,255,255,0.38)",fontSize:"clamp(10px,1.7vw,12px)",marginBottom:5}}>Also reviewing: {masteredTables.map(t=>`${t}s`).join(", ")}</p>}
              <ProgressBar current={done} total={s3Remaining} color={tc}/>
              <div style={{fontSize:"clamp(10px,1.7vw,12px)",color:"rgba(255,255,255,0.38)",marginBottom:11}}>{s3Questions.length} left</div>
              <div style={{fontFamily:"'Fredoka One',cursive",fontSize:"clamp(36px,9vw,62px)",color:"#fff",marginBottom:5,textShadow:`0 4px 18px ${tc}66`,animation:"float 3s ease-in-out infinite"}}>{q.a} × {q.b} = ?</div>
              <div style={{display:"flex",gap:4,justifyContent:"center",marginBottom:9}}>
                {Array.from({length:q.streakNeeded}).map((_,i)=><div key={i} style={{width:11,height:11,borderRadius:"50%",background:i<q.streak?"#4ade80":"rgba(255,255,255,0.16)",border:"2px solid rgba(255,255,255,0.24)",transition:"all 0.3s"}}/>)}
              </div>
              {!s3Wrong&&<CountdownTimer seconds={qTimer} total={QUESTION_TIME}/>}
              {s3Wrong?<WrongPanel wrong={s3Wrong} onDismiss={dismissS3Wrong}/>:(
                <><input ref={s3Ref} value={s3Input} onChange={e=>setS3Input(e.target.value.replace(/\D/g,""))} onKeyDown={handleS3Key} placeholder="?" inputMode="numeric" style={bigInput} autoFocus/>
                <button style={submitBtn(tc)} onMouseDown={e=>{e.preventDefault();s3Submit();}} onTouchEnd={e=>{e.preventDefault();s3Submit();}}>Submit ✓</button></>
              )}
              </div>
            </div>
          );})()}
 
          {/* Practice */}
          {gameScreen==="practice"&&practiceQs.length>0&&(()=>{const q=practiceQs[practiceIdx%practiceQs.length]; const done=practiceRemaining-practiceQs.length; return(
            <div style={{...card}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
                <div style={{background:"#818cf8",color:"#fff",fontFamily:"'Fredoka One',cursive",fontSize:"clamp(12px,2.4vw,16px)",padding:"5px 14px",borderRadius:99,boxShadow:"0 2px 10px #818cf888"}}>🔀 Practice</div>
                <button style={{fontFamily:"'Fredoka One',cursive",fontSize:"clamp(11px,1.9vw,13px)",padding:"5px 13px",borderRadius:99,border:"1px solid rgba(255,255,255,0.2)",background:"rgba(255,255,255,0.07)",color:"rgba(255,255,255,0.6)",cursor:"pointer"}} onClick={()=>setAppScreen("student_home")}>← Home</button>
              </div>
              <div style={{maxWidth:520,margin:"0 auto",textAlign:"center"}}>
              <p style={{color:"rgba(255,255,255,0.58)",fontSize:"clamp(10px,1.9vw,13px)",marginBottom:2}}>Mixed review!</p>
              <p style={{color:"rgba(255,255,255,0.36)",fontSize:"clamp(10px,1.7vw,12px)",marginBottom:5}}>Tables: {masteredTables.map(t=>`${t}s`).join(", ")}</p>
              <ProgressBar current={done} total={practiceRemaining} color="#818cf8"/>
              <div style={{fontSize:"clamp(10px,1.7vw,12px)",color:"rgba(255,255,255,0.36)",marginBottom:11}}>{practiceQs.length} left</div>
              <div style={{fontFamily:"'Fredoka One',cursive",fontSize:"clamp(36px,9vw,62px)",color:"#fff",marginBottom:5,textShadow:"0 4px 18px #818cf866",animation:"float 3s ease-in-out infinite"}}>{q.a} × {q.b} = ?</div>
              <div style={{display:"flex",gap:4,justifyContent:"center",marginBottom:9}}>
                {Array.from({length:q.streakNeeded}).map((_,i)=><div key={i} style={{width:11,height:11,borderRadius:"50%",background:i<q.streak?"#818cf8":"rgba(255,255,255,0.16)",border:"2px solid rgba(255,255,255,0.24)",transition:"all 0.3s"}}/>)}
              </div>
              {practiceWrong?<WrongPanel wrong={practiceWrong} onDismiss={dismissPracticeWrong}/>:(
                <><input ref={practiceRef} value={practiceInput} onChange={e=>setPracticeInput(e.target.value.replace(/\D/g,""))} onKeyDown={handlePracticeKey} placeholder="?" inputMode="numeric" style={bigInput} autoFocus/>
                <button style={submitBtn("#818cf8")} onMouseDown={e=>{e.preventDefault();practiceSubmit();}} onTouchEnd={e=>{e.preventDefault();practiceSubmit();}}>Submit ✓</button></>
              )}
              </div>
            </div>
          );})()}
 
          {!["home","practice"].includes(gameScreen)&&<Footer/>}
        </>
      )}
    </div>
  );
}