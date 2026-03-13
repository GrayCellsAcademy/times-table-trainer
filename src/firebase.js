import { initializeApp } from "firebase/app";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  arrayUnion,
} from "firebase/firestore";

// ─── Your Firebase config ────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyA56SztCTkXaEBaiMe6WJ_ebkHmTLQFDxY",
  authDomain: "times-table-trainer-40e94.firebaseapp.com",
  projectId: "times-table-trainer-40e94",
  storageBucket: "times-table-trainer-40e94.firebasestorage.app",
  messagingSenderId: "735163745581",
  appId: "1:735163745581:web:b6994fc968227ae661bfa4",
  measurementId: "G-RTTSZV9K98",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// ─── Auth helpers ────────────────────────────────────────────────

export async function registerUser(email, password, name, role) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  const uid = cred.user.uid;
  await setDoc(doc(db, "users", uid), {
    id: uid,
    name,
    role,
    email,
    classId: null,
    progress: {
      currentTable: 2,
      masteredTables: [],
      stage: "s1",
      certificates: [],
    },
  });
  return cred.user;
}

export async function loginUser(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function logoutUser() {
  await signOut(auth);
}

export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

// ─── User helpers ────────────────────────────────────────────────

export async function getUser(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : null;
}

export async function updateProgress(uid, progress) {
  await updateDoc(doc(db, "users", uid), { progress });
}

export async function addCertificate(uid, cert) {
  await updateDoc(doc(db, "users", uid), {
    "progress.certificates": arrayUnion(cert),
    "progress.masteredTables": cert.tables,
  });
}

export async function setUserClass(uid, classId) {
  await updateDoc(doc(db, "users", uid), { classId });
}

// ─── Class helpers ───────────────────────────────────────────────

export async function createClass(name, password, teacherId) {
  const classId = "cls_" + Date.now().toString(36);
  await setDoc(doc(db, "classes", classId), {
    id: classId,
    name,
    password,
    teacherId,
    studentIds: [],
  });
  await updateDoc(doc(db, "users", teacherId), { classId });
  return classId;
}

export async function getClass(classId) {
  const snap = await getDoc(doc(db, "classes", classId));
  return snap.exists() ? snap.data() : null;
}

export async function joinClass(uid, className, password) {
  // Query by name only (case-insensitive), then check password in JS
  const q = query(
    collection(db, "classes"),
    where("name", "==", className.trim())
  );
  const snap = await getDocs(q);

  // Also try case-insensitive match in case name casing differs
  let matchDoc = snap.docs.find(d => 
    d.data().name.toLowerCase() === className.trim().toLowerCase() &&
    d.data().password === password.trim()
  );

  // If exact match failed, try fetching all classes and matching case-insensitively
  if (!matchDoc) {
    const allSnap = await getDocs(collection(db, "classes"));
    matchDoc = allSnap.docs.find(d =>
      d.data().name.toLowerCase() === className.trim().toLowerCase() &&
      d.data().password === password.trim()
    );
  }

  if (!matchDoc) throw new Error("Class not found or wrong password.");

  const cls = matchDoc.data();
  const classId = cls.id;

  await updateDoc(doc(db, "classes", classId), {
    studentIds: arrayUnion(uid),
  });
  await updateDoc(doc(db, "users", uid), { classId });
  return cls;
}

export async function getStudentsForClass(classId) {
  const cls = await getClass(classId);
  if (!cls || !cls.studentIds.length) return [];
  const students = await Promise.all(
    cls.studentIds.map((id) => getUser(id))
  );
  return students.filter(Boolean);
}
