/* Field Booking UI style: Desktop and Mobile share the supplied screenshot palette: green header, light page background, white dashboard card, and green active states. Mobile keeps its existing drawer, sizing, spacing, and responsive shell. Preserve Burmese-first booking/auth/payment/history business logic, Cash payments, 50%/100% plans, and selected-page-only rendering. */
import React, { useState, useEffect, useRef } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyCMuEbPcTT97j-WvNLAwcAX3nJr_-x1uFo",
  authDomain: "fieldbooking-80ad6.firebaseapp.com",
  projectId: "fieldbooking-80ad6",
  storageBucket: "fieldbooking-80ad6.firebasestorage.app",
  messagingSenderId: "297623698493",
  appId: "1:297623698493:web:49483a28305cba8abc7e54",
  measurementId: "G-NF0Y9PM37G"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
export const db = getFirestore(app);
export const auth = getAuth(app);
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword, sendPasswordResetEmail, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth'; 
import { collection, getDoc, getDocs, addDoc, updateDoc, deleteDoc, doc, setDoc, runTransaction, onSnapshot, query, where, limit, startAfter, orderBy } from 'firebase/firestore';

const defaultUsers = [
  { email: 'admin@gmail.com', password: 'admin123', name: 'System Admin', role: 'admin' }
];

const defaultFields = [
  {
    id: 'f1',
    ownerEmail: 'owner@gmail.com',
    ownerPassword: 'owner123',
    ownerStatus: 'Active', 
    name: 'YUFC',
    location: 'လှိုင်မြို့နယ်',
    address: 'အမှတ် (၁၂၃)၊ လှိုင်မြို့နယ်',
    phone: '09795562378',
    openHour: 8,
    closeHour: 20,
    city: 'ရန်ကုန်',
    subFields: [
      { id: 'sf_1', name: 'Field A', price: 35000, openHour: 8, closeHour: 20, status: 'Active' },
      { id: 'sf_2', name: 'Field B', price: 40000, openHour: 8, closeHour: 20, status: 'Active' },
      { id: 'sf_3', name: 'Field C', price: 45000, openHour: 8, closeHour: 20, status: 'Active' }
    ],
    paymentInfo: { kpay: '09-791234567 (KPay)', wave: '09-421234567 (Wave)' }
  }
];

const generateSingleTimeSlots = (openHour, closeHour, includeClosingTime = false) => {
  const slots = [];
  const start = openHour !== undefined && !isNaN(openHour) ? parseInt(openHour) : 8;
  const end = closeHour !== undefined && !isNaN(closeHour) ? parseInt(closeHour) : 22;
  
  for (let i = start; i <= (includeClosingTime ? end : end - 1); i++) {
    const format12Hour = (h24) => {
      const period = h24 >= 12 ? 'PM' : 'AM';
      const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
      return `${h12 < 10 ? `0${h12}` : h12}:00 ${period}`;
    };
    slots.push({ hour: i, label: `${format12Hour(i)} - ${format12Hour(i + 1)}` });
  }
  return slots;
};

// Payment screenshots must be available to the Owner on another device, so keep an
// optimized image data URL in the booking document instead of only keeping the
// temporary File object from the browser input.
const HISTORY_PAGE_SIZE = 50;
const REMEMBERED_LOGIN_STORAGE_KEY = 'fieldBookingRememberedLogin';

const detectMobileDevice = () => {
  if (typeof navigator === 'undefined') return false;
  const userAgent = navigator.userAgent || '';
  const isAppleTablet = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent) || isAppleTablet;
};

const readRememberedLogin = () => {
  try {
    const saved = localStorage.getItem(REMEMBERED_LOGIN_STORAGE_KEY);
    if (!saved) return { email: '', password: '', remember: false };
    const parsed = JSON.parse(saved);
    if (typeof parsed?.email !== 'string' || typeof parsed?.password !== 'string') {
      localStorage.removeItem(REMEMBERED_LOGIN_STORAGE_KEY);
      return { email: '', password: '', remember: false };
    }
    return { email: parsed.email, password: parsed.password, remember: true };
  } catch (error) {
    console.warn('Remembered login data is unavailable on this device.', error);
    return { email: '', password: '', remember: false };
  }
};

const getStoredUserRole = () => {
  try {
    const savedUser = sessionStorage.getItem('currentUser');
    if (!savedUser) return '';
    const parsed = JSON.parse(savedUser);
    return typeof parsed?.role === 'string' ? parsed.role : '';
  } catch {
    return '';
  }
};

const getStoredRolePage = (role, fallback = 'fields') => {
  if (!role) return sessionStorage.getItem('activeTab') || fallback;
  return sessionStorage.getItem(`fieldBooking:activeTab:${role}`)
    || sessionStorage.getItem('activeTab')
    || fallback;
};

const getStoredRoleInnerPage = (role, fallback) => {
  if (!role) return fallback;
  return sessionStorage.getItem(`fieldBooking:innerTab:${role}`) || fallback;
};

const getBookingSlotLockId = (fieldId, subFieldId, date, hour) => [
  fieldId || 'unknown-field',
  subFieldId || 'unknown-sub-field',
  date || 'unknown-date',
  Number(hour)
].join('__').replace(/[^A-Za-z0-9_-]/g, '-');

const getBookingSlotLockRefs = (booking) => {
  const startHour = Number(booking?.startHour);
  const endHour = Number(booking?.endHour);
  if (!booking?.fieldId || !booking?.subFieldId || !booking?.date || !Number.isFinite(startHour) || !Number.isFinite(endHour) || endHour <= startHour) {
    return [];
  }
  return Array.from({ length: endHour - startHour }, (_, index) => doc(
    db,
    'bookingSlotLocks',
    getBookingSlotLockId(booking.fieldId, booking.subFieldId, booking.date, startHour + index)
  ));
};

const dedupeBookingRecords = (records) => {
  const seen = new Set();
  return records.filter((booking) => {
    const key = [
      booking.fieldId || '',
      booking.subFieldId || '',
      booking.date || '',
      Number(booking.startHour),
      Number(booking.endHour),
      booking.userEmail || '',
      booking.bookedBy || ''
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const preparePaymentScreenshot = (file) => new Promise((resolve, reject) => {
  if (!file) {
    resolve(null);
    return;
  }
  if (!file.type || !file.type.startsWith('image/')) {
    reject(new Error('PAYMENT_SCREENSHOT_MUST_BE_IMAGE'));
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    reject(new Error('PAYMENT_SCREENSHOT_TOO_LARGE'));
    return;
  }

  const reader = new FileReader();
  reader.onerror = () => reject(new Error('PAYMENT_SCREENSHOT_READ_FAILED'));
  reader.onload = () => {
    const image = new Image();
    image.onerror = () => reject(new Error('PAYMENT_SCREENSHOT_READ_FAILED'));
    image.onload = () => {
      const maxSide = 1600;
      const scale = Math.min(1, maxSide / image.width, maxSide / image.height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('PAYMENT_SCREENSHOT_READ_FAILED'));
        return;
      }
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      let quality = 0.82;
      let dataUrl = canvas.toDataURL('image/jpeg', quality);
      while (dataUrl.length > 750000 && quality > 0.5) {
        quality -= 0.08;
        dataUrl = canvas.toDataURL('image/jpeg', quality);
      }
      if (dataUrl.length > 750000) {
        reject(new Error('PAYMENT_SCREENSHOT_TOO_LARGE'));
        return;
      }
      resolve(dataUrl);
    };
    image.src = reader.result;
  };
  reader.readAsDataURL(file);
});

export default function FieldBookingApp() {

  // Forced Update Check State
  const [currentAppVersion] = useState(1); // Increment this when new APK is released
  const [forceUpdate, setForceUpdate] = useState(false);
  const [latestVersionName, setLatestVersionName] = useState('v1.1');
  const [downloadUrl, setDownloadUrl] = useState('#');

  useEffect(() => {
    const checkVersion = async () => {
      try {
        const docRef = doc(db, 'appConfig', 'settings');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          const configuredAdminPassword = typeof data.adminPassword === 'string' ? data.adminPassword.trim() : '';
          if (configuredAdminPassword) {
            setAdminPassword(configuredAdminPassword);
          }
          const minVersion = data.minVersion || 1;
          const remoteVersionName = data.versionName || 'v1.1';
          const apkUrl = data.apkUrl || '#';
          
          setLatestVersionName(remoteVersionName);
          setDownloadUrl(apkUrl);

          if (currentAppVersion < minVersion) {
            setForceUpdate(true);
          }
        }
      } catch (e) {
        console.log('Version check offline or collection not created yet, defaulting to normal', e);
      }
    };
    checkVersion();
  }, []);


  // App Version & Update Check State
  const CURRENT_APP_VERSION = 1; // Increase this when building new APK release
  const [updateAvailable, setUpdateAvailable] = useState(false);
  // latestVersionName is shared with the forced-update state above.

  useEffect(() => {
    // Check Firestore app config for latest version
    const checkAppVersion = async () => {
      try {
        const configRef = doc(db, 'appConfig', 'settings');
        const configSnap = await getDoc(configRef);
        if (configSnap.exists()) {
          const data = configSnap.data();
          if (data.minVersion && data.minVersion > CURRENT_APP_VERSION) {
            setUpdateAvailable(true);
            setLatestVersionName(data.versionName || 'v1.1');
          }
        }
      } catch (err) {
        console.log('Version check offline or not set up yet', err);
      }
    };
    checkAppVersion();
  }, []);

  const [currentUser, setCurrentUser] = useState(() => {
    const savedUser = sessionStorage.getItem('currentUser');
    return savedUser ? JSON.parse(savedUser) : null;
  }); 

  const [email, setEmail] = useState(() => readRememberedLogin().email);
  const [password, setPassword] = useState(() => readRememberedLogin().password);
  const [rememberLogin, setRememberLogin] = useState(() => readRememberedLogin().remember);
  
  const [authMode, setAuthMode] = useState('login'); 
  const [signupName, setSignupName] = useState('');
  const [signupPassword, setSignupPassword] = useState('');

  const [myNewPassword, setMyNewPassword] = useState('');
  // The admin password is persisted in appConfig/settings and is loaded once at startup.
  // Keep the legacy default only as an offline/first-run fallback.
  const [adminPassword, setAdminPassword] = useState('admin123');
  const [selectedTownship, setSelectedTownship] = useState('');

  // PWA & Browser App Install Prompt State
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showIosInstallModal, setShowIosInstallModal] = useState(false);
  const [isAppInstalled, setIsAppInstalled] = useState(false);
  const [isMobileDevice] = useState(() => detectMobileDevice());

  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    const handleAppInstalled = () => {
      setIsAppInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener('appinstalled', handleAppInstalled);

    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
      setIsAppInstalled(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    } else {
      // Check if iOS
      const isIOS = /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
      if (isIOS) {
        setShowIosInstallModal(true);
      } else {
        alert('ဤဘရောက်ဆာတွင် App ကို Home Screen သို့ တိုက်ရိုက်တင်ရန် မထောက်ပံ့သေးပါ။ Chrome သို့မဟုတ် Safari ၏ Menu မှ "Add to Home Screen" သို့မဟုတ် "Install App" ကို အသုံးပြုပါ။');
      }
    }
  };

  const [usersList, setUsersList] = useState(defaultUsers);
  const [fields, setFields] = useState(defaultFields);
  const [bookings, setBookings] = useState([]);
  // `bookings` is reserved for the small real-time availability window only.
  // History and reports use bounded server queries below instead of loading every booking.
  const [historyBookings, setHistoryBookings] = useState([]);
  const [historyDate, setHistoryDate] = useState('');
  const [historyPage, setHistoryPage] = useState(0);
  const [historyCursorStack, setHistoryCursorStack] = useState([]);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRefreshToken, setHistoryRefreshToken] = useState(0);
  const [reportBookings, setReportBookings] = useState([]);
  const [smsNotifications, setSmsNotifications] = useState([]);
  const [showNotiDropdown, setShowNotiDropdown] = useState(false);

  // Notification Filter state for Admin Page
  const [notiFilterType, setNotiFilterType] = useState('all');
  // Admin Notification Calendar Filter (Default to current date)
  const [adminNotiDate, setAdminNotiDate] = useState(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });
  // Admin Notification Field Filter
  const [adminNotiFieldId, setAdminNotiFieldId] = useState('all');
  
  // Notification Filter state for Owner Page (Booking Pending, New Booking, Booking Reject သာပြရန်)
  const [ownerNotiFilterType, setOwnerNotiFilterType] = useState('all');
  // Owner Notification Calendar Filter (Default to current date)
  const [ownerNotiDate, setOwnerNotiDate] = useState(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });
  // Owner Notification Field Filter
  const [ownerNotiFieldId, setOwnerNotiFieldId] = useState('all');

  // Date filters for the Admin overall report and the Owner-owned-fields report.
  const [adminReportDate, setAdminReportDate] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  });
  const [ownerReportDate, setOwnerReportDate] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  });
  const [usageCleanupBefore, setUsageCleanupBefore] = useState(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    return `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;
  });

  const [activeTab, setActiveTab] = useState(() => getStoredRolePage(getStoredUserRole(), 'fields'));


  const [userSelectedField, setUserSelectedField] = useState(() => {
    const saved = sessionStorage.getItem('userSelectedField');
    return saved ? JSON.parse(saved) : null;
  });
  
  const [selectedSubField, setSelectedSubField] = useState(() => {
    const saved = sessionStorage.getItem('selectedSubField');
    return saved ? JSON.parse(saved) : null;
  });
  
  const [userCheckDate, setUserCheckDate] = useState(() => {
    const savedDate = sessionStorage.getItem('userCheckDate');
    if (savedDate) return savedDate;

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });
  
  const [selectedStartSlot, setSelectedStartSlot] = useState('');
  const [selectedEndSlot, setSelectedEndSlot] = useState('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('');
  const [paymentPlan, setPaymentPlan] = useState('100');
  const [paymentScreenshot, setPaymentScreenshot] = useState(null);
  const [transactionLast5, setTransactionLast5] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [selectedPaymentReview, setSelectedPaymentReview] = useState(null);

  const [ownerCustomerName, setOwnerCustomerName] = useState('');
  const [ownerCustomerPhone, setOwnerCustomerPhone] = useState('');

  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldLocation, setNewFieldLocation] = useState('');
  const [newFieldAddress, setNewFieldAddress] = useState('');
  const [newFieldPhone, setNewFieldPhone] = useState('');
  const [newFieldOpenHour, setNewFieldOpenHour] = useState(8);
  const [newFieldCloseHour, setNewFieldCloseHour] = useState(22);
  const [newFieldKpay, setNewFieldKpay] = useState('09-791234567 (KPay)');
  const [newFieldWave, setNewFieldWave] = useState('09-421234567 (Wave)');
  
  const [newOwnerEmail, setNewOwnerEmail] = useState('');
  const [newOwnerPassword, setNewOwnerPassword] = useState('');

  const [newSubFieldName, setNewSubFieldName] = useState('');
  const [newSubFieldPrice, setNewSubFieldPrice] = useState('');
  const [newSubFieldOpenHour, setNewSubFieldOpenHour] = useState(8);
  const [newSubFieldCloseHour, setNewSubFieldCloseHour] = useState(22);
  const [newSubFieldStatus, setNewSubFieldStatus] = useState('Active');

  const [ownerSubFields, setOwnerSubFields] = useState([]);

  const [editingFieldId, setEditingFieldId] = useState(null);
  const [editFieldName, setEditFieldName] = useState('');
  const [editFieldLocation, setEditFieldLocation] = useState('');
  const [editFieldAddress, setEditFieldAddress] = useState('');
  const [editFieldPhone, setEditFieldPhone] = useState('');
  const [editFieldOpenHour, setEditFieldOpenHour] = useState(8);
  const [editFieldCloseHour, setEditFieldCloseHour] = useState(22);
  const [editFieldKpay, setEditFieldKpay] = useState('');
  const [editFieldWave, setEditFieldWave] = useState('');
  const [editSubFields, setEditSubFields] = useState([]);

  const [editingOwnerFieldId, setEditingOwnerFieldId] = useState(null);
  const [ownerEditFieldName, setOwnerEditFieldName] = useState('');
  const [ownerEditFieldLocation, setOwnerEditFieldLocation] = useState('');
  const [ownerEditFieldAddress, setOwnerEditFieldAddress] = useState('');
  const [ownerEditFieldPhone, setOwnerEditFieldPhone] = useState('');
  const [ownerEditFieldOpenHour, setOwnerEditFieldOpenHour] = useState(8);
  const [ownerEditFieldCloseHour, setOwnerEditFieldCloseHour] = useState(22);
  const [ownerEditFieldKpay, setOwnerEditFieldKpay] = useState('');
  const [ownerEditFieldWave, setOwnerEditFieldWave] = useState('');
  const [ownerEditFieldStatus, setOwnerEditFieldStatus] = useState('Active');
  const [ownerEditSubFields, setOwnerEditSubFields] = useState([]);

  const [adminTab, setAdminTab] = useState(() => getStoredRoleInnerPage(getStoredUserRole() === 'admin' ? 'admin' : '', 'pending'));
  const [ownerActiveTab, setOwnerActiveTab] = useState(() => getStoredRoleInnerPage(getStoredUserRole() === 'owner' ? 'owner' : '', 'pending'));
  const [mobileHeaderMenuOpen, setMobileHeaderMenuOpen] = useState(false);
  const [adminMobileMenuOpen, setAdminMobileMenuOpen] = useState(false);
  const [ownerMobileMenuOpen, setOwnerMobileMenuOpen] = useState(false);
  const historyRequestRef = useRef(0);

  // Mobile navigation follows the reference pattern: one left-side drawer for every role.
  // Keep the existing desktop tabs and role-specific inner menus unchanged.
  useEffect(() => {
    if (!mobileHeaderMenuOpen) return undefined;
    const handleDrawerKeyDown = (event) => {
      if (event.key === 'Escape') setMobileHeaderMenuOpen(false);
    };
    document.addEventListener('keydown', handleDrawerKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleDrawerKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileHeaderMenuOpen]);

  useEffect(() => {
    if (currentUser) {
      sessionStorage.setItem('currentUser', JSON.stringify(currentUser));
    } else {
      sessionStorage.removeItem('currentUser');
    }
  }, [currentUser]);

  useEffect(() => {
    sessionStorage.setItem('activeTab', activeTab);
    if (currentUser?.role) {
      sessionStorage.setItem(`fieldBooking:activeTab:${currentUser.role}`, activeTab);
    }
  }, [activeTab, currentUser?.role]);

  useEffect(() => {
    if (currentUser?.role === 'admin') {
      sessionStorage.setItem('fieldBooking:innerTab:admin', adminTab);
    }
  }, [adminTab, currentUser?.role]);

  useEffect(() => {
    if (currentUser?.role === 'owner') {
      sessionStorage.setItem('fieldBooking:innerTab:owner', ownerActiveTab);
    }
  }, [ownerActiveTab, currentUser?.role]);

  useEffect(() => {
    if (userSelectedField) {
      sessionStorage.setItem('userSelectedField', JSON.stringify(userSelectedField));
    } else {
      sessionStorage.removeItem('userSelectedField');
    }
  }, [userSelectedField]);

  useEffect(() => {
    if (selectedSubField) {
      sessionStorage.setItem('selectedSubField', JSON.stringify(selectedSubField));
    } else {
      sessionStorage.removeItem('selectedSubField');
    }
  }, [selectedSubField]);

  useEffect(() => {
    sessionStorage.setItem('userCheckDate', userCheckDate);
  }, [userCheckDate]);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Resolve user role and name from users collection or fields collection by email/uid
        const email = firebaseUser.email || '';
        if (email === 'admin@gmail.com') {
          setCurrentUser({ name: 'System Admin', role: 'admin', email: 'admin@gmail.com', uid: firebaseUser.uid });
          return;
        }
        // Check users collection
        try {
          const userQuery = query(collection(db, 'users'), where('email', '==', email));
          const userSnap = await getDocs(userQuery);
          if (!userSnap.empty) {
            const uData = userSnap.docs[0].data();
            setCurrentUser({ name: uData.name, role: uData.role || 'user', email: uData.email, uid: firebaseUser.uid });
            return;
          }
          // Check fields collection for owner
          const fieldSnap = await getDocs(query(collection(db, 'fields'), where('ownerEmail', '==', email)));
          if (!fieldSnap.empty) {
            const fData = fieldSnap.docs[0].data();
            if (fData.ownerStatus !== 'Disabled') {
              setCurrentUser({ name: fData.name, role: 'owner', email: fData.ownerEmail, uid: firebaseUser.uid });
              return;
            }
          }
        } catch (err) {
          console.error("Error resolving auth role:", err);
        }
        // Fallback default user
        setCurrentUser({ name: email.split('@')[0] || 'User', role: 'user', email, uid: firebaseUser.uid });
      } else {
        setCurrentUser(null);
      }
    });

    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!currentUser?.uid) {
      setUsersList(defaultUsers);
      setFields(defaultFields);
      setSmsNotifications([]);
      return undefined;
    }

    const unsubUsers = onSnapshot(collection(db, "users"), (snapshot) => {
      setUsersList(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubFields = onSnapshot(collection(db, "fields"), (snapshot) => {
      if (!snapshot.empty) {
        setFields(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      } else if (currentUser.role === 'admin') {
        defaultFields.forEach(async (f) => {
          await setDoc(doc(db, "fields", f.id), f);
        });
      }
    });

    // Read optimization: only keep the latest 100 notifications in the
    // real-time listener. The previous 500-document listener could consume
    // hundreds of reads every time the listener reconnects or its data changes.
    // Booking history is still available separately through the paginated history query.
    const recentNotificationsQuery = query(
      collection(db, 'notifications'),
      orderBy('createdAtTime', 'desc'),
      limit(100)
    );
    const unsubNoti = onSnapshot(recentNotificationsQuery, (snapshot) => {
      const rawNotis = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      const seen = new Set();
      const uniqueNotis = rawNotis.filter(n => {
        const key = [
          n.bookingId || '',
          n.type || '',
          n.subType || '',
          n.fieldId || '',
          n.date || '',
          n.time || '',
          n.message || ''
        ].join('|');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const getNotificationTime = (notification) => {
        if (typeof notification.createdAtTime === 'number' && Number.isFinite(notification.createdAtTime)) {
          return notification.createdAtTime;
        }
        if (notification.createdAt?.toMillis) return notification.createdAt.toMillis();
        if (notification.createdAt?.seconds) return notification.createdAt.seconds * 1000;
        const parsed = new Date(`${notification.date || ''} ${notification.time || ''}`).getTime();
        return Number.isFinite(parsed) ? parsed : 0;
      };
      const sortedNotis = [...uniqueNotis].sort((a, b) => {
        const timeDifference = getNotificationTime(b) - getNotificationTime(a);
        return timeDifference !== 0
          ? timeDifference
          : String(b.id || '').localeCompare(String(a.id || ''));
      });
      setSmsNotifications(sortedNotis);
    });

    return () => {
      unsubUsers();
      unsubFields();
      unsubNoti();
    };
  }, [currentUser?.uid, currentUser?.role]);

  // Availability only needs bookings for the selected field and selected date.
  // This keeps the real-time listener bounded even when the historical collection is large.
  useEffect(() => {
    const activeFieldId = userSelectedField?.id;
    if (!currentUser || !activeFieldId || !userCheckDate) {
      setBookings([]);
      return undefined;
    }

    const availabilityQuery = query(
      collection(db, 'bookings'),
      where('fieldId', '==', activeFieldId),
      where('date', '==', userCheckDate)
    );
    const unsubscribe = onSnapshot(availabilityQuery, (snapshot) => {
      setBookings(dedupeBookingRecords(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))));
    }, (error) => {
      console.error('Availability listener error:', error);
      setBookings([]);
    });

    return unsubscribe;
  }, [currentUser?.email, userSelectedField?.id, userCheckDate]);

  useEffect(() => {
    if (userSelectedField) {
      const currentFieldInState = fields.find(f => f.id === userSelectedField.id);
      if (!currentFieldInState || (currentFieldInState.ownerStatus && currentFieldInState.ownerStatus.trim().toLowerCase() === 'disabled')) {
        setUserSelectedField(null);
        setSelectedSubField(null);
        sessionStorage.removeItem('userSelectedField');
        sessionStorage.removeItem('selectedSubField');
      } else {
        setUserSelectedField(currentFieldInState);
        if (selectedSubField) {
          const updatedSub = currentFieldInState.subFields.find(sf => sf.id === selectedSubField.id);
          if (updatedSub) setSelectedSubField(updatedSub);
        }
      }
    }
  }, [fields]);

  const triggerSmsNotification = async (message, type = 'general', subType = '', fieldId = '', bookingId = '') => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const currentDateStr = `${yyyy}-${mm}-${dd}`;

    const newNoti = {
      message: message,
      type: type, 
      subType: subType, 
      fieldId: fieldId,
      ...(bookingId ? { bookingId } : {}),
      time: now.toLocaleTimeString(),
      date: currentDateStr,
      read: false,
      createdAtTime: now.getTime()
    };
    try {
      // A booking can only create ONE notification for the same notification type.
      // Using a deterministic document ID makes the operation idempotent, so
      // double-clicks/rerenders cannot create duplicate notification documents.
      const notificationDocId = bookingId
        ? `booking_${bookingId}_${subType || type || 'general'}`
        : null;

      if (notificationDocId) {
        await setDoc(doc(db, "notifications", notificationDocId), newNoti, { merge: false });
      } else {
        await addDoc(collection(db, "notifications"), newNoti);
      }
      // Do not manually update local state here. onSnapshot is the single source
      // of truth and prevents the local-state + Firestore listener double-render.
    } catch (e) {
      console.error("Error adding notification: ", e);
    }
  };

  const handleMarkNotificationsAsRead = async () => {
    const unreadNotis = smsNotifications.filter(n => !n.read);
    if (unreadNotis.length === 0) return;

    setSmsNotifications(prev => prev.map(n => ({ ...n, read: true })));

    try {
      for (const n of unreadNotis) {
        await updateDoc(doc(db, "notifications", n.id), { read: true });
      }
    } catch (error) {
      console.error("Error updating notification read status: ", error);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.township-dropdown-container') && !event.target.closest('.notification-dropdown-container')) {
        setShowNotiDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const normalizedCurrentEmail = String(currentUser?.email || '').trim().toLowerCase();
  const ownerFieldIds = fields
    .filter(f => String(f.ownerEmail || '').trim().toLowerCase() === normalizedCurrentEmail)
    .map(f => f.id);
  const ownerFieldQueryIds = ownerFieldIds.slice(0, 30);

  const sortBookingRecords = (records) => [...records].sort((a, b) => {
    const timeA = a.createdAtTime || (a.bookedAt ? new Date(a.bookedAt).getTime() : 0);
    const timeB = b.createdAtTime || (b.bookedAt ? new Date(b.bookedAt).getTime() : 0);
    if (timeA !== timeB) return timeB - timeA;
    return String(b.id || '').localeCompare(String(a.id || ''));
  });

  // History is deliberately paginated. A 50-row page keeps render cost and reads bounded,
  // while the optional date filter lets Admin/Owner narrow the query to one operating day.
  useEffect(() => {
    setHistoryPage(0);
    setHistoryCursorStack([]);
    setHistoryBookings([]);
  }, [currentUser?.role, currentUser?.email, historyDate]);

  useEffect(() => {
    const requestId = ++historyRequestRef.current;
    let cancelled = false;

    const loadHistoryPage = async () => {
      if (!currentUser) {
        setHistoryBookings([]);
        setHistoryHasMore(false);
        return;
      }

      const constraints = [];
      if (currentUser.role === 'user') {
        if (currentUser.uid && currentUser.uid !== 'admin') {
          constraints.push(where('userUid', '==', currentUser.uid));
        } else {
          constraints.push(where('userEmail', '==', currentUser.email));
        }
      } else if (currentUser.role === 'owner') {
        if (ownerFieldQueryIds.length === 0) {
          setHistoryBookings([]);
          setHistoryHasMore(false);
          return;
        }
        constraints.push(where('fieldId', 'in', ownerFieldQueryIds));
      }
      if (historyDate) constraints.push(where('date', '==', historyDate));

      const cursor = historyPage > 0 ? historyCursorStack[historyPage - 1] : null;
      const orderedConstraints = [...constraints, orderBy('createdAtTime', 'desc')];
      if (cursor) orderedConstraints.push(startAfter(cursor));
      orderedConstraints.push(limit(HISTORY_PAGE_SIZE));

      setHistoryLoading(true);
      try {
        let snapshot;
        let usedLegacyUserFilter = false;

        try {
          snapshot = await getDocs(query(collection(db, 'bookings'), ...orderedConstraints));
          // Some older bookings were written with userName but without the exact
          // userEmail value used by the current login record. Keep User History
          // compatible with those records without changing the Owner query.
          if (currentUser.role === 'user' && snapshot.empty && currentUser.name) {
            const legacyUserConstraints = [where('userName', '==', currentUser.name)];
            if (historyDate) legacyUserConstraints.push(where('date', '==', historyDate));
            legacyUserConstraints.push(limit(HISTORY_PAGE_SIZE));
            const legacyUserSnapshot = await getDocs(query(
              collection(db, 'bookings'),
              ...legacyUserConstraints
            ));
            if (!legacyUserSnapshot.empty) {
              snapshot = legacyUserSnapshot;
              usedLegacyUserFilter = true;
            }
          }
        } catch (primaryError) {
          // A missing composite index or a legacy booking without createdAtTime must not
          // make the History page look empty. Retry with equality filters only. Keep the
          // fallback bounded so a large Owner collection cannot create an unbounded read.
          console.warn('Ordered history query failed; using compatibility fallback.', primaryError);
          const fallbackConstraints = [...constraints, limit(HISTORY_PAGE_SIZE)];
          let fallbackSnapshot = await getDocs(query(collection(db, 'bookings'), ...fallbackConstraints));
          if (fallbackSnapshot.empty && currentUser.role === 'user' && currentUser.name) {
            const legacyUserConstraints = [where('userName', '==', currentUser.name)];
            if (historyDate) legacyUserConstraints.push(where('date', '==', historyDate));
            legacyUserConstraints.push(limit(HISTORY_PAGE_SIZE));
            fallbackSnapshot = await getDocs(query(
              collection(db, 'bookings'),
              ...legacyUserConstraints
            ));
          }
          const fallbackRecords = sortBookingRecords(dedupeBookingRecords(
            fallbackSnapshot.docs.map(d => ({ id: d.id, ...d.data() }))
          ));
          if (cancelled || requestId !== historyRequestRef.current) return;
          setHistoryBookings(fallbackRecords);
          setHistoryHasMore(false);
          setHistoryCursorStack([]);
          return;
        }

        if (cancelled || requestId !== historyRequestRef.current) return;

        const records = sortBookingRecords(dedupeBookingRecords(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))));
        setHistoryBookings(records);
        setHistoryHasMore(!usedLegacyUserFilter && snapshot.docs.length === HISTORY_PAGE_SIZE);
        if (!usedLegacyUserFilter && snapshot.docs.length > 0) {
          setHistoryCursorStack((previous) => {
            const next = [...previous];
            next[historyPage] = snapshot.docs[snapshot.docs.length - 1];
            return next;
          });
        }
      } catch (error) {
        if (!cancelled && requestId === historyRequestRef.current) {
          console.error('History query error:', error);
          setHistoryBookings([]);
          setHistoryHasMore(false);
        }
      } finally {
        if (!cancelled && requestId === historyRequestRef.current) setHistoryLoading(false);
      }
    };

    loadHistoryPage();
    return () => { cancelled = true; };
  }, [currentUser?.role, currentUser?.email, historyDate, historyPage, historyRefreshToken, ownerFieldQueryIds.join('|')]);

  useEffect(() => {
    const loadReport = async () => {
      const isAdminReport = currentUser?.role === 'admin' && adminTab === 'report';
      const isOwnerReport = currentUser?.role === 'owner' && ownerActiveTab === 'report';
      if (!isAdminReport && !isOwnerReport) {
        setReportBookings([]);
        return;
      }
      const reportDate = isAdminReport ? adminReportDate : ownerReportDate;
      if (!reportDate || (isOwnerReport && ownerFieldQueryIds.length === 0)) {
        setReportBookings([]);
        return;
      }

      const constraints = [where('date', '==', reportDate)];
      if (isOwnerReport) constraints.push(where('fieldId', 'in', ownerFieldQueryIds));
      try {
        const snapshot = await getDocs(query(collection(db, 'bookings'), ...constraints));
        setReportBookings(dedupeBookingRecords(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))));
      } catch (error) {
        console.error('Report query error:', error);
        setReportBookings([]);
      }
    };
    loadReport();
  }, [currentUser?.role, adminTab, ownerActiveTab, adminReportDate, ownerReportDate, ownerFieldQueryIds.join('|')]);

    const saveRememberedLogin = () => {
    try {
      if (rememberLogin) {
        localStorage.setItem(REMEMBERED_LOGIN_STORAGE_KEY, JSON.stringify({
          email: email.trim(),
          password
        }));
      } else {
        localStorage.removeItem(REMEMBERED_LOGIN_STORAGE_KEY);
      }
    } catch (error) {
      console.warn('Unable to save remembered login on this device.', error);
    }
  };

  const clearRememberedLogin = () => {
    try {
      localStorage.removeItem(REMEMBERED_LOGIN_STORAGE_KEY);
    } catch (error) {
      console.warn('Unable to clear remembered login on this device.', error);
    }
  };

  const restoreRememberedLogin = () => {
    const remembered = readRememberedLogin();
    setEmail(remembered.email);
    setPassword(remembered.password);
    setRememberLogin(remembered.remember);
  };

  const updateRememberedPassword = (nextPassword) => {
    if (!rememberLogin || !nextPassword) return;
    try {
      const remembered = readRememberedLogin();
      const identifier = remembered.email || currentUser?.email || '';
      if (identifier) {
        localStorage.setItem(REMEMBERED_LOGIN_STORAGE_KEY, JSON.stringify({
          email: identifier,
          password: nextPassword
        }));
      }
    } catch (error) {
      console.warn('Unable to update remembered password on this device.', error);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    const rawInput = email.trim();
    let loginEmail = rawInput.toLowerCase();

    // Resolve username or owner name to email if needed
    if (!loginEmail.includes('@')) {
      if (loginEmail === 'admin') {
        loginEmail = 'admin@gmail.com';
      } else {
        const matchedUser = usersList.find(u => u.name.toLowerCase() === loginEmail);
        if (matchedUser) {
          loginEmail = matchedUser.email;
        } else {
          const matchedField = fields.find(f => f.name.toLowerCase() === loginEmail || (f.ownerEmail && f.ownerEmail.split('@')[0].toLowerCase() === loginEmail));
          if (matchedField) {
            loginEmail = matchedField.ownerEmail;
          } else {
            loginEmail = `${loginEmail}_user@gmail.com`;
          }
        }
      }
    }

    try {
      await signInWithEmailAndPassword(auth, loginEmail, password);
      saveRememberedLogin();
      setActiveTab('fields');
      setEmail('');
      setPassword('');
    } catch (error) {
      console.error("Login error code:", error.code, "message:", error.message);
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
        alert('အကောင့် သို့မဟုတ် Password မှားယွင်းနေပါသည်။ Firebase တွင် ဤအကောင့်ရှိမရှိ သေချာစစ်ဆေးပါ။');
      } else if (error.code === 'auth/invalid-email') {
        alert('အီးမေးလ် ပုံစံ မှားယွင်းနေပါသည်။');
      } else {
        alert(`Login ဝင်၍မရပါ: ${error.message}`);
      }
    }
