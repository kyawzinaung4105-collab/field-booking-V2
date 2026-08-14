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

  const [activeTab, setActiveTab] = useState(() => {
    return sessionStorage.getItem('activeTab') || 'fields';
  }); 

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

  const [adminTab, setAdminTab] = useState('pending');
  const [ownerActiveTab, setOwnerActiveTab] = useState('pending');
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
  }, [activeTab]);

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

    const unsubUsers = onSnapshot(collection(db, "users"), (snapshot) => {
      if (!snapshot.empty) {
        setUsersList(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      }
    });

    const unsubFields = onSnapshot(collection(db, "fields"), (snapshot) => {
      if (!snapshot.empty) {
        setFields(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      } else {
        defaultFields.forEach(async (f) => {
          await setDoc(doc(db, "fields", f.id), f);
        });
      }
    });

    const recentNotificationsQuery = query(
      collection(db, 'notifications'),
      orderBy('createdAtTime', 'desc'),
      limit(500)
    );
    const unsubNoti = onSnapshot(recentNotificationsQuery, (snapshot) => {
      const rawNotis = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      // Hide exact legacy duplicate notifications in the UI.
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
        if (notification.createdAt?.toMillis) {
          return notification.createdAt.toMillis();
        }
        if (notification.createdAt?.seconds) {
          return notification.createdAt.seconds * 1000;
        }
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
  }, []);

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
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    if (!signupName || !signupPassword) {
      alert('အချက်အလက်များကို အပြည့်အစုံ ဖြည့်စွက်ပါ။');
      return;
    }

    const nameRegex = /^[A-Za-z0-9]+$/;
    if (!nameRegex.test(signupName.trim())) {
      alert('Username တွင် အင်္ဂလိပ်စာလုံးနှင့် ဂဏန်းများသာ အသုံးပြုနိုင်ပါသည်။');
      return;
    }

    if (signupName.trim().toLowerCase() === 'admin') {
      alert('ဤ Username ဖြင့် အကောင့်အသစ်ဖွင့်၍ မရပါ။');
      return;
    }

    const existing = usersList.find(u => u.name.toLowerCase() === signupName.trim().toLowerCase());
    if (existing) {
      alert('ဤ Username ဖြင့် အကောင့်ရှိနှင့်ပြီးသား ဖြစ်ပါသည်။');
      return;
    }

    const signupEmail = `${signupName.trim().toLowerCase()}_user@gmail.com`;
    const newUserObj = {
      email: signupEmail,
      name: signupName.trim(),
      role: 'user'
    };

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, signupEmail, signupPassword);
      await setDoc(doc(db, "users", userCredential.user.uid), newUserObj);
      setUsersList(prev => [...prev, { id: userCredential.user.uid, ...newUserObj }]);
      alert('အကောင့်ဖွင့်ခြင်း အောင်မြင်ပါသည်။ ကျေးဇူးပြု၍ Login ဝင်ပါ။');
      setAuthMode('login');
      setSignupName('');
      setSignupPassword('');
    } catch (error) {
      console.error("Signup error code:", error.code, "message:", error.message);
      if (error.code === 'auth/email-already-in-use') {
        alert('ဤအကောင့် (Username) ရှိနှင့်ပြီးသား ဖြစ်ပါသည်။');
      } else if (error.code === 'auth/weak-password') {
        alert('Password သည် အနည်းဆုံး ၆ လုံး ရှိရပါမည်။');
      } else {
        alert(`အကောင့်ဖွင့်၍မရပါ: ${error.message}`);
      }
    }
  };

  const [oldPasswordInput, setOldPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');

  const handleChangeMyPassword = async (e) => {
    e.preventDefault();
    const oldPass = oldPasswordInput.trim();
    const newPass = newPasswordInput.trim();

    if (!oldPass || !newPass) {
      alert('ကျေးဇူးပြု၍ Password အဟောင်းနှင့် Password အသစ် နှစ်ခုစလုံးကို ထည့်သွင်းပါ။');
      return;
    }
    if (newPass.length < 6) {
      alert('Password အသစ်သည် အနည်းဆုံး စာလုံးရေ ၆ လုံး ရှိရပါမည်။');
      return;
    }

    try {
      const firebaseUser = auth.currentUser;
      if (!firebaseUser || !firebaseUser.email) {
        alert('လက်ရှိ Login ဝင်ထားသော အသုံးပြုသူကို ရှာမတွေ့ပါ။ ကျေးဇူးပြု၍ Login ပြန်ဝင်ပါ။');
        return;
      }

      // Re-authenticate with old password to verify knowledge of current password
      const credential = EmailAuthProvider.credential(firebaseUser.email, oldPass);
      await reauthenticateWithCredential(firebaseUser, credential);

      // Update password in Firebase Authentication
      await updatePassword(firebaseUser, newPass);

      // Also update remembered credentials if active
      updateRememberedPassword(newPass);

      alert('Password ပြောင်းလဲခြင်း အောင်မြင်ပါသည်။');
      setOldPasswordInput('');
      setNewPasswordInput('');
    } catch (error) {
      console.error('Error changing password:', error);
      if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        alert('Password အဟောင်း မှားယွင်းနေပါသည်။');
      } else {
        alert(`Password ပြောင်းရာတွင် အမှားအယွင်းရှိပါသည်။ (${error.message})`);
      }
    }
  };

  const handleForgotPassword = async () => {
    const emailToReset = currentUser?.email || prompt('ကျေးဇူးပြု၍ သင်၏ အကောင့် Email လိပ်စာကို ထည့်သွင်းပါ:');
    if (!emailToReset) return;

    try {
      await sendPasswordResetEmail(auth, emailToReset.trim());
      alert(`Password Reset Link ကို ${emailToReset} သို့ ပို့စ်ပေးလိုက်ပါပြီ။ သင့် Email Inbox သို့မဟုတ် Spam ထဲတွင် စစ်ဆေးပါ။`);
    } catch (error) {
      console.error('Error sending password reset email:', error);
      alert(`Password Reset ပို့ရာတွင် အမှားအယွင်းရှိပါသည်။ (${error.message})`);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.error("Sign out error:", e);
    }
    restoreRememberedLogin();
    setCurrentUser(null);
    setUserSelectedField(null);
    setSelectedSubField(null);
    setActiveTab('fields');
    sessionStorage.removeItem('currentUser');
    sessionStorage.removeItem('activeTab');
    sessionStorage.removeItem('userSelectedField');
    sessionStorage.removeItem('selectedSubField');
    sessionStorage.removeItem('userCheckDate');
  };

  const format12Hour = (h24) => {
    const period = h24 >= 12 ? 'PM' : 'AM';
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${h12 < 10 ? `0${h12}` : h12}:00 ${period}`;
  };

  const getBookingCustomerName = (booking) => {
    if (booking?.customerName) return booking.customerName;
    const legacyUserName = String(booking?.userName || '').replace(/\s*\[Owner Direct Booked\]\s*$/, '').trim();
    const ownerMatch = legacyUserName.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    return ownerMatch ? ownerMatch[1].trim() || '-' : legacyUserName || '-';
  };

  const getBookingCustomerPhone = (booking) => {
    if (booking?.customerPhone) return booking.customerPhone;
    const legacyUserName = String(booking?.userName || '').replace(/\s*\[Owner Direct Booked\]\s*$/, '').trim();
    const ownerMatch = legacyUserName.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    return ownerMatch ? ownerMatch[2].trim() || '-' : '-';
  };

  const checkIsExpired = (hour) => {
    const today = new Date();
    const selectedDate = new Date(userCheckDate);
    const isPastDate = selectedDate < new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const isToday = selectedDate.toDateString() === today.toDateString();
    return isPastDate || (isToday && hour <= today.getHours());
  };

  // A booking expires when its play date has passed or today's end time has passed.
  // This is shared by Admin/Owner action buttons and the status-change safety guard.
  const isBookingExpired = (booking) => {
    if (!booking?.date) return false;
    const [year, month, day] = String(booking.date).split('-').map(Number);
    if (![year, month, day].every(Number.isFinite)) return false;

    const now = new Date();
    const bookingDay = new Date(year, month - 1, day);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (bookingDay < todayStart) return true;
    if (bookingDay > todayStart) return false;

    let endHour = Number(booking.endHour);
    if (!Number.isFinite(endHour)) {
      const timeRange = booking.fullTimeSlot || booking.timeSlot || '';
      const endPart = String(timeRange).split(/\s*-\s*/).pop() || '';
      const match = endPart.match(/(\d{1,2}):\d{2}\s*(AM|PM)/i);
      if (match) {
        endHour = Number(match[1]) % 12 + (match[2].toUpperCase() === 'PM' ? 12 : 0);
      }
    }
    return Number.isFinite(endHour) && endHour <= now.getHours();
  };

  const getConflictingBooking = (startHour, endHour) => {
    return bookings.find(b => {
      if (b.subFieldId !== selectedSubField?.id || b.date !== userCheckDate) return false;
      if (b.status !== 'Approved' && b.status !== 'Pending') return false;

      const existingStart = Number(b.startHour);
      const existingEnd = Number(b.endHour);
      if (!Number.isFinite(existingStart) || !Number.isFinite(existingEnd)) return false;

      return Number(startHour) < existingEnd && Number(endHour) > existingStart;
    }) || null;
  };

  const isSlotUnavailable = (hour) => {
    if (checkIsExpired(hour)) return true;
    return Boolean(getConflictingBooking(hour, hour + 1));
  };

  const getSlotStatusType = (hour) => {
    if (checkIsExpired(hour)) return 'expired';

    const booking = getConflictingBooking(hour, hour + 1);
    if (booking?.status === 'Approved') return 'booked';
    if (booking?.status === 'Pending') return 'pending';

    return 'available';
  };

  const calculatedDuration = selectedStartSlot !== '' && selectedEndSlot !== '' 
    ? parseInt(selectedEndSlot) - parseInt(selectedStartSlot) 
    : 0;

  const calculatedTotalPrice = selectedSubField && calculatedDuration > 0 
    ? calculatedDuration * selectedSubField.price 
    : 0;
  const paymentPlanPercent = paymentPlan === '50' ? 50 : 100;
  const calculatedPayableAmount = calculatedTotalPrice > 0
    ? Math.round(calculatedTotalPrice * paymentPlanPercent / 100)
    : 0;
  const getBookingPaymentPlanPercent = (booking) => {
    const rawPlan = booking?.paymentPercent ?? booking?.paymentPlan;
    return String(rawPlan || '').startsWith('50') || Number(rawPlan) === 50 ? 50 : 100;
  };
  const getBookingPayableAmount = (booking) => {
    const total = Number(booking?.totalPrice || 0);
    return total > 0 ? Math.round(total * getBookingPaymentPlanPercent(booking) / 100) : 0;
  };

  const handleBookingSubmit = async (e) => {
    e.preventDefault();

    if (!selectedSubField || selectedSubField.status !== 'Active') {
      alert('ဤကွင်းခွဲမှာ လက်ရှိ ပိတ်ထားပါသဖြင့် Booking တင်၍ မရပါ။');
      return;
    }

    if (currentUser.role === 'owner') {
      if (
        selectedStartSlot === '' ||
        selectedEndSlot === '' ||
        !selectedPaymentMethod ||
        !ownerCustomerName ||
        !ownerCustomerPhone
      ) {
        alert('ကျေးဇူးပြု၍ လိုအပ်သော အချက်အလက်များ အားလုံးဖြည့်စွက်ပါ။');
        return;
      }
    } else {
      const isCashPayment = selectedPaymentMethod === 'Cash';
      if (
        selectedStartSlot === '' ||
        selectedEndSlot === '' ||
        !selectedPaymentMethod ||
        !customerName.trim() ||
        !customerPhone.trim()
      ) {
        alert('ကျေးဇူးပြု၍ လိုအပ်သော အချက်အလက်များ အားလုံးဖြည့်စွက်ပါ။');
        return;
      }

      if (!isCashPayment && (!transactionLast5 || !paymentScreenshot)) {
        alert('KPay သို့မဟုတ် Wave ရွေးချယ်ထားပါက Transaction နောက်ဆုံး ၅ လုံးနှင့် Screenshot နှစ်ခုလုံး ထည့်ပါ။');
        return;
      }

      if (!isCashPayment && transactionLast5.length !== 5) {
        alert('Transaction နံပါတ် နောက်ဆုံး ၅ လုံးတိတိ ထည့်ပါ။');
        return;
      }
    }

    let paymentScreenshotDataUrl = null;
    if (currentUser.role !== 'owner' && selectedPaymentMethod !== 'Cash') {
      try {
        paymentScreenshotDataUrl = await preparePaymentScreenshot(paymentScreenshot);
      } catch (error) {
        if (error.message === 'PAYMENT_SCREENSHOT_TOO_LARGE') {
          alert('Screenshot ဖိုင်အရွယ်အစား ကြီးလွန်းပါသည်။ ပိုမိုသေးငယ်သော Screenshot တစ်ခုကို ရွေးပါ။');
        } else if (error.message === 'PAYMENT_SCREENSHOT_MUST_BE_IMAGE') {
          alert('ကျေးဇူးပြု၍ Image Screenshot ဖိုင်ကိုသာ ရွေးချယ်ပါ။');
        } else {
          alert('Screenshot ဖတ်၍ မရပါ။ ထပ်မံရွေးချယ်ပြီး ကြိုးစားပါ။');
        }
        return;
      }
    }

    const startH = parseInt(selectedStartSlot);
    const endH = parseInt(selectedEndSlot);

    if (startH >= endH) {
      alert('ပြီးဆုံးမည့်အချိန်သည် စတင်မည့်အချိန်ထက် နောက်ကျရပါမည်။');
      return;
    }

    const expiredHour = Array.from({ length: endH - startH }, (_, index) => startH + index)
      .find(hour => checkIsExpired(hour));
    if (expiredHour !== undefined) {
      alert(`ရွေးထားသော ${format12Hour(startH)} - ${format12Hour(endH)} အချိန်ထဲမှာ ${format12Hour(expiredHour)} နောက်ပိုင်းအချိန် ကျော်လွန်နေပါသည်။ အခြားရက် သို့မဟုတ် အချိန်ကို ရွေးချယ်ပါ။`);
      return;
    }

    const conflictingBooking = getConflictingBooking(startH, endH);
    if (conflictingBooking) {
      const conflictRange = conflictingBooking.fullTimeSlot || conflictingBooking.timeSlot || 'ရွေးချယ်ထားသော အချိန်';
      alert(`ဤအချိန်မှာ Booking ရှိပြီးသားဖြစ်ပါသည်။\n\n${conflictRange} (${conflictingBooking.status})\n\nအခြားအချိန်ကို ရွေးချယ်ပေးပါ။`);
      return;
    }

    const totalDurationHours = endH - startH;
    const overallTimeSlotText = `${format12Hour(startH)} - ${format12Hour(endH)}`;
    const totalPrice = totalDurationHours * selectedSubField.price;

    const now = new Date();
    const bookedTimeFormatted = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const timestampMillis = Date.now();
    const targetFieldObj = fields.find(f => f.id === userSelectedField.id);

    try {
      const result = await runTransaction(db, async (transaction) => {
        // The UI preflight catches existing legacy documents. The transaction below
        // is the authoritative high-volume guard: every occupied hour is claimed by
        // a deterministic lock document, so concurrent different-range bookings
        // cannot pass the same availability check.
        const slotLockRefs = Array.from({ length: endH - startH }, (_, index) => doc(
          db,
          'bookingSlotLocks',
          getBookingSlotLockId(userSelectedField.id, selectedSubField.id, userCheckDate, startH + index)
        ));
        const slotLockSnapshots = [];
        for (const slotLockRef of slotLockRefs) {
          slotLockSnapshots.push(await transaction.get(slotLockRef));
        }
        if (slotLockSnapshots.some((slotLockSnap) => {
          const lockStatus = slotLockSnap.exists() ? slotLockSnap.data()?.status : '';
          return lockStatus === 'Pending' || lockStatus === 'Approved';
        })) {
          throw new Error('SLOT_ALREADY_BOOKED');
        }

        // Deterministic ID prevents the same exact booking from being created twice.
        const bookingKey = [
          userSelectedField.id,
          selectedSubField.id,
          userCheckDate,
          startH,
          endH
        ].join('_').replace(/[^A-Za-z0-9_-]/g, '-');
        const newBookingRef = doc(db, "bookings", `booking_${bookingKey}`);

        const existingExactSnap = await transaction.get(newBookingRef);
        if (existingExactSnap.exists()) {
          throw new Error('SLOT_ALREADY_BOOKED');
        }

        const newBookingObj = {
          fieldId: userSelectedField.id,
          subFieldId: selectedSubField.id,
          subFieldName: selectedSubField.name,
          date: userCheckDate,
          startHour: startH,
          endHour: endH,
          timeSlot: overallTimeSlotText,
          fullTimeSlot: overallTimeSlotText,
          duration: `${totalDurationHours} Hr`,
          totalPrice: totalPrice,
          paymentPlan: `${paymentPlanPercent}%`,
          paymentPercent: paymentPlanPercent,
          payableAmount: Math.round(totalPrice * paymentPlanPercent / 100),
          bookedAt: bookedTimeFormatted,
          createdAtTime: timestampMillis,
          userEmail: currentUser.email,
          userUid: currentUser.uid || auth.currentUser?.uid || 'admin',
          creatorUid: currentUser.uid || auth.currentUser?.uid || 'admin',
          customerName: currentUser.role === 'owner' ? ownerCustomerName.trim() : customerName.trim(),
          customerPhone: currentUser.role === 'owner' ? ownerCustomerPhone.trim() : customerPhone.trim(),
          userName: currentUser.role === 'owner' ? `${ownerCustomerName.trim()} (${ownerCustomerPhone.trim()}) [Owner Direct Booked]` : currentUser.name,
          paymentMethod: selectedPaymentMethod,
          transactionLast5: currentUser.role === 'owner' ? 'OWNER' : selectedPaymentMethod === 'Cash' ? 'CASH' : transactionLast5,
          screenshotName: currentUser.role === 'owner' ? 'Direct Manual Booking' : selectedPaymentMethod === 'Cash' ? 'Cash payment - no screenshot' : paymentScreenshot?.name,
          ...(currentUser.role === 'owner' || selectedPaymentMethod === 'Cash' ? {} : { paymentScreenshot: paymentScreenshotDataUrl }),
          status: currentUser.role === 'owner' ? 'Approved' : 'Pending',
          bookedBy: currentUser.role === 'owner' ? 'Owner' : 'User'
        };

        transaction.set(newBookingRef, newBookingObj);
        slotLockRefs.forEach((slotLockRef) => {
          transaction.set(slotLockRef, {
            bookingId: newBookingRef.id,
            fieldId: userSelectedField.id,
            subFieldId: selectedSubField.id,
            date: userCheckDate,
            status: newBookingObj.status,
            updatedAtTime: timestampMillis
          }, { merge: true });
        });
        return {
          id: newBookingRef.id,
          ...newBookingObj
        };
      });

      setBookings(prev => [result, ...prev]);
      setHistoryRefreshToken(prev => prev + 1);

      if (currentUser.role === 'owner') {
        await triggerSmsNotification(
          `🔔 [Direct Booking] Owner မှ ${targetFieldObj?.name} (${selectedSubField.name}) အတွက် Direct Booking တင်ပြီးပါပြီ။`,
          'booking',
          'new_booking',
          userSelectedField.id,
          result.id
        );
        alert('Owner ၏ Manual Booking တင်ခြင်း အောင်မြင်ပြီး အတည်ပြုပြီးသား ဖြစ်သွားပါပြီ။');
        setOwnerCustomerName('');
        setOwnerCustomerPhone('');
        setActiveTab('owner_manage');
      } else {
        await triggerSmsNotification(
          `🔔 [New Booking] ${currentUser.name} ထံမှ ${targetFieldObj?.name} (${selectedSubField.name}) အတွက် Booking အသစ် ဝင်ရောက်လာပါသည်။`,
          'booking',
          'new_booking',
          userSelectedField.id,
          result.id
        );
        alert('Booking တင်ခြင်း အောင်မြင်ပါသည်။ Owner အတည်ပြုရန် စောင့်ဆိုင်းပါ။');
        setActiveTab('history');
      }

      setSelectedStartSlot('');
      setSelectedEndSlot('');
      setSelectedPaymentMethod('');
      setPaymentPlan('100');
      setPaymentScreenshot(null);
      setTransactionLast5('');
      setCustomerName('');
      setCustomerPhone('');

    } catch (error) {
      if (error.message === 'SLOT_ALREADY_BOOKED') {
        alert('⚠️ ဒီအချိန်ကို အခြား User တစ်ယောက်က Booking တင်ပြီးပါပြီ။\n\nအခြားအချိန်ကို ရွေးချယ်ပေးပါ။');
        return;
      }

      console.error("Error saving booking:", error);
      alert(`Booking သိမ်းဆည်းရာတွင် အမှားအယွင်းရှိပါသည်။\n\nError: ${error.message || error.code || JSON.stringify(error)}`);
    }
  };

  // Both Owner and Admin use this exact Firestore subFields schema. The fields
  // collection listener is the shared source of truth for every role.
  const normalizeFieldSubFields = (items, fallbackOpenHour = 8, fallbackCloseHour = 22) => {
    const source = Array.isArray(items) ? items : [];
    return source.map((sf, index) => ({
      id: String(sf?.id || `sf_${Date.now()}_${index}`),
      name: String(sf?.name || 'ကွင်းခွဲ'),
      price: Number.isFinite(Number(sf?.price)) ? Number(sf.price) : 0,
      openHour: Number.isFinite(Number(sf?.openHour)) ? Number(sf.openHour) : Number(fallbackOpenHour),
      closeHour: Number.isFinite(Number(sf?.closeHour)) ? Number(sf.closeHour) : Number(fallbackCloseHour),
      status: String(sf?.status || 'Active')
    }));
  };

  const applyFieldUpdateToLocalState = (fieldId, updatedData) => {
    setFields(prev => prev.map(field => (
      field.id === fieldId ? { ...field, ...updatedData } : field
    )));
  };

  const handleAddOwnerSubField = () => {
    if (!newSubFieldName || !newSubFieldPrice) {
      alert('ကွင်းခွဲအမည်နှင့် ဈေးနှုန်း ထည့်ပါ။');
      return;
    }
    const subFieldObj = {
      id: 'sf_' + Date.now() + Math.random(),
      name: newSubFieldName,
      price: parseFloat(newSubFieldPrice),
      openHour: parseInt(newSubFieldOpenHour),
      closeHour: parseInt(newSubFieldCloseHour),
      status: newSubFieldStatus
    };
    setOwnerSubFields(prev => [...prev, subFieldObj]);
    setNewSubFieldName('');
    setNewSubFieldPrice('');
    setNewSubFieldOpenHour(8);
    setNewSubFieldCloseHour(22);
  };

  const handleCreateNewField = async (e) => {
    e.preventDefault();
    if (!newFieldName || !newFieldLocation || ownerSubFields.length === 0) {
      alert('ကွင်းအမည်၊ မြို့နယ် နှင့် ကွင်းခွဲ အနည်းဆုံး ၁ ခု ထည့်သွင်းပါ။');
      return;
    }

    const newFieldObj = {
      ownerEmail: newOwnerEmail.trim() || null,
      ownerPassword: newOwnerPassword.trim() || null,
      ownerStatus: newOwnerEmail.trim() ? 'Active' : null,
      name: newFieldName,
      location: newFieldLocation,
      address: newFieldAddress || newFieldLocation,
      phone: newFieldPhone || '09-XXXXXXXXX',
      openHour: parseInt(newFieldOpenHour),
      closeHour: parseInt(newFieldCloseHour),
      city: 'ရန်ကုန်',
      subFields: ownerSubFields,
      paymentInfo: { kpay: newFieldKpay, wave: newFieldWave }
    };

    try {
      await addDoc(collection(db, "fields"), newFieldObj);
      alert('ကွင်းအသစ် သိမ်းဆည်းခြင်း အောင်မြင်ပါသည်။');
      setNewFieldName('');
      setNewFieldLocation('');
      setNewFieldAddress('');
      setNewFieldPhone('');
      setNewOwnerEmail('');
      setNewOwnerPassword('');
      setNewFieldKpay('09-791234567 (KPay)');
      setNewFieldWave('09-421234567 (Wave)');
      setOwnerSubFields([]);
    } catch (error) {
      console.error("Error creating field: ", error);
      alert('ကွင်းအသစ်ထည့်သွင်းရာတွင် အမှားအယွင်းရှိပါသည်။');
    }
  };

  const handleStartEditField = (field) => {
    setEditingFieldId(field.id);
    setEditFieldName(field.name);
    setEditFieldLocation(field.location);
    setEditFieldAddress(field.address || '');
    setEditFieldPhone(field.phone || '');
    setEditFieldOpenHour(field.openHour ?? 8);
    setEditFieldCloseHour(field.closeHour ?? 22);
    setEditFieldKpay(field.paymentInfo?.kpay || '');
    setEditFieldWave(field.paymentInfo?.wave || '');
    setEditSubFields(normalizeFieldSubFields(
      field.subFields,
      field.openHour ?? 8,
      field.closeHour ?? 22
    ));
  };

  const handleSaveEditedField = async () => {
    if (!editingFieldId) return;
    if (!editFieldName || !editFieldLocation || editSubFields.length === 0) {
      alert('ကွင်းအမည်၊ မြို့နယ် နှင့် ကွင်းခွဲ အနည်းဆုံး ၁ ခု ထည့်သွင်းပါ။');
      return;
    }

    const cleanSubFields = normalizeFieldSubFields(
      editSubFields,
      Number(editFieldOpenHour) || 8,
      Number(editFieldCloseHour) || 22
    );

    const updatedData = {
      name: String(editFieldName),
      location: String(editFieldLocation),
      address: String(editFieldAddress || editFieldLocation),
      phone: String(editFieldPhone || '09-XXXXXXXXX'),
      openHour: Number(editFieldOpenHour) || 8,
      closeHour: Number(editFieldCloseHour) || 22,
      subFields: cleanSubFields,
      paymentInfo: {
        kpay: String(editFieldKpay || ''),
        wave: String(editFieldWave || '')
      }
    };

    try {
      await updateDoc(doc(db, "fields", editingFieldId), updatedData);
      applyFieldUpdateToLocalState(editingFieldId, updatedData);

      const originalField = fields.find(f => f.id === editingFieldId) || {};
      const changes = [];
      if (originalField.name !== editFieldName) changes.push(`ကွင်းအမည် (${originalField.name || 'မရှိ'} -> ${editFieldName})`);
      if (originalField.location !== editFieldLocation) changes.push(`မြို့နယ် (${originalField.location || 'မရှိ'} -> ${editFieldLocation})`);
      if ((originalField.address || originalField.location) !== editFieldAddress) changes.push(`လိပ်စာ`);
      if ((originalField.phone || '09-XXXXXXXXX') !== editFieldPhone) changes.push(`ဖုန်းနံပါတ် (${originalField.phone || 'မရှိ'} -> ${editFieldPhone})`);
      if (Number(originalField.openHour ?? 8) !== Number(editFieldOpenHour) || Number(originalField.closeHour ?? 22) !== Number(editFieldCloseHour)) {
        changes.push(`ဖွင့်ပိတ်ချိန် (${originalField.openHour ?? 8}:00 ~ ${originalField.closeHour ?? 22}:00 -> ${editFieldOpenHour}:00 ~ ${editFieldCloseHour}:00)`);
      }
      if ((originalField.paymentInfo?.kpay || '') !== editFieldKpay || (originalField.paymentInfo?.wave || '') !== editFieldWave) {
        changes.push(`ငွေပေးချေမှုအချက်အလက် (KPay/Wave)`);
      }
      const origSubs = originalField.subFields || [];
      if (origSubs.length !== editSubFields.length) {
        changes.push(`ကွင်းခွဲအရေအတွက် (${origSubs.length} ခု -> ${editSubFields.length} ခု)`);
      } else {
        let subChanged = false;
        for (let i = 0; i < origSubs.length; i++) {
          const o = origSubs[i];
          const n = editSubFields[i];
          if (o.name !== n.name || Number(o.price) !== Number(n.price) || o.status !== n.status || Number(o.openHour) !== Number(n.openHour) || Number(o.closeHour) !== Number(n.closeHour)) {
            subChanged = true;
            break;
          }
        }
        if (subChanged) changes.push(`ကွင်းခွဲများ (Sub-fields အချက်အလက် သို့မဟုတ် Status/ဈေးနှုန်း)`);
      }
      const changeText = changes.length > 0 ? changes.join(', ') : 'အထွေထွေအချက်အလက်များ';

      try {
        await triggerSmsNotification(
          `🔔 [Admin Update] Admin မှ (${editFieldName}) တွင် ${changeText} ကို ပြင်ဆင်သွားပါသည်။`,
          'owner_update',
          'admin_field_update',
          editingFieldId
        );
      } catch (notifErr) {
        console.error("Non-fatal admin update notification error:", notifErr);
      }

      alert('ကွင်းအချက်အလက် ပြင်ဆင်မှု အောင်မြင်ပါသည်။');
      setEditingFieldId(null);
    } catch (error) {
      console.error("Error updating field: ", error);
      alert('ကွင်းပြင်ဆင်ရာတွင် အမှားအယွင်းရှိပါသည်။');
    }
  };

  const handleStartEditOwnerField = (field) => {
    setEditingOwnerFieldId(field.id);
    setOwnerEditFieldName(field.name || '');
    setOwnerEditFieldLocation(field.location || '');
    setOwnerEditFieldAddress(field.address || '');
    setOwnerEditFieldPhone(field.phone || '');
    setOwnerEditFieldOpenHour(field.openHour !== undefined ? field.openHour : 8);
    setOwnerEditFieldCloseHour(field.closeHour !== undefined ? field.closeHour : 22);
    setOwnerEditFieldKpay(field.paymentInfo?.kpay || '');
    setOwnerEditFieldWave(field.paymentInfo?.wave || '');
    setOwnerEditFieldStatus(field.ownerStatus || 'Active');
    setOwnerEditSubFields(normalizeFieldSubFields(
      field.subFields,
      field.openHour ?? 8,
      field.closeHour ?? 22
    ));
  };

  const handleSaveOwnerEditedField = async () => {
    if (!editingOwnerFieldId) return;
    if (!ownerEditFieldName || !ownerEditFieldLocation || !ownerEditSubFields || ownerEditSubFields.length === 0) {
      alert('ကွင်းအမည်၊ မြို့နယ် နှင့် ကွင်းခွဲ အနည်းဆုံး ၁ ခု ထည့်သွင်းပါ။');
      return;
    }

    const cleanSubFields = normalizeFieldSubFields(
      ownerEditSubFields,
      Number(ownerEditFieldOpenHour) || 8,
      Number(ownerEditFieldCloseHour) || 22
    );

    const updatedData = {
      name: String(ownerEditFieldName),
      location: String(ownerEditFieldLocation),
      address: String(ownerEditFieldAddress || ownerEditFieldLocation),
      phone: String(ownerEditFieldPhone || '09-XXXXXXXXX'),
      openHour: Number(ownerEditFieldOpenHour) || 8,
      closeHour: Number(ownerEditFieldCloseHour) || 22,
      subFields: cleanSubFields,
      ownerStatus: String(ownerEditFieldStatus || 'Active'),
      paymentInfo: {
        kpay: String(ownerEditFieldKpay || ''),
        wave: String(ownerEditFieldWave || '')
      }
    };

    try {
      await updateDoc(doc(db, "fields", editingOwnerFieldId), updatedData);
      applyFieldUpdateToLocalState(editingOwnerFieldId, updatedData);
      
      const originalOwnerField = fields.find(f => f.id === editingOwnerFieldId) || {};
      const ownerChanges = [];
      if (originalOwnerField.name !== ownerEditFieldName) ownerChanges.push(`ကွင်းအမည် (${originalOwnerField.name || 'မရှိ'} -> ${ownerEditFieldName})`);
      if (originalOwnerField.location !== ownerEditFieldLocation) ownerChanges.push(`မြို့နယ် (${originalOwnerField.location || 'မရှိ'} -> ${ownerEditFieldLocation})`);
      if ((originalOwnerField.address || originalOwnerField.location) !== ownerEditFieldAddress) ownerChanges.push(`လိပ်စာ`);
      if ((originalOwnerField.phone || '09-XXXXXXXXX') !== ownerEditFieldPhone) ownerChanges.push(`ဖုန်းနံပါတ် (${originalOwnerField.phone || 'မရှိ'} -> ${ownerEditFieldPhone})`);
      if (Number(originalOwnerField.openHour ?? 8) !== Number(ownerEditFieldOpenHour) || Number(originalOwnerField.closeHour ?? 22) !== Number(ownerEditFieldCloseHour)) {
        ownerChanges.push(`ဖွင့်ပိတ်ချိန် (${originalOwnerField.openHour ?? 8}:00 ~ ${originalOwnerField.closeHour ?? 22}:00 -> ${ownerEditFieldOpenHour}:00 ~ ${ownerEditFieldCloseHour}:00)`);
      }
      if ((originalOwnerField.paymentInfo?.kpay || '') !== ownerEditFieldKpay || (originalOwnerField.paymentInfo?.wave || '') !== ownerEditFieldWave) {
        ownerChanges.push(`ငွေပေးချေမှုအချက်အလက် (KPay/Wave)`);
      }
      if ((originalOwnerField.ownerStatus || 'Active') !== ownerEditFieldStatus) {
        ownerChanges.push(`ကွင်း Status (${originalOwnerField.ownerStatus || 'Active'} -> ${ownerEditFieldStatus})`);
      }
      const origOwnerSubs = originalOwnerField.subFields || [];
      if (origOwnerSubs.length !== ownerEditSubFields.length) {
        ownerChanges.push(`ကွင်းခွဲအရေအတွက် (${origOwnerSubs.length} ခု -> ${ownerEditSubFields.length} ခု)`);
      } else {
        let subChanged = false;
        for (let i = 0; i < origOwnerSubs.length; i++) {
          const o = origOwnerSubs[i];
          const n = ownerEditSubFields[i];
          if (o.name !== n.name || Number(o.price) !== Number(n.price) || o.status !== n.status || Number(o.openHour) !== Number(n.openHour) || Number(o.closeHour) !== Number(n.closeHour)) {
            subChanged = true;
            break;
          }
        }
        if (subChanged) ownerChanges.push(`ကွင်းခွဲများ (Sub-fields အချက်အလက် သို့မဟုတ် Status/ဈေးနှုန်း)`);
      }
      const ownerChangeText = ownerChanges.length > 0 ? ownerChanges.join(', ') : 'အထွေထွေအချက်အလက်များ';

      try {
        await triggerSmsNotification(
          `🔔 [Owner Update] Owner (${currentUser?.name || ownerEditFieldName}) မှ (${ownerEditFieldName}) တွင် ${ownerChangeText} ကို ပြင်ဆင်သွားပါသည်။`,
          'owner_update',
          'owner_update_info',
          editingOwnerFieldId
        );
      } catch (notifErr) {
        console.error("Non-fatal notification error:", notifErr);
      }

      alert('ကွင်းအချက်အလက် ပြင်ဆင်မှု အောင်မြင်ပါသည်။');
      setEditingOwnerFieldId(null);
    } catch (error) {
      console.error("Error updating owner field: ", error);
      alert('ကွင်းပြင်ဆင်ရာတွင် အမှားအယွင်းရှိပါသည်။ (' + (error.message || error) + ')');
    }
  };

  const handleAdminUpdateOwnerInfo = async (fieldId, newEmail, newPass, newStatus) => {
    try {
      await updateDoc(doc(db, "fields", fieldId), {
        ownerEmail: newEmail,
        ownerPassword: newPass,
        ownerStatus: newStatus
      });
      alert('Owner အချက်အလက်များကို သိမ်းဆည်းပြီးပါပြီ။');
    } catch (error) {
      console.error("Error updating owner info: ", error);
      alert('အချက်အလက် သိမ်းဆည်းရာတွင် အမှားအယွင်းရှိပါသည်။');
    }
  };

  const handleAdminDeleteOwnerField = async (fieldId) => {
    if (window.confirm('ဤ Owner နှင့် ၎င်း၏ကွင်းကို ဖျက်ရန် သေချာပါသလား?')) {
      await deleteDoc(doc(db, "fields", fieldId));
    }
  };

  const handleStatusChangeWithConfirm = async (bookingId, currentStatus, desiredStatus, fieldId) => {
    // Only Admin and the Owner of the selected field may change a booking status.
    // User history is intentionally read-only, even if a handler is triggered manually.
    if (!currentUser || !['admin', 'owner'].includes(currentUser.role)) {
      alert('User account မှ Booking ကို Approve / Reject ပြုလုပ်ခွင့် မရှိပါ။');
      return;
    }
    if (currentUser.role === 'owner' && !ownerFieldQueryIds.includes(fieldId)) {
      alert('မိမိပိုင်သော ကွင်း၏ Booking မဟုတ်သဖြင့် ပြင်ဆင်ခွင့် မရှိပါ။');
      return;
    }

    let confirmMsg = "";
    let subType = '';
    if (currentStatus === 'Approved' && desiredStatus === 'Rejected') {
      confirmMsg = "ဒီ Booking ကို Reject လုပ်မှာ သေချာပါသလား?";
      subType = 'booking_reject';
    } else if (currentStatus === 'Rejected' && desiredStatus === 'Approved') {
      confirmMsg = "ဒီ Booking ကို Approve ပြန်လုပ်မှာ သေချာပါသလား?";
      subType = 'new_booking';
    } else if (currentStatus === 'Pending' && desiredStatus === 'Rejected') {
      confirmMsg = "ဒီ Booking ကို Reject လုပ်မှာ သေချာပါသလား?";
      subType = 'booking_reject';
    } else if (currentStatus === 'Pending' && desiredStatus === 'Approved') {
      confirmMsg = "ဒီ Booking ကို Approve လုပ်မှာ သေချာပါသလား?";
      subType = 'new_booking';
    } else {
      confirmMsg = `Status ကို ${desiredStatus} သို့ ပြောင်းရန် သေချာပါသလား?`;
      subType = desiredStatus === 'Rejected' ? 'booking_reject' : 'new_booking';
    }

    const targetBooking = historyBookings.find(b => b.id === bookingId) || bookings.find(b => b.id === bookingId);
    if (targetBooking && isBookingExpired(targetBooking)) {
      alert('ဤ Booking ၏ ရက်စွဲ သို့မဟုတ် ကစားချိန်သည် ကျော်လွန်သွားပါပြီ။ Approve / Reject လုပ်၍ မရတော့ပါ။');
      return;
    }

    if (window.confirm(confirmMsg)) {
      try {
        const updatedBooking = await runTransaction(db, async (transaction) => {
          const bookingRef = doc(db, 'bookings', bookingId);
          const bookingSnap = await transaction.get(bookingRef);
          if (!bookingSnap.exists()) throw new Error('BOOKING_NOT_FOUND');

          const currentBooking = { id: bookingSnap.id, ...bookingSnap.data() };
          if (isBookingExpired(currentBooking)) throw new Error('BOOKING_EXPIRED');

          const lockRefs = getBookingSlotLockRefs(currentBooking);
          const lockSnapshots = [];
          for (const lockRef of lockRefs) {
            lockSnapshots.push(await transaction.get(lockRef));
          }
          const foreignActiveLock = lockSnapshots.find((lockSnap) => {
            if (!lockSnap.exists()) return false;
            const lockData = lockSnap.data() || {};
            const lockStatus = String(lockData.status || '');
            return lockData.bookingId && lockData.bookingId !== bookingId && (lockStatus === 'Pending' || lockStatus === 'Approved');
          });
          if (foreignActiveLock) throw new Error('SLOT_LOCKED_BY_OTHER');

          transaction.update(bookingRef, {
            status: desiredStatus,
            statusUpdatedAtTime: Date.now()
          });
          lockRefs.forEach((lockRef, index) => {
            const lockData = lockSnapshots[index].exists() ? lockSnapshots[index].data() : {};
            transaction.set(lockRef, {
              ...lockData,
              bookingId,
              fieldId: currentBooking.fieldId,
              subFieldId: currentBooking.subFieldId,
              date: currentBooking.date,
              status: desiredStatus,
              updatedAtTime: Date.now()
            }, { merge: true });
          });

          return { ...currentBooking, status: desiredStatus };
        });

        const targetField = fields.find(f => f.id === updatedBooking.fieldId);
        const bookingFieldName = updatedBooking.subFieldName || targetField?.name || 'Unknown Field';
        const bookingDate = updatedBooking.date || '-';
        const bookingTimeRange = updatedBooking.fullTimeSlot || updatedBooking.timeSlot || '-';
        const bookingUserName = updatedBooking.userName || updatedBooking.userEmail || 'User';
        const bookingSummary = `${bookingFieldName} (${bookingDate} / ${bookingTimeRange}) ${bookingUserName}`;
        let notiMsg = '';
        if (desiredStatus === 'Rejected') {
          notiMsg = `❌ [Booking Reject] ${bookingSummary} ၏ Booking ကို Reject လုပ်လိုက်ပါသည်။`;
        } else if (desiredStatus === 'Pending') {
          notiMsg = `⏳ [Booking Pending] ${bookingSummary} ၏ Booking ကို Pending သို့ ပြောင်းလိုက်ပါသည်။`;
        } else {
          notiMsg = `✅ [Booking Approved] ${bookingSummary} ၏ Booking ကို Approve လုပ်လိုက်ပါသည်။`;
        }
        await triggerSmsNotification(notiMsg, 'booking', subType, fieldId || updatedBooking.fieldId, bookingId);
        setHistoryRefreshToken((value) => value + 1);
      } catch (error) {
        if (error.message === 'BOOKING_EXPIRED') {
          alert('ဤ Booking ၏ ရက်စွဲ သို့မဟုတ် ကစားချိန်သည် ကျော်လွန်သွားပါပြီ။ Approve / Reject လုပ်၍ မရတော့ပါ။');
        } else if (error.message === 'BOOKING_NOT_FOUND') {
          alert('Booking မှတ်တမ်းကို မတွေ့တော့ပါ။ History ကို ပြန်ဖတ်ပြီး ထပ်ကြိုးစားပါ။');
        } else if (error.message === 'SLOT_LOCKED_BY_OTHER') {
          alert('ဤအချိန်ကို အခြား Booking တစ်ခုက ရယူထားပြီးပါပြီ။ History ကို ပြန်ဖတ်ပြီး စစ်ဆေးပါ။');
        } else {
          console.error('Error changing booking status:', error);
          alert('Booking Status ပြောင်းရာတွင် အမှားအယွင်းရှိပါသည်။');
        }
      }
    }
  };

  const activeFieldsForUser = fields.filter(f => {
    const status = f.ownerStatus ? f.ownerStatus.trim().toLowerCase() : '';
    return status !== 'disabled';
  });

  const baseFieldsList = currentUser?.role === 'owner'
    ? activeFieldsForUser.filter(f => (f.ownerEmail === currentUser.email || f.ownerEmail?.toLowerCase() === currentUser.email?.toLowerCase() || f.ownerUid === currentUser.uid || f.ownerId === currentUser.uid))
    : activeFieldsForUser;
    
  const displayedFields = selectedTownship.trim() === '' 
    ? baseFieldsList 
    : baseFieldsList.filter(f => f.location && f.location.toLowerCase().includes(selectedTownship.trim().toLowerCase()));

  const sortedBookings = [...bookings].sort((a, b) => {
    const timeA = a.createdAtTime || (a.bookedAt ? new Date(a.bookedAt).getTime() : 0);
    const timeB = b.createdAtTime || (b.bookedAt ? new Date(b.bookedAt).getTime() : 0);
    if (timeA !== timeB) {
      return timeB - timeA; 
    }
    return String(b.id || '').localeCompare(String(a.id || ''));
  });

  // Keep every notification newest-first at render time as a fallback for
  // existing documents that were loaded before createdAtTime was added.
  const sortedNotifications = [...smsNotifications].sort((a, b) => {
    const getTime = (notification) => {
      if (typeof notification.createdAtTime === 'number' && Number.isFinite(notification.createdAtTime)) {
        return notification.createdAtTime;
      }
      if (notification.createdAt?.toMillis) {
        return notification.createdAt.toMillis();
      }
      if (notification.createdAt?.seconds) {
        return notification.createdAt.seconds * 1000;
      }
      const parsed = new Date(`${notification.date || ''} ${notification.time || ''}`).getTime();
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const timeDifference = getTime(b) - getTime(a);
    return timeDifference !== 0
      ? timeDifference
      : String(b.id || '').localeCompare(String(a.id || ''));
  });

  const getBookingStatusKey = (booking) => String(booking?.status || 'Pending').trim().toLowerCase();
  const getBookingDurationHours = (booking) => {
    const start = Number(booking?.startHour);
    const end = Number(booking?.endHour);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) return end - start;
    const durationMatch = String(booking?.duration || '').match(/[0-9]+(?:\.[0-9]+)?/);
    const duration = durationMatch ? Number(durationMatch[0]) : 0;
    return Number.isFinite(duration) ? duration : 0;
  };
  const getBookingFieldLabel = (booking) => {
    const field = fields.find(f => f.id === booking?.fieldId);
    const parentName = field?.name || booking?.fieldName || 'ကွင်းမသတ်မှတ်ရသေးပါ';
    const subFieldName = booking?.subFieldName || 'ကွင်းခွဲမသတ်မှတ်ရသေးပါ';
    return `${parentName} / ${subFieldName}`;
  };
  const getBookingRevenue = (booking) => {
    const storedAmount = Number(booking?.totalPrice);
    if (Number.isFinite(storedAmount)) return storedAmount;
    const field = fields.find(f => f.id === booking?.fieldId);
    const subField = field?.subFields?.find(sf => sf.id === booking?.subFieldId);
    const hourlyPrice = Number(subField?.price);
    return Number.isFinite(hourlyPrice) ? hourlyPrice * getBookingDurationHours(booking) : 0;
  };
  const getPaymentMethodKey = (booking) => {
    const method = String(booking?.paymentMethod || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
    if (method === 'kpay' || method === 'kpaypayment') return 'kpay';
    if (method === 'wave' || method === 'wavepay') return 'wave';
    if (method === 'cash' || method === 'ငွေသား') return 'cash';
    return 'other';
  };
  const getBookingTimeParts = (booking) => {
    const rawRange = String(booking?.fullTimeSlot || booking?.timeSlot || '').trim();
    const parts = rawRange.split(/\s*-\s*/).filter(Boolean);
    if (parts.length >= 2) return { start: parts[0], end: parts[1] };
    const startHour = Number(booking?.startHour);
    const endHour = Number(booking?.endHour);
    return {
      start: Number.isFinite(startHour) ? format12Hour(startHour) : (parts[0] || '-'),
      end: Number.isFinite(endHour) ? format12Hour(endHour) : '-'
    };
  };

  const createHistoryExportRows = (historyBookings) => historyBookings.map((booking) => {
    const timeParts = getBookingTimeParts(booking);
    return {
      Name: getBookingCustomerName(booking),
      'Ph No': getBookingCustomerPhone(booking),
      'Field / Sub-Field': getBookingFieldLabel(booking),
      Date: booking?.date || '-',
      'Start Time': timeParts.start,
      'End Time': timeParts.end,
      Duration: booking?.duration || `${getBookingDurationHours(booking)} Hr`,
      'Booked At': booking?.bookedAt || '-',
      'Payment Method': booking?.paymentMethod || '-',
      'Payment Plan': `${getBookingPaymentPlanPercent(booking)}%`,
      Transaction: booking?.transactionLast5 || '-',
      Amount: getBookingRevenue(booking),
      'Payable Amount': getBookingPayableAmount(booking),
      Status: booking?.status || 'Pending'
    };
  });

  const escapeExportHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const escapeCsvValue = (value) => {
    const normalized = String(value ?? '').replace(/\r?\n/g, ' ');
    return /[\",]/.test(normalized) ? `\"${normalized.replace(/\"/g, '\"\"')}\"` : normalized;
  };

  const downloadHistoryExcel = (historyBookings, scopeLabel) => {
    const rows = createHistoryExportRows(historyBookings);
    if (!rows.length) {
      alert('Export လုပ်ရန် Booking မှတ်တမ်း မရှိသေးပါ။');
      return;
    }
    const headers = Object.keys(rows[0]);
    const csv = [
      headers,
      ...rows.map(row => headers.map(header => header === 'Amount' ? Number(row[header] || 0) : row[header]))
    ].map(row => row.map(escapeCsvValue).join(',')).join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const dateLabel = new Date().toISOString().slice(0, 10);
    anchor.href = url;
    anchor.download = `booking-history-${scopeLabel}-${dateLabel}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const printBookingHistory = (historyBookings, scopeLabel) => {
    const rows = createHistoryExportRows(historyBookings);
    if (!rows.length) {
      alert('Print ထုတ်ရန် Booking မှတ်တမ်း မရှိသေးပါ။');
      return;
    }
    const headers = Object.keys(rows[0]);
    const tableHead = headers.map(header => `<th>${escapeExportHtml(header)}</th>`).join('');
    const tableBody = rows.map(row => `<tr>${headers.map(header => `<td>${escapeExportHtml(header === 'Amount' ? `${Number(row[header] || 0).toLocaleString()} ကျပ်` : row[header])}</td>`).join('')}</tr>`).join('');
    const printFrame = document.createElement('iframe');
    printFrame.setAttribute('aria-hidden', 'true');
    printFrame.style.position = 'fixed';
    printFrame.style.right = '0';
    printFrame.style.bottom = '0';
    printFrame.style.width = '1px';
    printFrame.style.height = '1px';
    printFrame.style.border = '0';
    printFrame.onload = () => {
      const printWindow = printFrame.contentWindow;
      printWindow.focus();
      printWindow.print();
      setTimeout(() => printFrame.remove(), 800);
    };
    printFrame.srcdoc = `<!doctype html><html><head><meta charset="UTF-8"><title>${escapeExportHtml(scopeLabel)} Booking History</title><style>
      @page { size: landscape; margin: 12mm; }
      * { box-sizing: border-box; }
      body { font-family: Arial, "Noto Sans Myanmar", sans-serif; color: #1f2937; margin: 0; }
      h1 { font-size: 18px; margin: 0 0 4px; }
      p { font-size: 11px; color: #6b7280; margin: 0 0 14px; }
      table { width: 100%; border-collapse: collapse; font-size: 9px; }
      th { background: #e5e7eb; font-weight: 700; text-align: left; }
      th, td { border: 1px solid #cbd5e1; padding: 5px; vertical-align: top; }
      tr { page-break-inside: avoid; }
    </style></head><body><h1>${escapeExportHtml(scopeLabel)} Booking History</h1><p>Printed: ${escapeExportHtml(new Date().toLocaleString())}</p><table><thead><tr>${tableHead}</tr></thead><tbody>${tableBody}</tbody></table></body></html>`;
    document.body.appendChild(printFrame);
  };

  const createReportData = (reportBookings) => {
    const statusCounts = reportBookings.reduce((counts, booking) => {
      const key = getBookingStatusKey(booking);
      if (key === 'approved') counts.approved += 1;
      else if (key === 'rejected') counts.rejected += 1;
      else counts.pending += 1;
      return counts;
    }, { pending: 0, approved: 0, rejected: 0 });

    const approvedBookings = reportBookings.filter(booking => getBookingStatusKey(booking) === 'approved');
    const approvedHours = approvedBookings.reduce((sum, booking) => sum + getBookingDurationHours(booking), 0);
    const paymentRevenue = approvedBookings.reduce((totals, booking) => {
      const amount = getBookingRevenue(booking);
      const methodKey = getPaymentMethodKey(booking);
      totals.total += amount;
      if (methodKey === 'kpay') totals.kpay += amount;
      else if (methodKey === 'cash') totals.cash += amount;
      else if (methodKey === 'wave') totals.wave += amount;
      else totals.other += amount;
      return totals;
    }, { kpay: 0, cash: 0, wave: 0, other: 0, total: 0 });
    const revenue = paymentRevenue.total;

    const fieldMap = new Map();
    reportBookings.forEach(booking => {
      const key = `${booking?.fieldId || 'unknown'}|${booking?.subFieldId || booking?.subFieldName || 'unknown'}`;
      const statusKey = getBookingStatusKey(booking);
      const existing = fieldMap.get(key) || {
        key,
        label: getBookingFieldLabel(booking),
        pending: 0,
        approved: 0,
        rejected: 0,
        approvedHours: 0,
        revenue: 0
      };
      if (statusKey === 'approved') {
        existing.approved += 1;
        existing.approvedHours += getBookingDurationHours(booking);
        existing.revenue += getBookingRevenue(booking);
      } else if (statusKey === 'rejected') {
        existing.rejected += 1;
      } else {
        existing.pending += 1;
      }
      fieldMap.set(key, existing);
    });

    return {
      total: reportBookings.length,
      statusCounts,
      approvedHours,
      revenue,
      paymentRevenue,
      fieldBreakdown: [...fieldMap.values()].sort((a, b) => a.label.localeCompare(b.label))
    };
  };

  // Reports and history are populated by server-side bounded queries above.
  // `sortedBookings` remains the small real-time availability dataset only.
  const adminReportBookings = currentUser?.role === 'admin' ? reportBookings : [];
  const ownerReportBookings = currentUser?.role === 'owner' ? reportBookings : [];
  const adminReport = createReportData(adminReportBookings);
  const ownerReport = createReportData(ownerReportBookings);
  const adminHistoryBookings = currentUser?.role === 'admin' ? historyBookings : [];
  const ownerHistoryBookings = currentUser?.role === 'owner' ? historyBookings : [];
  const userHistoryBookings = currentUser?.role === 'user' ? historyBookings : [];

  if (!currentUser) {
    return (
      <div className="field-auth-shell min-h-screen bg-slate-950 flex items-center justify-center p-4 font-sans">
        <div className="field-auth-card bg-white rounded-[1.35rem] shadow-2xl max-w-md w-full p-6 sm:p-8 ring-1 ring-white/10">
          <div className="text-center mb-6">
            <span className="text-3xl">⚽</span>
            <h1 className="text-2xl font-bold text-gray-800 mt-1">Field Booking App</h1>
          </div>

          <div className="flex bg-gray-100 p-1 rounded-xl mb-6">
            <button 
              type="button" 
              onClick={() => setAuthMode('login')} 
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${authMode === 'login' ? 'bg-white text-[#ff4f70] shadow-sm' : 'text-gray-500'}`}
            >
              Login ဝင်ရန်
            </button>
            <button 
              type="button" 
              onClick={() => setAuthMode('signup')} 
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${authMode === 'signup' ? 'bg-white text-[#ff4f70] shadow-sm' : 'text-gray-500'}`}
            >
              Sign Up (အကောင့်သစ်ဖွင့်ရန်)
            </button>
          </div>

          {authMode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Username သို့မဟုတ် Admin Email</label>
                <input 
                  type="text" 
                  placeholder="admin@gmail.com သို့မဟုတ် ကိုယ့် Username" 
                  autoComplete="username"
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)} 
                  className="w-full border rounded-lg p-2.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:border-emerald-600" 
                  required 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Password</label>
                <input 
                  type="password" 
                  placeholder="••••••" 
                  autoComplete="current-password"
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  className="w-full border rounded-lg p-2.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:border-emerald-600" 
                  required 
                />
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-gray-600 select-none">
                <input
                  type="checkbox"
                  checked={rememberLogin}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setRememberLogin(checked);
                    if (!checked) clearRememberedLogin();
                  }}
                  className="h-4 w-4 rounded border-gray-300 text-emerald-600 accent-emerald-600 focus:ring-emerald-500"
                />
                <span>Remember me (ဒီစက်မှာ မှတ်ထားမည်)</span>
              </label>
              <button type="submit" className="w-full bg-emerald-600 text-white py-2.5 rounded-lg text-sm font-bold shadow hover:bg-emerald-700 transition-colors">Login ဝင်မည်</button>
            </form>
          ) : (
            <form onSubmit={handleSignup} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Username (အင်္ဂလိပ်စာလုံးနှင့် ဂဏန်းများသာ)</label>
                <input 
                  type="text" 
                  placeholder="ဥပမာ - myname123" 
                  value={signupName} 
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^A-Za-z0-9]/g, '');
                    setSignupName(val);
                  }} 
                  className="w-full border rounded-lg p-2.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:border-emerald-600" 
                  required 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Password (ဂဏန်းသီးသန့်)</label>
                <input 
                  type="password" 
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="ဂဏန်းများသာ (ဥပမာ - 123456)" 
                  value={signupPassword} 
                  onChange={(e) => {
                    const numericValue = e.target.value.replace(/[^0-9]/g, '');
                    setSignupPassword(numericValue);
                  }} 
                  className="w-full border rounded-lg p-2.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:border-emerald-600 font-mono" 
                  required 
                />
              </div>
              <button type="submit" className="w-full bg-emerald-600 text-white py-2.5 rounded-lg text-sm font-bold shadow hover:bg-emerald-700 transition-colors">အကောင့်ဖန်တီးမည် (Sign Up)</button>
            </form>
          )}

          {isMobileDevice && !isAppInstalled && (
            <div className="mt-6 border-t border-gray-100 pt-5">
              <button
                type="button"
                onClick={handleInstallClick}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-white shadow-md transition-all hover:bg-amber-600 active:scale-[0.98]"
                title="App ကို ဖုန်း Home Screen ပေါ်သို့ ထည့်သွင်းမည်"
              >
                <span aria-hidden="true">📲</span>
                <span>Install App (ဖုန်းထဲထည့်မည်)</span>
              </button>
              <p className="mt-2 text-center text-[11px] leading-relaxed text-gray-500">
                Web link ဖြင့် ဝင်ထားပါက ဒီခလုတ်မှ App ကို Home Screen ပေါ်သို့ ထည့်နိုင်ပါသည်။
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // If forced update is required, block entire app usage with a non-dismissible screen
  if (forceUpdate) {
    return (
      <div className="fixed inset-0 bg-slate-950 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl max-w-md w-full p-8 shadow-2xl border text-center space-y-6 animate-in fade-in zoom-in duration-300">
          <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-3xl font-bold shadow-inner">
            🚀
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-gray-900">ဗားရှင်းအသစ် မဖြစ်မနေ Update လုပ်ရန် လိုအပ်ပါသည် ({latestVersionName})</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              စနစ်တွင် အရေးကြီးသော ပြင်ဆင်ချက်များနှင့် လုပ်ဆောင်ချက်အသစ်များ ပါဝင်လာပါပြီ။ ဆက်လက်အသုံးပြုနိုင်ရန် ကျေးဇူးပြု၍ App အသစ်ကို ဒေါင်းလုဒ်လုပ်ပြီး Update လုပ်ပါ။
            </p>
          </div>
          <div className="pt-2">
            <a
              href={downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 px-4 rounded-xl shadow-lg transition-all text-sm flex items-center justify-center gap-2"
            >
              📥 ယခုပင် Update လုပ်ရန် (Download APK)
            </a>
          </div>
          <p className="text-xs text-gray-400">
            * Update မလုပ်မချင်း အက်ပ်ကို ဆက်လက်အသုံးပြု၍မရပါ။
          </p>
        </div>
      </div>
    );
  }

  // If owner account is disabled by admin, lock entire owner view in real-time with Logout only
  const isOwnerDisabled = currentUser?.role === 'owner' && fields.some(f => 
    (f.ownerEmail === currentUser.email || f.ownerEmail?.toLowerCase() === currentUser.email?.toLowerCase() || f.ownerUid === currentUser.uid || f.ownerId === currentUser.uid) &&
    String(f.ownerStatus || '').trim().toLowerCase() === 'disabled'
  );

  if (isOwnerDisabled) {
    return (
      <div className="fixed inset-0 bg-slate-950 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl max-w-md w-full p-8 shadow-2xl border text-center space-y-6 animate-in fade-in zoom-in duration-300">
          <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto text-3xl font-bold shadow-inner">
            🚫
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-gray-900">Admin မှ ပိတ်ထားပါသည်</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              သင့်၏ Owner အကောင့်နှင့် ကွင်းများကို System Administrator မှ ပိတ်ပင်ထားခြင်း (Disabled) ဖြစ်ပါသည်။ လုပ်ဆောင်ချက်များကို ဆက်လက်အသုံးပြု၍မရပါ။
            </p>
          </div>
          <div className="pt-2">
            <button
              onClick={() => {
                signOut(auth);
                setCurrentUser(null);
                clearRememberedLogin();
              }}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-xl shadow-lg transition-all text-sm flex items-center justify-center gap-2"
            >
              🚪 Logout (ထွက်မည်)
            </button>
          </div>
        </div>
      </div>
    );
  }

  const mobileActiveLabel = currentUser.role === 'admin'
    ? (adminTab === 'pending' ? 'Bookings အားလုံး' : adminTab === 'manage_fields' ? 'Manage Fields' : adminTab === 'report' ? 'Booking Report' : adminTab === 'manage_owners' ? 'Manage Owners' : adminTab === 'notifications_page' ? 'Notifications' : 'Password ပြောင်းရန်')
    : currentUser.role === 'owner'
      ? (ownerActiveTab === 'pending' ? 'Direct Booking' : ownerActiveTab === 'history' ? 'Booking History' : ownerActiveTab === 'report' ? 'My Fields Report' : ownerActiveTab === 'notifications_page' ? 'Notifications' : ownerActiveTab === 'fields_edit' ? 'ကွင်းအချိန် / KPay / Wave' : 'Password ပြောင်းရန်')
      : (activeTab === 'history' ? 'Booking History' : 'ကွင်းများ / Booking');

  return (
    <>
      <style>{`
        :root {
          --field-coral: #ff4f70;
          --field-coral-soft: #fff0f3;
          --field-ink: #0f172a;
          --field-panel: #f8fafc;
          --field-line: #dbe3ec;
        }
        .field-auth-shell {
          position: relative;
          overflow: hidden;
          background-image: radial-gradient(circle at 18% 16%, rgba(255,79,112,.16), transparent 30%), radial-gradient(circle at 86% 84%, rgba(14,165,233,.12), transparent 32%);
        }
        .field-auth-shell::before, .field-app-shell::before {
          content: '';
          position: fixed;
          inset: 0;
          pointer-events: none;
          opacity: .22;
          background-image: linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px);
          background-size: 28px 28px;
          mask-image: linear-gradient(to bottom, black, transparent 82%);
        }
        .field-auth-card {
          position: relative;
          z-index: 1;
        }
        .field-app-shell {
          position: relative;
          min-height: 100vh;
          background: #f5f7f9;
          background-image: linear-gradient(180deg, #f8fafb 0%, #f4f7f8 100%);
        }
        .field-app-header {
          background: linear-gradient(105deg, #007d5d 0%, #00916d 55%, #007e60 100%) !important;
          border-top: 4px solid #d9f99d;
          border-bottom: 1px solid rgba(0,72,54,.24);
        }
        .field-app-header-inner {
          min-height: 4.25rem;
        }
        .field-app-main {
          position: relative;
          z-index: 1;
        }
        .field-app-main > div {
          background: #fff;
          border-color: var(--field-line);
          box-shadow: 0 18px 42px rgba(15,23,42,.10);
        }
        .field-desktop-workspace {
          display: block;
          min-height: calc(100vh - 4.25rem);
        }
        .field-desktop-sidebar {
          display: none;
        }
        .field-desktop-topnav {
          display: none;
        }
        @media (min-width: 1025px) {
          .field-app-shell[data-mobile-device="false"] {
            background: #f5f7f9;
            background-image: linear-gradient(180deg, #f8fafb 0%, #f4f7f8 100%);
          }
          .field-app-shell[data-mobile-device="false"] .field-app-header {
            background: linear-gradient(105deg, #007d5d 0%, #00916d 55%, #007e60 100%) !important;
            border-top: 4px solid #d9f99d;
            border-bottom: 1px solid rgba(0,72,54,.24);
          }
          .field-app-shell[data-mobile-device="false"] .field-app-header-inner {
            min-height: 4rem;
          }
          .field-app-shell[data-mobile-device="false"] .field-desktop-workspace {
            display: block;
            max-width: 1440px;
            min-height: calc(100vh - 4rem);
            margin: 0 auto;
            padding: 1.6rem 1.35rem 3rem;
          }
          .field-app-shell[data-mobile-device="false"] .field-app-main {
            width: 100%;
            max-width: 1340px;
            min-height: 31rem;
            margin: 0 auto;
            padding: 1.25rem 1.45rem 2.5rem;
            background: #fff;
            border: 1px solid #e1e8e5;
            border-radius: 1rem;
            box-shadow: 0 8px 24px rgba(15,23,42,.09);
          }
          .field-app-shell[data-mobile-device="false"] .field-desktop-topnav {
            display: flex;
            align-items: center;
            gap: .55rem;
            width: 100%;
            overflow-x: auto;
            padding: .1rem 0 1.1rem;
            margin-bottom: 1.05rem;
            border-bottom: 1px solid #e3e8e6;
            scrollbar-width: thin;
          }
          .field-app-shell[data-mobile-device="false"] .field-desktop-topnav button {
            flex: 0 0 auto;
            min-height: 2.55rem;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: .38rem;
            padding: .58rem .85rem;
            border: 1px solid #edf0f1;
            border-radius: .72rem;
            color: #334155;
            background: #f5f6f7;
            font-size: .72rem;
            font-weight: 800;
            white-space: nowrap;
            transition: background-color .18s ease, border-color .18s ease, color .18s ease, box-shadow .18s ease, transform .18s ease;
          }
          .field-app-shell[data-mobile-device="false"] .field-desktop-topnav button:hover {
            color: #007d5d;
            background: #ecfdf5;
            border-color: #99e6c5;
            transform: translateY(-1px);
          }
          .field-app-shell[data-mobile-device="false"] .field-desktop-topnav button[data-active="true"] {
            color: #fff;
            background: #009b72;
            border-color: #008b67;
            box-shadow: 0 5px 12px rgba(0,139,103,.22);
          }
          .field-app-shell[data-mobile-device="false"] .field-desktop-topnav button[data-active="true"]:hover {
            color: #fff;
            background: #008b67;
          }
          .field-app-shell[data-mobile-device="false"] .field-app-main > div {
            border-radius: .35rem;
            box-shadow: none;
          }
          .field-app-shell[data-mobile-device="false"] .field-app-main > div > div:first-child {
            border-color: #e2e8e5;
          }
        }
        .field-role-drawer {
          background: linear-gradient(180deg, #007d5d 0%, #008b67 48%, #006f54 100%) !important;
        }
        .field-drawer-hero {
          border-bottom: 1px solid rgba(255,255,255,.22);
          background: linear-gradient(105deg, #007d5d 0%, #00916d 55%, #007e60 100%) !important;
        }
        .field-role-nav button {
          border-color: rgba(255,255,255,.18) !important;
          color: #f0fdf4;
        }
        .field-role-nav button:hover, .field-role-nav button:active {
          color: #fff;
        }
        .field-role-nav button[class*="bg-[#fff0f3]"] {
          color: #007d5d !important;
          background: #dcfce7 !important;
        }
        .field-app-shell[data-mobile-device="true"] .field-role-drawer > div:last-child {
          background: #f5f7f9;
        }
        /* On phones, show only the selected function's actual page content. Keep the desktop dashboard heading/meta intact. */
        .field-app-shell[data-mobile-device="true"] .field-mobile-duplicate-meta {
          display: none !important;
        }
        @media (max-width: 640px) {
          .field-app-main > div {
            border-radius: 1rem;
            box-shadow: 0 12px 28px rgba(15,23,42,.12);
          }
          .field-app-header-inner {
            min-height: 3.8rem;
          }
        }
        /* Keep a phone in the portrait-style shell after physical rotation.
           Browser orientation cannot always be locked by a normal web page, so this
           rule keeps the mobile navigation, one-column density, and narrow workspace
           even when the viewport becomes landscape. */
        @media (orientation: landscape) and (max-width: 1024px) {
          .field-app-shell[data-mobile-device="true"] {
            min-width: 360px;
          }
          /* Landscape phones use the full viewport; keep the controls mobile,
             but never squeeze the application into a partial-width column. */
          .field-app-shell[data-mobile-device="true"] .field-app-header-inner,
          .field-app-shell[data-mobile-device="true"] .field-app-main {
            width: 100%;
            max-width: 100%;
            margin-left: 0;
            margin-right: 0;
          }
          .field-app-shell[data-mobile-device="true"] .field-app-header-inner {
            min-height: 3.8rem;
          }
          .field-app-shell[data-mobile-device="true"] [class~="sm:hidden"] {
            display: block !important;
          }
          .field-app-shell[data-mobile-device="true"] button[class~="sm:hidden"] {
            display: inline-flex !important;
          }
          .field-app-shell[data-mobile-device="true"] [class~="fixed"][class~="inset-0"] {
            min-height: 100dvh;
            touch-action: none;
          }
          .field-app-shell[data-mobile-device="true"] .field-role-drawer,
          .field-app-shell[data-mobile-device="true"] .field-role-drawer * {
            touch-action: manipulation;
          }
          .field-app-shell[data-mobile-device="true"] [class~="hidden"][class~="sm:flex"],
          .field-app-shell[data-mobile-device="true"] [class~="hidden"][class~="sm:inline-flex"] {
            display: none !important;
          }
          .field-app-shell[data-mobile-device="true"] [class~="sm:flex-row"] {
            flex-direction: column !important;
          }
          .field-app-shell[data-mobile-device="true"] [class~="sm:grid-cols-2"],
          .field-app-shell[data-mobile-device="true"] [class~="sm:grid-cols-3"] {
            grid-template-columns: minmax(0, 1fr) !important;
          }
          .field-app-shell[data-mobile-device="true"] [class~="sm:col-span-2"],
          .field-app-shell[data-mobile-device="true"] [class~="sm:col-span-3"] {
            grid-column: span 1 / span 1 !important;
          }
          .field-app-shell[data-mobile-device="true"] .field-role-drawer {
            width: min(88vw, 22rem);
            height: 100dvh;
            max-height: 100dvh;
            overflow: hidden;
            box-sizing: border-box;
            z-index: 2;
          }
          .field-app-shell[data-mobile-device="true"] .field-role-nav {
            flex: 1 1 auto;
            min-height: 0;
            overflow-x: hidden;
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
            overscroll-behavior: contain;
            touch-action: pan-y;
            position: relative;
            z-index: 3;
          }
          .field-app-shell[data-mobile-device="true"] .field-role-nav button {
            position: relative;
            z-index: 4;
            flex: 0 0 auto;
            min-height: 3.65rem;
            pointer-events: auto;
            touch-action: manipulation;
          }
          .field-app-shell[data-mobile-device="true"] .field-role-drawer > div:last-child {
            position: relative;
            z-index: 5;
            flex: 0 0 auto;
            background: #0f172a;
          }
          .field-app-shell[data-mobile-device="true"] .field-app-main > div {
            border-radius: 1rem;
            box-shadow: 0 12px 28px rgba(15,23,42,.12);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .field-app-shell *, .field-auth-shell * {
            animation-duration: .01ms !important;
            transition-duration: .01ms !important;
          }
        }
      `}</style>
      {/* iOS Safari Install Guide Modal */}
      {showIosInstallModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border text-center space-y-4 animate-in fade-in zoom-in duration-200 text-gray-800">
            <div className="w-14 h-14 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto text-2xl font-bold shadow-inner">
              📲
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-gray-900">iPhone တွင် App ထည့်သွင်းနည်း</h3>
              <p className="text-xs text-gray-600 leading-relaxed">
                Safari ဘရောက်ဆာ၏ အောက်ခြေရှိ <span className="font-bold text-blue-600">Share (မျှဝေရန်)</span> ခလုတ်ကို နှိပ်ပြီးနောက် <span className="font-bold">"Add to Home Screen"</span> ကို ရွေးချယ်ပါ။
              </p>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowIosInstallModal(false)}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-xl shadow transition-all text-xs"
              >
                နားလည်ပါပြီ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* App Update Notification Modal */}
      {updateAvailable && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border text-center space-y-4 animate-in fade-in zoom-in duration-200">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-2xl font-bold shadow-inner">
              🚀
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-gray-900">ဗားရှင်းအသစ် ရောက်ရှိနေပါပြီ ({latestVersionName})</h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                စနစ်တွင် လုပ်ဆောင်ချက်အသစ်များနှင့် Bug ပြင်ဆင်မှုများ ပါဝင်သော Update အသစ်ထွက်ရှိထားပါသည်။ ကျေးဇူးပြု၍ App အသစ်ကို ထပ်မံ Download ဆွဲပြီး Update လုပ်ပါ။
              </p>
            </div>
            <div className="pt-2 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  // Link to download new APK or web reload
                  window.location.reload();
                }}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-4 rounded-xl shadow-lg transition-all text-sm flex items-center justify-center gap-2"
              >
                📥 ယခုပင် Update လုပ်မည်
              </button>
            </div>
          </div>
        </div>
      )}

    <div data-ui-shell="compact-console" data-mobile-device={isMobileDevice ? 'true' : 'false'} className="field-app-shell min-h-screen bg-slate-950 font-sans pb-12 text-slate-900">
      <header className="field-app-header bg-slate-950 text-white shadow-md sticky top-0 z-50">
        <div className="field-app-header-inner max-w-7xl mx-auto px-3 py-2.5 sm:px-4 sm:py-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMobileHeaderMenuOpen(true)}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-emerald-800 px-2.5 py-2 text-xs font-bold hover:bg-emerald-900 active:scale-[0.98] sm:hidden"
            aria-expanded={mobileHeaderMenuOpen}
            aria-controls="role-mobile-drawer"
            aria-label="Open role menu"
          >
            ☰ Menu
          </button>
          <div className="min-w-0 flex-1 cursor-pointer items-center gap-1.5 sm:flex-none sm:flex" onClick={() => { setActiveTab('fields'); setUserSelectedField(null); setSelectedSubField(null); setMobileHeaderMenuOpen(false); sessionStorage.removeItem('userSelectedField'); sessionStorage.removeItem('selectedSubField'); }}>
            <span className="text-xl sm:text-2xl">⚽</span>
            <h1 className="truncate text-base sm:text-xl font-bold">Field Booking App</h1>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {currentUser.role === 'user' && (
              <button onClick={() => { setActiveTab('history'); setMobileHeaderMenuOpen(false); }} className="hidden sm:inline-flex text-xs px-3 py-1.5 rounded bg-emerald-800 text-white font-bold hover:bg-emerald-900">📋 History</button>
            )}
            {currentUser.role === 'admin' && (
              <button onClick={() => { setActiveTab('dashboard'); setMobileHeaderMenuOpen(false); }} className="hidden sm:inline-flex text-xs px-3 py-1.5 rounded bg-emerald-800 text-white font-bold hover:bg-emerald-900">⚙️ Admin Dashboard</button>
            )}
            {currentUser.role === 'owner' && (
              <button onClick={() => { setActiveTab('owner_manage'); setMobileHeaderMenuOpen(false); }} className="hidden sm:inline-flex text-xs px-3 py-1.5 rounded bg-emerald-800 text-white font-bold hover:bg-emerald-900">🏟️ Manage Fields & History</button>
            )}
            
            {isMobileDevice && !isAppInstalled && (
                <button
                  type="button"
                  onClick={handleInstallClick}
                  className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs px-3 py-1.5 rounded-lg shadow transition-all active:scale-95 shrink-0"
                  title="App ကို ဖုန်းစခရင်ပေါ်သို့ ထည့်သွင်းမည်"
                >
                  <span>📲</span>
                  <span>Install App</span>
                </button>
              )}

            {(currentUser.role === 'owner' || currentUser.role === 'admin') && (
              <div className="relative notification-dropdown-container">
                <button 
                  onClick={() => {
                    const nextState = !showNotiDropdown;
                    setShowNotiDropdown(nextState);
                    if (nextState) {
                      handleMarkNotificationsAsRead();
                    }
                  }}
                  className="p-1.5 bg-emerald-800 hover:bg-emerald-900 rounded-full relative text-sm"
                  aria-label="Notifications"
                >
                  🔔
                  {smsNotifications.filter(n => !n.read).length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] rounded-full h-4 w-4 flex items-center justify-center font-bold">
                      {smsNotifications.filter(n => !n.read).length}
                    </span>
                  )}
                </button>

                {showNotiDropdown && (
                  <div className="absolute right-0 mt-2 w-[min(20rem,calc(100vw-1.5rem))] bg-white border text-gray-800 rounded-xl shadow-2xl z-50 p-3">
                    <div className="font-bold text-xs border-b pb-2 mb-2 flex justify-between items-center">
                      <span>💬 SMS & Booking Notifications</span>
                      <button onClick={() => setSmsNotifications([])} className="text-[10px] text-blue-600 hover:underline">Clear All</button>
                    </div>
                    <div className="max-h-80 overflow-y-auto space-y-2">
                      {sortedNotifications.length === 0 ? (
                        <p className="text-xs text-gray-500 text-center py-4">အကြောင်းကြားစာ မရှိသေးပါ။</p>
                      ) : (
                        sortedNotifications.map(n => {
                          const isRejected = n.subType === 'booking_reject' || /reject/i.test(n.message || '');
                          return (
                            <div key={n.id} className={`text-xs p-2.5 rounded-lg border-l-4 shadow-sm ${isRejected ? 'bg-red-50 border-red-500' : 'bg-gray-50 border-emerald-600'}`}>
                              <p className={`${isRejected ? 'text-red-700 font-bold' : 'text-gray-800'}`}>{n.message}</p>
                              <span className="text-[10px] text-gray-400 mt-1 block">{n.date} {n.time}</span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <span className="hidden sm:inline-flex text-xs bg-emerald-800 px-3 py-1 rounded font-medium">{currentUser.name} ({currentUser.role})</span>
            <button onClick={handleLogout} className="hidden sm:inline-flex bg-red-500 hover:bg-red-600 text-white text-xs px-3 py-1.5 rounded font-bold">Logout</button>
          </div>
        </div>

        <div
          className={`fixed inset-0 z-[60] sm:hidden transition-opacity duration-200 ${mobileHeaderMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
          aria-hidden={!mobileHeaderMenuOpen}
        >
          <button
            type="button"
            aria-label="Close role menu backdrop"
            onClick={() => setMobileHeaderMenuOpen(false)}
            className="absolute inset-0 h-full w-full bg-slate-950/55 backdrop-blur-[2px]"
          />
          <aside
            id="role-mobile-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={`${currentUser.role} menu`}
            className={`field-role-drawer absolute inset-y-0 left-0 flex w-[min(88vw,22rem)] max-w-full flex-col bg-slate-900 text-slate-100 shadow-2xl transition-transform duration-300 ease-out ${mobileHeaderMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}
          >
            <div className="field-drawer-hero relative overflow-hidden bg-slate-950 px-5 pb-5 pt-5 text-white">
              <div className="absolute -right-10 -top-12 h-36 w-36 rounded-full border-[18px] border-white/10" />
              <div className="relative flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full border-4 border-white/80 bg-emerald-950/30 text-3xl shadow-lg">⚽</div>
                  <p className="truncate text-base font-extrabold">{currentUser.name}</p>
                  <p className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-100">{currentUser.role}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileHeaderMenuOpen(false)}
                  className="rounded-full bg-white/15 px-3 py-2 text-xl leading-none text-white transition hover:bg-white/25 active:scale-95"
                  aria-label="Close menu"
                >
                  ×
                </button>
              </div>
              <div className="relative mt-5 border-t border-white/20 pt-3 text-xs font-semibold text-emerald-50">
                <span className="mr-2 inline-block h-2 w-2 rounded-full bg-lime-300 shadow-[0_0_0_4px_rgba(190,242,100,0.18)]" />
                {mobileActiveLabel}
              </div>
            </div>

            <nav className="field-role-nav min-h-0 flex-1 overflow-y-auto py-2" aria-label="Role functions">
              <p className="px-5 pb-2 pt-3 text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-400">Functions</p>
              <button
                type="button"
                onClick={() => { setActiveTab('fields'); setUserSelectedField(null); setSelectedSubField(null); setMobileHeaderMenuOpen(false); sessionStorage.removeItem('userSelectedField'); sessionStorage.removeItem('selectedSubField'); }}
                className="flex w-full items-center gap-3 border-b border-slate-100 px-5 py-3.5 text-left text-sm font-bold transition hover:bg-emerald-50 active:bg-emerald-100"
              >
                <span className="w-7 text-center text-xl">🏟️</span><span>ကွင်းများ / Booking</span>
              </button>

              {currentUser.role === 'user' && (
                <button
                  type="button"
                  onClick={() => { setActiveTab('history'); setMobileHeaderMenuOpen(false); }}
                  className={`flex w-full items-center gap-3 border-b border-slate-100 px-5 py-3.5 text-left text-sm font-bold transition ${activeTab === 'history' ? 'bg-[#fff0f3] text-[#c92f51] shadow-[inset_3px_0_0_#ff4f70]' : 'hover:bg-slate-800 active:bg-slate-700'}`}
                >
                  <span className="w-7 text-center text-xl">📋</span><span>Booking History</span>
                </button>
              )}

              {currentUser.role === 'admin' && (
                <>
                  <button type="button" onClick={() => { setActiveTab('dashboard'); setAdminTab('pending'); setMobileHeaderMenuOpen(false); }} className={`flex w-full items-center gap-3 border-b border-slate-100 px-5 py-3.5 text-left text-sm font-bold transition ${activeTab === 'dashboard' && adminTab === 'pending' ? 'bg-[#fff0f3] text-[#c92f51] shadow-[inset_3px_0_0_#ff4f70]' : 'hover:bg-slate-800 active:bg-slate-700'}`}><span className="w-7 text-center text-xl">📋</span><span>Bookings အားလုံး</span></button>
                  <button type="button" onClick={() => { setActiveTab('dashboard'); setAdminTab('manage_fields'); setMobileHeaderMenuOpen(false); }} className={`flex w-full items-center gap-3 border-b border-slate-100 px-5 py-3.5 text-left text-sm font-bold transition ${activeTab === 'dashboard' && adminTab === 'manage_fields' ? 'bg-[#fff0f3] text-[#c92f51] shadow-[inset_3px_0_0_#ff4f70]' : 'hover:bg-slate-800 active:bg-slate-700'}`}><span className="w-7 text-center text-xl">🏗️</span><span>Manage Fields</span></button>
                  <button type="button" onClick={() => { setActiveTab('dashboard'); setAdminTab('report'); setMobileHeaderMenuOpen(false); }} className={`flex w-full items-center gap-3 border-b border-slate-100 px-5 py-3.5 text-left text-sm font-bold transition ${activeTab === 'dashboard' && adminTab === 'report' ? 'bg-[#fff0f3] text-[#c92f51] shadow-[inset_3px_0_0_#ff4f70]' : 'hover:bg-slate-800 active:bg-slate-700'}`}><span className="w-7 text-center text-xl">📊</span><span>Booking Report</span></button>
                  <button type="button" onClick={() => { setActiveTab('dashboard'); setAdminTab('manage_owners'); setMobileHeaderMenuOpen(false); }} className={`flex w-full items-center gap-3 border-b border-slate-100 px-5 py-3.5 text-left text-sm font-bold transition ${activeTab === 'dashboard' && adminTab === 'manage_owners' ? 'bg-[#fff0f3] text-[#c92f51] shadow-[inset_3px_0_0_#ff4f70]' : 'hover:bg-slate-800 active:bg-slate-700'}`}><span className="w-7 text-center text-xl">🔑</span><span>Manage Owners</span></button>
                  <button type="button" onClick={() => { setActiveTab('dashboard'); setAdminTab('notifications_page'); setMobileHeaderMenuOpen(false); }} className={`flex w-full items-center gap-3 border-b border-slate-100 px-5 py-3.5 text-left text-sm font-bold transition ${activeTab === 'dashboard' && adminTab === 'notifications_page' ? 'bg-[#fff0f3] text-[#c92f51] shadow-[inset_3px_0_0_#ff4f70]' : 'hover:bg-slate-800 active:bg-slate-700'}`}><span className="w-7 text-center text-xl">🔔</span><span>Notifications</span></button>
                  <button type="button" onClick={() => { setActiveTab('dashboard'); setAdminTab('change_password'); setMobileHeaderMenuOpen(false); }} className={`flex w-full items-center gap-3 border-b border-slate-100 px-5 py-3.5 text-left text-sm font-bold transition ${activeTab === 'dashboard' && adminTab === 'change_password' ? 'bg-[#fff0f3] text-[#c92f51] shadow-[inset_3px_0_0_#ff4f70]' : 'hover:bg-slate-800 active:bg-slate-700'}`}><span className="w-7 text-center text-xl">🔒</span><span>Password ပြောင်းရန်</span></button>
                </>
              )}

              {currentUser.role === 'owner' && (
                <>
                  <button type="button" onClick={() => { setActiveTab('owner_manage'); setOwnerActiveTab('pending'); setMobileHeaderMenuOpen(false); }} className={`flex w-full items-center gap-3 border-b border-slate-100 px-5 py-3.5 text-left text-sm font-bold transition ${activeTab === 'owner_manage' && ownerActiveTab === 'pending' ? 'bg-[#fff0f3] text-[#c92f51] shadow-[inset_3px_0_0_#ff4f70]' : 'hover:bg-slate-800 active:bg-slate-700'}`}><span className="w-7 text-center text-xl">📝</span><span>Direct Booking</span></button>
                  <button type="button" onClick={() => { setActiveTab('owner_manage'); setOwnerActiveTab('history'); setMobileHeaderMenuOpen(false); }} className={`flex w-full items-center gap-3 border-b border-slate-100 px-5 py-3.5 text-left text-sm font-bold transition ${activeTab === 'owner_manage' && ownerActiveTab === 'history' ? 'bg-[#fff0f3] text-[#c92f51] shadow-[inset_3px_0_0_#ff4f70]' : 'hover:bg-slate-800 active:bg-slate-700'}`}><span className="w-7 text-center text-xl">📋</span><span>Booking History</span></button>
                  <button type="button" onClick={() => { setActiveTab('owner_manage'); setOwnerActiveTab('report'); setMobileHeaderMenuOpen(false); }} className={`flex w-full items-center gap-3 border-b border-slate-100 px-5 py-3.5 text-left text-sm font-bold transition ${activeTab === 'owner_manage' && ownerActiveTab === 'report' ? 'bg-[#fff0f3] text-[#c92f51] shadow-[inset_3px_0_0_#ff4f70]' : 'hover:bg-slate-800 active:bg-slate-700'}`}><span className="w-7 text-center text-xl">📊</span><span>My Fields Report</span></button>
                  <button type="button" onClick={() => { setActiveTab('owner_manage'); setOwnerActiveTab('notifications_page'); setMobileHeaderMenuOpen(false); }} className={`flex w-full items-center gap-3 border-b border-slate-100 px-5 py-3.5 text-left text-sm font-bold transition ${activeTab === 'owner_manage' && ownerActiveTab === 'notifications_page' ? 'bg-[#fff0f3] text-[#c92f51] shadow-[inset_3px_0_0_#ff4f70]' : 'hover:bg-slate-800 active:bg-slate-700'}`}><span className="w-7 text-center text-xl">🔔</span><span>Notifications</span></button>
                  <button type="button" onClick={() => { setActiveTab('owner_manage'); setOwnerActiveTab('fields_edit'); setMobileHeaderMenuOpen(false); }} className={`flex w-full items-center gap-3 border-b border-slate-100 px-5 py-3.5 text-left text-sm font-bold transition ${activeTab === 'owner_manage' && ownerActiveTab === 'fields_edit' ? 'bg-[#fff0f3] text-[#c92f51] shadow-[inset_3px_0_0_#ff4f70]' : 'hover:bg-slate-800 active:bg-slate-700'}`}><span className="w-7 text-center text-xl">🏟️</span><span>ကွင်းအချိန် / KPay / Wave</span></button>
                  <button type="button" onClick={() => { setActiveTab('owner_manage'); setOwnerActiveTab('password'); setMobileHeaderMenuOpen(false); }} className={`flex w-full items-center gap-3 border-b border-slate-100 px-5 py-3.5 text-left text-sm font-bold transition ${activeTab === 'owner_manage' && ownerActiveTab === 'password' ? 'bg-[#fff0f3] text-[#c92f51] shadow-[inset_3px_0_0_#ff4f70]' : 'hover:bg-slate-800 active:bg-slate-700'}`}><span className="w-7 text-center text-xl">🔒</span><span>Password ပြောင်းရန်</span></button>
                </>
              )}
            </nav>

            <div className="border-t border-slate-200 p-4">
              {(currentUser.role === 'admin' || currentUser.role === 'owner') && (
                <button type="button" onClick={() => { setShowNotiDropdown(true); setMobileHeaderMenuOpen(false); handleMarkNotificationsAsRead(); }} className="mb-2 flex w-full items-center gap-3 rounded-xl bg-amber-50 px-4 py-3 text-left text-sm font-bold text-amber-800 transition hover:bg-amber-100">
                  <span className="text-xl">🔔</span><span>Quick Notifications</span>
                </button>
              )}
              <button type="button" onClick={() => { setMobileHeaderMenuOpen(false); handleLogout(); }} className="flex w-full items-center gap-3 rounded-xl bg-red-50 px-4 py-3 text-left text-sm font-bold text-red-700 transition hover:bg-red-100 active:bg-red-200">
                <span className="text-xl">↪</span><span>Logout</span>
              </button>
            </div>
          </aside>
        </div>
      </header>

      <div className="field-desktop-workspace">
        <aside className="field-desktop-sidebar" aria-label="Desktop navigation">
          <div className="mb-5 border-b border-white/10 pb-4">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#ff4f70] text-2xl shadow-lg">⚽</div>
            <p className="truncate text-sm font-extrabold text-white">{currentUser.name}</p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-200">{currentUser.role}</p>
          </div>
          <p className="mb-2 px-2 text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-400">Menu</p>
          <button type="button" data-active={activeTab === 'fields'} onClick={() => { setActiveTab('fields'); setUserSelectedField(null); setSelectedSubField(null); sessionStorage.removeItem('userSelectedField'); sessionStorage.removeItem('selectedSubField'); }}>
            <span>🏟️</span><span>ကွင်းများ / Booking</span>
          </button>
          {currentUser.role === 'user' && (
            <>
              <button type="button" data-active={activeTab === 'history'} onClick={() => setActiveTab('history')}><span>📋</span><span>Booking History</span></button>
              <button type="button" data-active={activeTab === 'password'} onClick={() => setActiveTab('password')}><span>🔒</span><span>Password ပြောင်းရန်</span></button>
            </>
          )}
          {currentUser.role === 'owner' && (
            <>
              <button type="button" data-active={activeTab === 'owner_manage'} onClick={() => setActiveTab('owner_manage')}><span>🧾</span><span>Manage & History</span></button>
              <button type="button" data-active={activeTab === 'owner_report'} onClick={() => setActiveTab('owner_report')}><span>📊</span><span>My Fields Report</span></button>
            </>
          )}
          {currentUser.role === 'admin' && (
            <>
              <button type="button" data-active={activeTab === 'dashboard'} onClick={() => { setActiveTab('dashboard'); setAdminTab('pending'); }}><span>📋</span><span>Bookings အားလုံး</span></button>
              <button type="button" data-active={activeTab === 'dashboard' && adminTab === 'manage_fields'} onClick={() => { setActiveTab('dashboard'); setAdminTab('manage_fields'); }}><span>🏗️</span><span>Manage Fields</span></button>
              <button type="button" data-active={activeTab === 'dashboard' && adminTab === 'report'} onClick={() => { setActiveTab('dashboard'); setAdminTab('report'); }}><span>📊</span><span>Booking Report</span></button>
              <button type="button" data-active={activeTab === 'dashboard' && adminTab === 'manage_owners'} onClick={() => { setActiveTab('dashboard'); setAdminTab('manage_owners'); }}><span>🔑</span><span>Manage Owners</span></button>
            </>
          )}
          <div className="mt-auto border-t border-white/10 pt-4">
            <button type="button" onClick={handleLogout}><span>↪️</span><span>Logout</span></button>
          </div>
        </aside>
      <main className="field-app-main max-w-7xl mx-auto px-3 sm:px-4 mt-4 sm:mt-6">
        <nav className="field-desktop-topnav" aria-label="Desktop role navigation">
          {currentUser.role === 'user' && (
            <>
              <button
                type="button"
                data-active={activeTab === 'fields'}
                onClick={() => {
                  setActiveTab('fields');
                  setUserSelectedField(null);
                  setSelectedSubField(null);
                  sessionStorage.removeItem('userSelectedField');
                  sessionStorage.removeItem('selectedSubField');
                }}
              >
                <span aria-hidden="true">🏟️</span><span>ကွင်းများ / Booking</span>
              </button>
              <button type="button" data-active={activeTab === 'history'} onClick={() => setActiveTab('history')}>
                <span aria-hidden="true">📋</span><span>Booking History</span>
              </button>
              <button type="button" data-active={activeTab === 'password'} onClick={() => setActiveTab('password')}>
                <span aria-hidden="true">🔒</span><span>Password ပြောင်းရန်</span>
              </button>
            </>
          )}

          {currentUser.role === 'admin' && (
            <>
              <button type="button" data-active={activeTab === 'dashboard' && adminTab === 'pending'} onClick={() => { setActiveTab('dashboard'); setAdminTab('pending'); }}>
                <span aria-hidden="true">📋</span><span>Bookings အားလုံး</span>
              </button>
              <button type="button" data-active={activeTab === 'dashboard' && adminTab === 'manage_fields'} onClick={() => { setActiveTab('dashboard'); setAdminTab('manage_fields'); }}>
                <span aria-hidden="true">🏗️</span><span>Manage Fields & Add Field</span>
              </button>
              <button type="button" data-active={activeTab === 'dashboard' && adminTab === 'report'} onClick={() => { setActiveTab('dashboard'); setAdminTab('report'); }}>
                <span aria-hidden="true">📊</span><span>Booking Report</span>
              </button>
              <button type="button" data-active={activeTab === 'dashboard' && adminTab === 'manage_owners'} onClick={() => { setActiveTab('dashboard'); setAdminTab('manage_owners'); }}>
                <span aria-hidden="true">🔑</span><span>Manage Owners & Passwords</span>
              </button>
              <button type="button" data-active={activeTab === 'dashboard' && adminTab === 'notifications_page'} onClick={() => { setActiveTab('dashboard'); setAdminTab('notifications_page'); }}>
                <span aria-hidden="true">🔔</span><span>Notifications & Filter</span>
              </button>
              <button type="button" data-active={activeTab === 'dashboard' && adminTab === 'change_password'} onClick={() => { setActiveTab('dashboard'); setAdminTab('change_password'); }}>
                <span aria-hidden="true">🔒</span><span>Password ပြောင်းရန်</span>
              </button>
            </>
          )}

          {currentUser.role === 'owner' && (
            <>
              <button type="button" data-active={activeTab === 'owner_manage' && ownerActiveTab === 'pending'} onClick={() => { setActiveTab('owner_manage'); setOwnerActiveTab('pending'); }}>
                <span aria-hidden="true">📝</span><span>Direct Booking</span>
              </button>
              <button type="button" data-active={activeTab === 'owner_manage' && ownerActiveTab === 'history'} onClick={() => { setActiveTab('owner_manage'); setOwnerActiveTab('history'); }}>
                <span aria-hidden="true">📋</span><span>Booking History</span>
              </button>
              <button type="button" data-active={activeTab === 'owner_manage' && ownerActiveTab === 'report'} onClick={() => { setActiveTab('owner_manage'); setOwnerActiveTab('report'); }}>
                <span aria-hidden="true">📊</span><span>My Fields Report</span>
              </button>
              <button type="button" data-active={activeTab === 'owner_manage' && ownerActiveTab === 'notifications_page'} onClick={() => { setActiveTab('owner_manage'); setOwnerActiveTab('notifications_page'); }}>
                <span aria-hidden="true">🔔</span><span>Notifications & Filter</span>
              </button>
              <button type="button" data-active={activeTab === 'owner_manage' && ownerActiveTab === 'fields_edit'} onClick={() => { setActiveTab('owner_manage'); setOwnerActiveTab('fields_edit'); }}>
                <span aria-hidden="true">🏟️</span><span>ကွင်းအချိန် / KPay / Wave</span>
              </button>
              <button type="button" data-active={activeTab === 'owner_manage' && ownerActiveTab === 'password'} onClick={() => { setActiveTab('owner_manage'); setOwnerActiveTab('password'); }}>
                <span aria-hidden="true">🔒</span><span>Password ပြောင်းရန်</span>
              </button>
            </>
          )}
        </nav>
        {currentUser.role === 'admin' && activeTab === 'dashboard' ? (
          <div className="bg-white rounded-xl shadow p-4 sm:p-6">
            <div className="flex flex-col items-start gap-3 mb-6 border-b pb-4 sm:flex-row sm:justify-between sm:items-center">
              <h2 className="text-lg sm:text-xl font-bold text-gray-800">{adminTab === 'pending' ? 'Booking History' : 'Admin Management Dashboard'}</h2>
              {adminTab !== 'pending' && (
                <button onClick={() => { setActiveTab('fields'); setAdminMobileMenuOpen(false); }} className="hidden sm:inline-flex w-full sm:w-auto bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold">← ကွင်းများသို့ ပြန်ရန်</button>
              )}
            </div>

            <div className="field-mobile-duplicate-meta mb-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-500">လက်ရှိရွေးချယ်ထားသော Function</p>
              <p className="mt-1 text-sm font-extrabold text-slate-800">
                {adminTab === 'pending' ? `Booking History (${adminHistoryBookings.length}${historyHasMore ? '+' : ''})` : adminTab === 'manage_fields' ? 'Manage Fields & Add Field' : adminTab === 'report' ? '📊 Booking Report' : adminTab === 'manage_owners' ? '🔑 Manage Owners & Passwords' : adminTab === 'notifications_page' ? '🔔 Notifications & Filter Page' : '🔒 ကိုယ်ပိုင် Password ပြောင်းရန်'}
              </p>
            </div>

            {adminTab === 'change_password' && (
              <div className="bg-gray-50 border rounded-2xl p-6 max-w-md">
                <h3 className="text-lg font-bold mb-4 text-gray-800">🔒 Change Password (Password ပြောင်းရန်)</h3>
                <form onSubmit={handleChangeMyPassword} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Password အဟောင်း (Current Password)</label>
                    <input type="password" value={oldPasswordInput} onChange={(e) => setOldPasswordInput(e.target.value)} className="w-full border rounded-lg p-2.5 text-sm bg-white font-mono" required placeholder="••••••••" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Password အသစ် (New Password - အနည်းဆုံး ၆ လုံး)</label>
                    <input type="password" value={newPasswordInput} onChange={(e) => setNewPasswordInput(e.target.value)} className="w-full border rounded-lg p-2.5 text-sm bg-white font-mono" required placeholder="••••••••" />
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <button type="submit" className="bg-emerald-600 text-white px-4 py-2.5 rounded-lg text-xs font-bold hover:bg-emerald-700 transition">Password ပြောင်းမည်</button>
                    <button type="button" onClick={handleForgotPassword} className="text-xs text-blue-600 font-bold hover:underline">Password မေ့နေပါသလား? (Forgot)</button>
                  </div>
                </form>
              </div>
            )}

            {adminTab === 'report' && (
              <div className="space-y-5">
                <div className="flex flex-col gap-4 rounded-2xl border bg-gray-50 p-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h3 className="text-base font-extrabold text-gray-800">📊 Admin Booking Report</h3>
                    <p className="mt-1 text-xs text-gray-500">ရက်စွဲတစ်ရက်ရွေးပြီး Booking အားလုံး၏ Overall ကိုကြည့်ပါ။</p>
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="text-xs font-bold text-gray-700">
                      Date
                      <input type="date" value={adminReportDate} onChange={(e) => setAdminReportDate(e.target.value)} className="mt-1 block rounded-lg border bg-white p-2 text-xs font-bold" />
                    </label>
                    <button type="button" onClick={() => setAdminReportDate(new Date().toISOString().slice(0, 10))} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700">ယနေ့</button>
                  </div>
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  နာရီစုစုပေါင်းနှင့် ဝင်ငွေကို <strong>Approved Booking</strong> များအတွက်သာတွက်ထားပါသည်။ Pending များကို ဝင်ငွေထဲမထည့်သေးပါ။
                </div>

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><p className="text-[11px] font-bold text-amber-700">Pending</p><p className="mt-1 text-2xl font-extrabold text-amber-800">{adminReport.statusCounts.pending}</p></div>
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-[11px] font-bold text-emerald-700">Approved</p><p className="mt-1 text-2xl font-extrabold text-emerald-800">{adminReport.statusCounts.approved}</p></div>
                  <div className="rounded-2xl border border-red-200 bg-red-50 p-4"><p className="text-[11px] font-bold text-red-700">Rejected</p><p className="mt-1 text-2xl font-extrabold text-red-800">{adminReport.statusCounts.rejected}</p></div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-[11px] font-bold text-slate-600">Total Bookings</p><p className="mt-1 text-2xl font-extrabold text-slate-800">{adminReport.total}</p></div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4"><p className="text-xs font-bold text-blue-700">Approved ငှားရမ်းနာရီ</p><p className="mt-1 text-2xl font-extrabold text-blue-900">{adminReport.approvedHours.toLocaleString()} နာရီ</p></div>
                  <div className="rounded-2xl border border-green-200 bg-green-50 p-4"><p className="text-xs font-bold text-green-700">Approved KPay</p><p className="mt-1 text-2xl font-extrabold text-green-900">{adminReport.paymentRevenue.kpay.toLocaleString()} ကျပ်</p></div>
                  <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4"><p className="text-xs font-bold text-sky-700">Approved Cash</p><p className="mt-1 text-2xl font-extrabold text-sky-900">{adminReport.paymentRevenue.cash.toLocaleString()} ကျပ်</p></div>
                  <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4"><p className="text-xs font-bold text-indigo-700">Approved Wave</p><p className="mt-1 text-2xl font-extrabold text-indigo-900">{adminReport.paymentRevenue.wave.toLocaleString()} ကျပ်</p></div>
                  <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 sm:col-span-2 lg:col-span-2"><p className="text-xs font-bold text-violet-700">Approved ဝင်ငွေ Total</p><p className="mt-1 text-2xl font-extrabold text-violet-900">{adminReport.paymentRevenue.total.toLocaleString()} ကျပ်</p></div>
                </div>

                <div className="rounded-2xl border bg-white">
                  <div className="border-b bg-gray-50 p-4"><h4 className="text-sm font-extrabold text-gray-800">ကွင်း / ကွင်းခွဲအလိုက် Overall</h4><p className="mt-1 text-xs text-gray-500">{adminReportDate} တွင် ပါဝင်သော Booking များ</p></div>
                  {adminReport.fieldBreakdown.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-[720px] w-full text-left text-xs">
                        <thead className="bg-gray-100 text-gray-700"><tr><th className="p-3">ကွင်း / ကွင်းခွဲ</th><th className="p-3 text-center">Pending</th><th className="p-3 text-center">Approved</th><th className="p-3 text-center">Rejected</th><th className="p-3 text-right">နာရီ</th><th className="p-3 text-right">ဝင်ငွေ</th></tr></thead>
                        <tbody>{adminReport.fieldBreakdown.map(row => <tr key={row.key} className="border-t"><td className="p-3 font-bold text-gray-800">{row.label}</td><td className="p-3 text-center font-bold text-amber-700">{row.pending}</td><td className="p-3 text-center font-bold text-emerald-700">{row.approved}</td><td className="p-3 text-center font-bold text-red-600">{row.rejected}</td><td className="p-3 text-right font-bold text-blue-700">{row.approvedHours.toLocaleString()}</td><td className="p-3 text-right font-bold text-violet-700">{row.revenue.toLocaleString()} ကျပ်</td></tr>)}</tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="p-8 text-center text-sm text-gray-500">ရွေးထားသောရက်တွင် Booking မရှိသေးပါ။</p>
                  )}
                </div>
              </div>
            )}

            {adminTab === 'notifications_page' && (
              <div className="space-y-4">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gray-50 p-4 rounded-xl border">
                  <div>
                    <h3 className="text-base font-bold text-gray-800">🔔 Notifications Filter Page</h3>
                    <p className="text-xs text-gray-500"></p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1">
                      <label className="text-xs font-bold text-gray-700">Field:</label>
                      <select 
                        value={adminNotiFieldId} 
                        onChange={(e) => setAdminNotiFieldId(e.target.value)}
                        className="border rounded-lg p-2 text-xs bg-white font-bold"
                      >
                        <option value="all">ကွင်းအားလုံး (All Fields)</option>
                        {fields.map(f => (
                          <option key={f.id} value={f.id}>{f.name} ({f.location})</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-1">
                      <label className="text-xs font-bold text-gray-700">Date:</label>
                      <input 
                        type="date" 
                        value={adminNotiDate} 
                        onChange={(e) => setAdminNotiDate(e.target.value)}
                        className="border rounded-lg p-1.5 text-xs bg-white font-bold"
                      />
                    </div>

                    <div className="flex items-center gap-1">
                      <label className="text-xs font-bold text-gray-700">Filter By:</label>
                      <select 
                        value={notiFilterType} 
                        onChange={(e) => setNotiFilterType(e.target.value)}
                        className="border rounded-lg p-2 text-xs bg-white font-bold"
                      >
                        <option value="all">အားလုံးပြရန် (All)</option>
                        <option value="owner_update">Owner များ KPay/Wave ပြင်ဆင်ချက်များ</option>
                        <option value="booking">Booking အသစ်များနှင့် Status များ</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  {smsNotifications
                    .filter(n => {
                      if (notiFilterType !== 'all' && n.type !== notiFilterType) return false;
                      if (adminNotiFieldId !== 'all' && n.fieldId && n.fieldId !== adminNotiFieldId) return false;
                      if (adminNotiDate && n.date !== adminNotiDate) return false;
                      return true;
                    })
                    .length > 0 ? (
                      sortedNotifications
                        .filter(n => {
                          if (notiFilterType !== 'all' && n.type !== notiFilterType) return false;
                          if (adminNotiFieldId !== 'all' && n.fieldId && n.fieldId !== adminNotiFieldId) return false;
                          if (adminNotiDate && n.date !== adminNotiDate) return false;
                          return true;
                        })
                        .map(n => (
                          <div key={n.id} className="bg-white border rounded-xl p-4 shadow-sm flex justify-between items-start">
                            <div>
                              <p className="text-sm font-medium text-gray-800">{n.message}</p>
                              <div className="flex items-center gap-3 mt-2">
                                <span className="text-xs text-gray-400 font-mono">{n.date} {n.time}</span>
                                <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${n.type === 'owner_update' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                                  {n.type || 'general'}
                                </span>
                              </div>
                            </div>
                            <span className={`text-xs font-bold px-2 py-1 rounded ${n.read ? 'text-gray-500 bg-gray-100' : 'text-red-600 bg-red-50'}`}>
                              {n.read ? 'Read' : 'Unread'}
                            </span>
                          </div>
                        ))
                    ) : (
                      <p className="text-center py-12 text-gray-500 text-sm">ရွေးချယ်ထားသော Filter (ကွင်း၊ ရက်စွဲ၊ အမျိုးအစား) နှင့် ကိုက်ညီသော Notifications များ မရှိသေးပါ။</p>
                    )}
                </div>
              </div>
            )}

            {adminTab === 'pending' && (
              <div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
                  <h3 className="text-base font-bold text-gray-800">Booking မှတ်တမ်းများ ({adminHistoryBookings.length}{historyHasMore ? '+' : ''})</h3>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => printBookingHistory(adminHistoryBookings, 'admin')}
                      className="rounded-lg bg-slate-700 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-slate-800 active:scale-[0.98]"
                    >
                      🖨️ Print ထုတ်ရန်
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadHistoryExcel(adminHistoryBookings, 'admin')}
                      className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 active:scale-[0.98]"
                      title="Excel ဖြင့်ဖွင့်နိုင်သော CSV ဖိုင် ဒေါင်းလုဒ်ရန်"
                    >
                      📊 Excel Export
                    </button>
                  </div>
                </div>
                <div className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
                  <label className="flex min-w-[180px] flex-1 flex-col gap-1 text-xs font-bold text-gray-700">
                    History Date Filter
                    <input type="date" value={historyDate} onChange={(event) => setHistoryDate(event.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-normal outline-none focus:border-emerald-500" />
                  </label>
                  <button type="button" onClick={() => setHistoryDate('')} className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-gray-700 shadow-sm hover:bg-gray-100">All Dates</button>
                  <button type="button" disabled={historyPage === 0 || historyLoading} onClick={() => setHistoryPage((page) => Math.max(0, page - 1))} className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-gray-700 shadow-sm disabled:cursor-not-allowed disabled:opacity-40">← Previous</button>
                  <span className="px-1 py-2 text-xs font-bold text-gray-500">Page {historyPage + 1}</span>
                  <button type="button" disabled={!historyHasMore || historyLoading} onClick={() => setHistoryPage((page) => page + 1)} className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-gray-700 shadow-sm disabled:cursor-not-allowed disabled:opacity-40">Next →</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-100 text-xs border-b">
                        <th className="p-3 min-w-[170px]">ဖောက်သည်အမည် (Name)</th>
                        <th className="p-3 min-w-[135px]">Ph No</th>
                        <th className="p-3">ကွင်း / ကွင်းခွဲ</th>
                        <th className="p-3">တင်ချိန် (Booking Time)</th>
                        <th className="p-3">ကစားမည့်အချိန် (Play Time)</th>
                        <th className="p-3">Duration (ကြာချိန်)</th>
                        <th className="p-3">Price (သင့်ငွေ)</th>
                        <th className="p-3">ငွေပေးချေမှု / Txn</th>
                        <th className="p-3">Status</th>
                        <th className="p-3 text-center">လုပ်ဆောင်ချက် (Approve / Reject)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y text-sm">
                      {historyLoading ? (
                        <tr><td colSpan="10" className="p-8 text-center text-sm text-gray-500">History ဖတ်နေပါသည်...</td></tr>
                      ) : adminHistoryBookings.length > 0 ? (
                        adminHistoryBookings.map(item => {
                          const targetField = fields.find(f => f.id === item.fieldId);
                          const bookingExpired = isBookingExpired(item);
                          return (
                            <tr key={item.id} className="hover:bg-gray-50">
                              <td className="p-3 font-medium break-words">{getBookingCustomerName(item)}</td>
                              <td className="p-3 text-xs font-mono whitespace-nowrap">{getBookingCustomerPhone(item)}</td>
                              <td className="p-3">
                                <div className="font-bold">{targetField?.name || 'Unknown'}</div>
                                <div className="text-xs text-gray-500">{item.subFieldName}</div>
                              </td>
                              <td className="p-3 text-xs font-mono text-gray-500">
                                {item.bookedAt || '-'}
                              </td>
                              <td className="p-3 text-xs">
                                <div className="text-gray-700 font-bold">{item.date}</div>
                                <div className="font-bold text-emerald-600">{item.fullTimeSlot || item.timeSlot}</div>
                              </td>
                              <td className="p-3 text-xs">
                                <span className="font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded">{item.duration || '1 Hr'}</span>
                              </td>
                              <td className="p-3 text-xs">
                                <div className="font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded">{item.totalPrice ? `${Number(item.totalPrice).toLocaleString()} ကျပ်` : '-'}</div>
                                <div className="mt-1 text-[11px] font-bold text-amber-700">{getBookingPaymentPlanPercent(item)}% ပေးချေ · {getBookingPayableAmount(item) ? `${getBookingPayableAmount(item).toLocaleString()} ကျပ်` : '-'}</div>
                              </td>
                              <td className="p-3 text-xs">
                                <div className="uppercase font-bold">{item.paymentMethod}</div>
                                <div className="font-mono text-gray-600">Txn: {item.transactionLast5}</div>
                              </td>
                              <td className="p-3 font-bold text-xs">
                                <span className={item.status === 'Approved' ? 'text-emerald-600' : item.status === 'Rejected' ? 'text-red-500' : 'text-amber-500'}>{item.status}</span>
                              </td>
                              <td className="p-3 text-center space-x-1">
                                <button 
                                  type="button"
                                  disabled={bookingExpired}
                                  title={bookingExpired ? 'ဤ Booking အချိန်ကျော်လွန်သွားပါပြီ' : 'Approve'}
                                  onClick={() => handleStatusChangeWithConfirm(item.id, item.status, 'Approved', item.fieldId)} 
                                  className={`px-2.5 py-1 rounded text-[11px] font-bold ${bookingExpired ? 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-60' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
                                >
                                  Approve
                                </button>
                                <button 
                                  type="button"
                                  disabled={bookingExpired}
                                  title={bookingExpired ? 'ဤ Booking အချိန်ကျော်လွန်သွားပါပြီ' : 'Reject'}
                                  onClick={() => handleStatusChangeWithConfirm(item.id, item.status, 'Rejected', item.fieldId)} 
                                  className={`px-2.5 py-1 rounded text-[11px] font-bold ${bookingExpired ? 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-60' : 'bg-red-500 text-white hover:bg-red-600'}`}
                                >
                                  Reject
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan="10" className="text-center py-8 text-gray-500 text-sm">Booking များ မရှိသေးပါ။</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {adminTab === 'manage_fields' && (
              <div className="space-y-8">
                {editingFieldId ? (
                  <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-6 shadow-md">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-base font-bold text-amber-900">✏️ ကွင်းအချက်အလက် ပြင်ဆင်ရန် (Editing Field)</h3>
                      <button onClick={() => setEditingFieldId(null)} className="text-xs text-red-600 font-bold hover:underline">ပယ်ဖျက်ရန် (Cancel)</button>
                    </div>
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">ကွင်းအမည်</label>
                          <input type="text" value={editFieldName} onChange={(e) => setEditFieldName(e.target.value)} className="w-full border rounded-lg p-2.5 text-sm bg-white" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">မြို့နယ်</label>
                          <input type="text" value={editFieldLocation} onChange={(e) => setEditFieldLocation(e.target.value)} className="w-full border rounded-lg p-2.5 text-sm bg-white" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">လိပ်စာ အပြည့်အစုံ</label>
                          <input type="text" value={editFieldAddress} onChange={(e) => setEditFieldAddress(e.target.value)} className="w-full border rounded-lg p-2.5 text-sm bg-white" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">ဖုန်းနံပါတ်</label>
                          <input type="text" value={editFieldPhone} onChange={(e) => setEditFieldPhone(e.target.value)} className="w-full border rounded-lg p-2.5 text-sm bg-white" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">ကွင်းဖွင့်ချိန် (Open Hour - 24 Hours format)</label>
                          <input type="number" min="0" max="23" value={editFieldOpenHour} onChange={(e) => setEditFieldOpenHour(e.target.value)} className="w-full border rounded-lg p-2.5 text-sm bg-white" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">ကွင်းပိတ်ချိန် (Close Hour - 24 Hours format)</label>
                          <input type="number" min="1" max="24" value={editFieldCloseHour} onChange={(e) => setEditFieldCloseHour(e.target.value)} className="w-full border rounded-lg p-2.5 text-sm bg-white" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">KPay No ထည့်ရန်</label>
                          <input type="text" value={editFieldKpay} onChange={(e) => setEditFieldKpay(e.target.value)} placeholder="09-xxxxxxxxx (KPay)" className="w-full border rounded-lg p-2.5 text-sm bg-white" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">Wave No ထည့်ရန်</label>
                          <input type="text" value={editFieldWave} onChange={(e) => setEditFieldWave(e.target.value)} placeholder="09-xxxxxxxxx (Wave)" className="w-full border rounded-lg p-2.5 text-sm bg-white" />
                        </div>
                      </div>

                      <div className="border-t pt-4">
                        <h4 className="text-sm font-bold mb-3 text-gray-800">ကွင်းခွဲများ (Sub-Fields) နှင့် ကွင်းခွဲအလိုက် အချိန်များ ပြင်ဆင်ရန်</h4>
                        <div className="space-y-3 mb-4">
                          {editSubFields.map((sf, index) => (
                            <div key={sf.id || index} className="bg-white p-3 rounded-lg border space-y-2">
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                <input 
                                  type="text" 
                                  value={sf.name} 
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setEditSubFields(prev => prev.map((item, idx) => idx === index ? { ...item, name: val } : item));
                                  }} 
                                  placeholder="ကွင်းခွဲအမည်" 
                                  className="border rounded p-2 text-xs" 
                                />
                                <input 
                                  type="number" 
                                  value={sf.price} 
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setEditSubFields(prev => prev.map((item, idx) => idx === index ? { ...item, price: parseFloat(val) || 0 } : item));
                                  }} 
                                  placeholder="ဈေးနှုန်း" 
                                  className="border rounded p-2 text-xs" 
                                />
                                <select 
                                  value={sf.status} 
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setEditSubFields(prev => prev.map((item, idx) => idx === index ? { ...item, status: val } : item));
                                  }} 
                                  className="border rounded p-2 text-xs"
                                >
                                  <option value="Active">Active</option>
                                  <option value="Inactive">Inactive</option>
                                </select>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-center pt-1">
                                <div className="flex items-center gap-1">
                                  <label className="text-[11px] font-bold text-gray-600">ဖွင့်ချိန်:</label>
                                  <input 
                                    type="number" 
                                    min="0" 
                                    max="23" 
                                    value={sf.openHour !== undefined ? sf.openHour : editFieldOpenHour} 
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setEditSubFields(prev => prev.map((item, idx) => idx === index ? { ...item, openHour: parseInt(val) || 0 } : item));
                                    }} 
                                    className="border rounded p-1 text-xs w-full" 
                                  />
                                </div>
                                <div className="flex items-center gap-1">
                                  <label className="text-[11px] font-bold text-gray-600">ပိတ်ချိန်:</label>
                                  <input 
                                    type="number" 
                                    min="1" 
                                    max="24" 
                                    value={sf.closeHour !== undefined ? sf.closeHour : editFieldCloseHour} 
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setEditSubFields(prev => prev.map((item, idx) => idx === index ? { ...item, closeHour: parseInt(val) || 22 } : item));
                                    }} 
                                    className="border rounded p-1 text-xs w-full" 
                                  />
                                </div>
                                <div className="flex justify-end">
                                  <button 
                                    type="button" 
                                    onClick={() => setEditSubFields(prev => prev.filter((_, idx) => idx !== index))} 
                                    className="bg-red-500 text-white px-3 py-1 rounded text-xs font-bold"
                                  >
                                    ကွင်းခွဲဖယ်ရန်
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        <button 
                          type="button" 
                          onClick={() => setEditSubFields(prev => [...prev, { id: 'sf_' + Date.now(), name: 'New SubField', price: 35000, openHour: parseInt(editFieldOpenHour), closeHour: parseInt(editFieldCloseHour), status: 'Active' }])}
                          className="bg-blue-600 text-white px-3 py-1.5 rounded text-xs font-bold mb-4"
                        >
                          + ကွင်းခွဲအသစ် ထပ်ထည့်ရန်
                        </button>
                      </div>

                      <button onClick={handleSaveEditedField} className="w-full bg-amber-600 text-white py-3 rounded-lg text-sm font-bold shadow hover:bg-amber-700">ပြင်ဆင်မှုများကို သိမ်းဆည်းမည် (Save Changes)</button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-50 border rounded-2xl p-6">
                    <h3 className="text-base font-bold mb-4 text-gray-800">🏟️ ကွင်းအသစ် ထည့်သွင်းရန်</h3>
                    <form onSubmit={handleCreateNewField} className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">ကွင်းအမည်</label>
                          <input type="text" placeholder="ဥပမာ - YUFC Football" value={newFieldName} onChange={(e) => setNewFieldName(e.target.value)} className="w-full border rounded-lg p-2.5 text-sm bg-white" required />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">မြို့နယ်</label>
                          <input type="text" placeholder="ဥပမာ - လှိုင်မြို့နယ်" value={newFieldLocation} onChange={(e) => setNewFieldLocation(e.target.value)} className="w-full border rounded-lg p-2.5 text-sm bg-white" required />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">လိပ်စာ အပြည့်အစုံ</label>
                          <input type="text" placeholder="လိပ်စာ" value={newFieldAddress} onChange={(e) => setNewFieldAddress(e.target.value)} className="w-full border rounded-lg p-2.5 text-sm bg-white" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">ဖုန်းနံပါတ်</label>
                          <input type="text" placeholder="09xxxxxxxxx" value={newFieldPhone} onChange={(e) => setNewFieldPhone(e.target.value)} className="w-full border rounded-lg p-2.5 text-sm bg-white" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">ကွင်းဖွင့်ချိန် (Open Hour - 24 Hours format)</label>
                          <input type="number" min="0" max="23" value={newFieldOpenHour} onChange={(e) => setNewFieldOpenHour(e.target.value)} className="w-full border rounded-lg p-2.5 text-sm bg-white" required />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">ကွင်းပိတ်ချိန် (Close Hour - 24 Hours format)</label>
                          <input type="number" min="1" max="24" value={newFieldCloseHour} onChange={(e) => setNewFieldCloseHour(e.target.value)} className="w-full border rounded-lg p-2.5 text-sm bg-white" required />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">KPay No ထည့်ရန်</label>
                          <input type="text" value={newFieldKpay} onChange={(e) => setNewFieldKpay(e.target.value)} placeholder="09-xxxxxxxxx (KPay)" className="w-full border rounded-lg p-2.5 text-sm bg-white" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">Wave No ထည့်ရန်</label>
                          <input type="text" value={newFieldWave} onChange={(e) => setNewFieldWave(e.target.value)} placeholder="09-xxxxxxxxx (Wave)" className="w-full border rounded-lg p-2.5 text-sm bg-white" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">Owner Email (Login ဝင်ရန်)</label>
                          <input type="email" placeholder="owner@gmail.com" value={newOwnerEmail} onChange={(e) => setNewOwnerEmail(e.target.value)} className="w-full border rounded-lg p-2.5 text-sm bg-white" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">Owner Password</label>
                          <input type="text" placeholder="owner password" value={newOwnerPassword} onChange={(e) => setNewOwnerPassword(e.target.value)} className="w-full border rounded-lg p-2.5 text-sm bg-white" />
                        </div>
                      </div>

                      <div className="border-t pt-4 mt-4">
                        <h4 className="text-sm font-bold mb-3 text-gray-800">ကွင်းခွဲများ (Sub-Fields) နှင့် ကွင်းခွဲအလိုက် အချိန်များ ထည့်ရန်</h4>
                        <div className="grid grid-cols-1 md:grid-cols-6 gap-2 mb-3 items-end">
                          <div className="md:col-span-2">
                            <label className="block text-[11px] font-bold text-gray-600 mb-1">ကွင်းခွဲအမည်</label>
                            <input type="text" placeholder="ဥပမာ - Field A" value={newSubFieldName} onChange={(e) => setNewSubFieldName(e.target.value)} className="border rounded-lg p-2 text-sm bg-white w-full" />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-gray-600 mb-1">ဈေးနှုန်း (ကျပ်)</label>
                            <input type="number" placeholder="ဈေးနှုန်း" value={newSubFieldPrice} onChange={(e) => setNewSubFieldPrice(e.target.value)} className="border rounded-lg p-2 text-sm bg-white w-full" />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-gray-600 mb-1">ဖွင့်ချိန်</label>
                            <input type="number" min="0" max="23" value={newSubFieldOpenHour} onChange={(e) => setNewSubFieldOpenHour(e.target.value)} className="border rounded-lg p-2 text-sm bg-white w-full" />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-gray-600 mb-1">ပိတ်ချိန်</label>
                            <input type="number" min="1" max="24" value={newSubFieldCloseHour} onChange={(e) => setNewSubFieldCloseHour(e.target.value)} className="border rounded-lg p-2 text-sm bg-white w-full" />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-gray-600 mb-1">Status</label>
                            <select value={newSubFieldStatus} onChange={(e) => setNewSubFieldStatus(e.target.value)} className="border rounded-lg p-2 text-sm bg-white w-full">
                              <option value="Active">Active</option>
                              <option value="Inactive">Inactive</option>
                            </select>
                          </div>
                        </div>
                        <div className="mb-4">
                          <button type="button" onClick={handleAddOwnerSubField} className="bg-blue-600 text-white rounded-lg px-4 py-2 text-xs font-bold hover:bg-blue-700">+ ကွင်းခွဲ ထည့်မည်</button>
                        </div>

                        {ownerSubFields.length > 0 && (
                          <div className="bg-white p-3 rounded-lg border space-y-2">
                            {ownerSubFields.map(sf => (
                              <div key={sf.id} className="flex justify-between items-center text-xs bg-gray-50 p-2 rounded">
                                <span><b>{sf.name}</b> - {sf.price} ကျပ် (ဖွင့်ချိန်: {format12Hour(sf.openHour)} ~ {format12Hour(sf.closeHour)}) [{sf.status}]</span>
                                <button type="button" onClick={() => setOwnerSubFields(prev => prev.filter(x => x.id !== sf.id))} className="text-red-500 font-bold">ဖယ်ရှားမည်</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <button type="submit" className="w-full bg-emerald-600 text-white py-3 rounded-lg text-sm font-bold shadow hover:bg-emerald-700">ကွင်းအသစ်ကို သိမ်းဆည်းမည်</button>
                    </form>
                  </div>
                )}

                <div>
                  <h3 className="text-base font-bold mb-4 text-gray-800">လက်ရှိ ကွင်းများစာရင်း</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    {fields.map(f => (
                      <div key={f.id} className="bg-white border rounded-xl p-4 shadow-sm flex flex-col justify-between">
                        <div>
                          <div className="flex justify-between items-start">
                            <h4 className="font-bold text-base text-gray-800">{f.name}</h4>
                            <span className="text-xs bg-gray-100 px-2 py-1 rounded font-medium">{f.location}</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">{f.address} | Tel: {f.phone}</p>
                          <p className="text-xs text-emerald-700 font-bold mt-1">🕒 ကွင်းဖွင့်ချိန်: {format12Hour(f.openHour ?? 8)} မှ {format12Hour(f.closeHour ?? 22)} ထိ</p>
                          <div className="mt-2 text-xs text-gray-600 space-y-0.5">
                            <p>💳 <b>KPay:</b> {f.paymentInfo?.kpay || 'မထည့်ရသေးပါ'}</p>
                            <p>💳 <b>Wave:</b> {f.paymentInfo?.wave || 'မထည့်ရသေးပါ'}</p>
                          </div>
                          <div className="mt-3 space-y-1">
                            {f.subFields.map(sf => (
                              <div key={sf.id} className="text-xs bg-gray-50 p-2 rounded flex justify-between items-center">
                                <span><b>{sf.name}</b> ({sf.price} ကျပ်) - <span className="text-emerald-700 font-bold">{format12Hour(sf.openHour !== undefined ? sf.openHour : (f.openHour ?? 8))} ~ {format12Hour(sf.closeHour !== undefined ? sf.closeHour : (f.closeHour ?? 22))}</span></span>
                                <span className={sf.status === 'Active' ? 'text-emerald-600 font-bold' : 'text-red-500 font-bold'}>{sf.status}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="flex justify-end space-x-2 mt-4 pt-3 border-t">
                          <button onClick={() => handleStartEditField(f)} className="bg-amber-500 text-white px-3 py-1.5 rounded text-xs font-bold hover:bg-amber-600">✏️ ပြင်ဆင်ရန်</button>
                          <button onClick={() => handleAdminDeleteOwnerField(f.id)} className="bg-red-500 text-white px-3 py-1.5 rounded text-xs font-bold hover:bg-red-600">🗑️ ဖျက်ရန်</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {adminTab === 'manage_owners' && (
              <div>
                <h3 className="text-base font-bold mb-4 text-gray-800">🔑 Owner အကောင့်များနှင့် Status များ စီမံရန်</h3>
                <div className="space-y-4">
                  {fields.map(f => (
                    <div key={f.id} className="bg-gray-50 border rounded-xl p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                      <div>
                        <h4 className="font-bold text-sm text-gray-800">{f.name} ({f.location})</h4>
                        <p className="text-xs text-gray-500">Current Owner Email: {f.ownerEmail || 'None'}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                        <input 
                          type="email" 
                          defaultValue={f.ownerEmail || ''} 
                          id={`email_${f.id}`}
                          placeholder="Owner Email" 
                          className="border rounded px-2 py-1 text-xs bg-white" 
                        />
                        <input 
                          type="text" 
                          defaultValue={f.ownerPassword || ''} 
                          id={`pass_${f.id}`}
                          placeholder="Password" 
                          className="border rounded px-2 py-1 text-xs bg-white" 
                        />
                        <select defaultValue={f.ownerStatus || 'Active'} id={`status_${f.id}`} className="border rounded px-2 py-1 text-xs bg-white">
                          <option value="Active">Active</option>
                          <option value="Disabled">Disabled</option>
                        </select>
                        <button 
                          onClick={() => {
                            const eVal = document.getElementById(`email_${f.id}`).value;
                            const pVal = document.getElementById(`pass_${f.id}`).value;
                            const sVal = document.getElementById(`status_${f.id}`).value;
                            handleAdminUpdateOwnerInfo(f.id, eVal, pVal, sVal);
                          }} 
                          className="bg-emerald-600 text-white px-3 py-1 rounded text-xs font-bold"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : currentUser.role === 'owner' && activeTab === 'owner_manage' ? (
          <div className="bg-white rounded-xl shadow p-4 sm:p-6">
            <div className="flex flex-col items-start gap-3 mb-6 border-b pb-4 sm:flex-row sm:justify-between sm:items-center">
              <h2 className="text-lg sm:text-xl font-bold text-gray-800">🏟️ Owner Dashboard & Direct Booking</h2>
              <button onClick={() => { setActiveTab('fields'); setOwnerMobileMenuOpen(false); }} className="hidden sm:inline-flex w-full sm:w-auto bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold">← ကွင်းများသို့ ပြန်ရန်</button>
            </div>

            <div className="field-mobile-duplicate-meta mb-6 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-emerald-700">လက်ရှိရွေးချယ်ထားသော Function</p>
              <p className="mt-1 text-sm font-extrabold text-emerald-900">
                {ownerActiveTab === 'pending' ? 'Booking တင်ရန် (Direct Booking)' : ownerActiveTab === 'history' ? 'Booking မှတ်တမ်းများ' : ownerActiveTab === 'report' ? '📊 My Fields Report' : ownerActiveTab === 'notifications_page' ? '🔔 Notifications Page' : ownerActiveTab === 'password' ? '🔒 Password ချိန်းရန်' : '🏟️ ကွင်းအချိန်များနှင့် KPay/Wave နံပါတ်များ ပြင်ဆင်ရန်'}
              </p>
            </div>

            {ownerActiveTab === 'report' && (
              <div className="space-y-5">
                <div className="flex flex-col gap-4 rounded-2xl border bg-gray-50 p-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h3 className="text-base font-extrabold text-gray-800">📊 My Fields Booking Report</h3>
                    <p className="mt-1 text-xs text-gray-500"></p>
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="text-xs font-bold text-gray-700">
                      Date
                      <input type="date" value={ownerReportDate} onChange={(e) => setOwnerReportDate(e.target.value)} className="mt-1 block rounded-lg border bg-white p-2 text-xs font-bold" />
                    </label>
                    <button type="button" onClick={() => setOwnerReportDate(new Date().toISOString().slice(0, 10))} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700">ယနေ့</button>
                  </div>
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  နာရီစုစုပေါင်းနှင့် ဝင်ငွေကို <strong>Approved Booking</strong> များအတွက်သာတွက်ထားပါသည်။
                </div>

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><p className="text-[11px] font-bold text-amber-700">Pending</p><p className="mt-1 text-2xl font-extrabold text-amber-800">{ownerReport.statusCounts.pending}</p></div>
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-[11px] font-bold text-emerald-700">Approved</p><p className="mt-1 text-2xl font-extrabold text-emerald-800">{ownerReport.statusCounts.approved}</p></div>
                  <div className="rounded-2xl border border-red-200 bg-red-50 p-4"><p className="text-[11px] font-bold text-red-700">Rejected</p><p className="mt-1 text-2xl font-extrabold text-red-800">{ownerReport.statusCounts.rejected}</p></div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-[11px] font-bold text-slate-600">Total Bookings</p><p className="mt-1 text-2xl font-extrabold text-slate-800">{ownerReport.total}</p></div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4"><p className="text-xs font-bold text-blue-700">Approved ငှားရမ်းနာရီ</p><p className="mt-1 text-2xl font-extrabold text-blue-900">{ownerReport.approvedHours.toLocaleString()} နာရီ</p></div>
                  <div className="rounded-2xl border border-green-200 bg-green-50 p-4"><p className="text-xs font-bold text-green-700">Approved KPay</p><p className="mt-1 text-2xl font-extrabold text-green-900">{ownerReport.paymentRevenue.kpay.toLocaleString()} ကျပ်</p></div>
                  <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4"><p className="text-xs font-bold text-sky-700">Approved Cash</p><p className="mt-1 text-2xl font-extrabold text-sky-900">{ownerReport.paymentRevenue.cash.toLocaleString()} ကျပ်</p></div>
                  <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4"><p className="text-xs font-bold text-indigo-700">Approved Wave</p><p className="mt-1 text-2xl font-extrabold text-indigo-900">{ownerReport.paymentRevenue.wave.toLocaleString()} ကျပ်</p></div>
                  <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 sm:col-span-2 lg:col-span-2"><p className="text-xs font-bold text-violet-700">Approved ဝင်ငွေ Total</p><p className="mt-1 text-2xl font-extrabold text-violet-900">{ownerReport.paymentRevenue.total.toLocaleString()} ကျပ်</p></div>
                </div>

                <div className="rounded-2xl border bg-white">
                  <div className="border-b bg-gray-50 p-4"><h4 className="text-sm font-extrabold text-gray-800">ကွင်း / ကွင်းခွဲအလိုက်</h4><p className="mt-1 text-xs text-gray-500">{ownerReportDate} တွင် ပါဝင်သော Owner Fields Booking များ</p></div>
                  {ownerReport.fieldBreakdown.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-[720px] w-full text-left text-xs">
                        <thead className="bg-gray-100 text-gray-700"><tr><th className="p-3">ကွင်း / ကွင်းခွဲ</th><th className="p-3 text-center">Pending</th><th className="p-3 text-center">Approved</th><th className="p-3 text-center">Rejected</th><th className="p-3 text-right">နာရီ</th><th className="p-3 text-right">ဝင်ငွေ</th></tr></thead>
                        <tbody>{ownerReport.fieldBreakdown.map(row => <tr key={row.key} className="border-t"><td className="p-3 font-bold text-gray-800">{row.label}</td><td className="p-3 text-center font-bold text-amber-700">{row.pending}</td><td className="p-3 text-center font-bold text-emerald-700">{row.approved}</td><td className="p-3 text-center font-bold text-red-600">{row.rejected}</td><td className="p-3 text-right font-bold text-blue-700">{row.approvedHours.toLocaleString()}</td><td className="p-3 text-right font-bold text-violet-700">{row.revenue.toLocaleString()} ကျပ်</td></tr>)}</tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="p-8 text-center text-sm text-gray-500">ရွေးထားသောရက်တွင် ကွင်းများအတွက် Booking မရှိသေးပါ။</p>
                  )}
                </div>
              </div>
            )}

            {ownerActiveTab === 'notifications_page' && (
              <div className="space-y-4">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gray-50 p-4 rounded-xl border">
                  <div>
                    <h3 className="text-base font-bold text-gray-800">🔔 Owner Notifications Page</h3>
                    <p className="text-xs text-gray-500"></p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1">
                      <label className="text-xs font-bold text-gray-700">Field:</label>
                      <select 
                        value={ownerNotiFieldId} 
                        onChange={(e) => setOwnerNotiFieldId(e.target.value)}
                        className="border rounded-lg p-2 text-xs bg-white font-bold"
                      >
                        <option value="all">ကွင်းများအားလုံး (All My Fields)</option>
                        {fields.filter(f => (f.ownerEmail === currentUser.email || f.ownerEmail?.toLowerCase() === currentUser.email?.toLowerCase() || f.ownerUid === currentUser.uid || f.ownerId === currentUser.uid)).map(f => (
                          <option key={f.id} value={f.id}>{f.name} ({f.location})</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-1">
                      <label className="text-xs font-bold text-gray-700">Date:</label>
                      <input 
                        type="date" 
                        value={ownerNotiDate} 
                        onChange={(e) => setOwnerNotiDate(e.target.value)}
                        className="border rounded-lg p-1.5 text-xs bg-white font-bold"
                      />
                    </div>

                    <div className="flex items-center gap-1">
                      <label className="text-xs font-bold text-gray-700">Filter:</label>
                      <select 
                        value={ownerNotiFilterType} 
                        onChange={(e) => setOwnerNotiFilterType(e.target.value)}
                        className="border rounded-lg p-2 text-xs bg-white font-bold"
                      >
                        <option value="all">အားလုံးပြရန် (All - New, Pending, Reject)</option>
                        <option value="new_booking">New Booking များ</option>
                        <option value="booking_pending">Booking Pending များ</option>
                        <option value="booking_reject">Booking Reject များ</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  {smsNotifications
                    .filter(n => {
                      const isBookingRelated = n.type === 'booking' || n.subType === 'new_booking' || n.subType === 'booking_pending' || n.subType === 'booking_reject';
                      if (!isBookingRelated) return false;

                      const myFieldIds = fields.filter(f => (f.ownerEmail === currentUser.email || f.ownerEmail?.toLowerCase() === currentUser.email?.toLowerCase() || f.ownerUid === currentUser.uid || f.ownerId === currentUser.uid)).map(f => f.id);
                      if (n.fieldId && !myFieldIds.includes(n.fieldId)) return false;
                      if (ownerNotiFieldId !== 'all' && n.fieldId && n.fieldId !== ownerNotiFieldId) return false;

                      if (ownerNotiDate && n.date !== ownerNotiDate) return false;

                      if (ownerNotiFilterType === 'all') {
                        return n.subType === 'new_booking' || n.subType === 'booking_pending' || n.subType === 'booking_reject' || !n.subType;
                      }
                      return n.subType === ownerNotiFilterType;
                    })
                    .length > 0 ? (
                      sortedNotifications
                        .filter(n => {
                          const isBookingRelated = n.type === 'booking' || n.subType === 'new_booking' || n.subType === 'booking_pending' || n.subType === 'booking_reject';
                          if (!isBookingRelated) return false;

                          const myFieldIds = fields.filter(f => (f.ownerEmail === currentUser.email || f.ownerEmail?.toLowerCase() === currentUser.email?.toLowerCase() || f.ownerUid === currentUser.uid || f.ownerId === currentUser.uid)).map(f => f.id);
                          if (n.fieldId && !myFieldIds.includes(n.fieldId)) return false;
                          if (ownerNotiFieldId !== 'all' && n.fieldId && n.fieldId !== ownerNotiFieldId) return false;

                          if (ownerNotiDate && n.date !== ownerNotiDate) return false;

                          if (ownerNotiFilterType === 'all') {
                            return n.subType === 'new_booking' || n.subType === 'booking_pending' || n.subType === 'booking_reject' || !n.subType;
                          }
                          return n.subType === ownerNotiFilterType;
                        })
                        .map(n => (
                          <div key={n.id} className="bg-white border rounded-xl p-4 shadow-sm flex justify-between items-start">
                            <div>
                              <p className="text-sm font-medium text-gray-800">{n.message}</p>
                              <div className="flex items-center gap-3 mt-2">
                                <span className="text-xs text-gray-400 font-mono">{n.date} {n.time}</span>
                                <span className="text-[10px] px-2 py-0.5 rounded font-bold uppercase bg-emerald-100 text-emerald-800">
                                  {n.subType || 'booking'}
                                </span>
                              </div>
                            </div>
                            <span className={`text-xs font-bold px-2 py-1 rounded ${n.read ? 'text-gray-500 bg-gray-100' : 'text-red-600 bg-red-50'}`}>
                              {n.read ? 'Read' : 'Unread'}
                            </span>
                          </div>
                        ))
                    ) : (
                      <p className="text-center py-12 text-gray-500 text-sm">ရွေးချယ်ထားသော Filter နှင့် ကိုက်ညီသော Notifications များ မရှိသေးပါ။</p>
                    )}
                </div>
              </div>
            )}

            {ownerActiveTab === 'password' && (
              <div className="bg-gray-50 border rounded-2xl p-6 max-w-md">
                <h3 className="text-lg font-bold mb-4 text-gray-800">🔒 Change Password (Password ပြောင်းရန်)</h3>
                <form onSubmit={handleChangeMyPassword} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Password အဟောင်း (Current Password)</label>
                    <input type="password" value={oldPasswordInput} onChange={(e) => setOldPasswordInput(e.target.value)} className="w-full border rounded-lg p-2.5 text-sm bg-white font-mono" required placeholder="••••••••" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Password အသစ် (New Password - အနည်းဆုံး ၆ လုံး)</label>
                    <input type="password" value={newPasswordInput} onChange={(e) => setNewPasswordInput(e.target.value)} className="w-full border rounded-lg p-2.5 text-sm bg-white font-mono" required placeholder="••••••••" />
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <button type="submit" className="bg-emerald-600 text-white px-4 py-2.5 rounded-lg text-xs font-bold hover:bg-emerald-700 transition">Password ပြောင်းမည်</button>
                    <button type="button" onClick={handleForgotPassword} className="text-xs text-blue-600 font-bold hover:underline">Password မေ့နေပါသလား? (Forgot)</button>
                  </div>
                </form>
              </div>
            )}

            {ownerActiveTab === 'fields_edit' && (
              <div className="space-y-6 max-w-2xl">
                <h3 className="text-lg font-bold mb-4 text-gray-800">ကွင်းအချိန်များနှင့် ကွင်းခွဲအလိုက် အချိန်များကို ပြင်ဆင်ရန်</h3>
                
                {editingOwnerFieldId ? (
                  <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 shadow-sm mb-4">
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="font-bold text-sm text-amber-900">✏️ ကွင်းပြင်ဆင်နေသည်</h4>
                      <button onClick={() => setEditingOwnerFieldId(null)} className="text-xs text-red-600 font-bold hover:underline">Cancel</button>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">ကွင်းအမည်</label>
                        <input type="text" value={ownerEditFieldName} onChange={(e) => setOwnerEditFieldName(e.target.value)} className="w-full border rounded p-2 text-xs bg-white" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">မြို့နယ်</label>
                        <input type="text" value={ownerEditFieldLocation} onChange={(e) => setOwnerEditFieldLocation(e.target.value)} className="w-full border rounded p-2 text-xs bg-white" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">ကွင်းဖုန်းနံပါတ် (Field Phone No)</label>
                        <input type="text" value={ownerEditFieldPhone} onChange={(e) => setOwnerEditFieldPhone(e.target.value)} placeholder="09-xxxxxxxxx" className="w-full border rounded p-2 text-xs bg-white" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">ကွင်းဖွင့်ချိန် (Open Hour)</label>
                          <input type="number" min="0" max="23" value={ownerEditFieldOpenHour} onChange={(e) => setOwnerEditFieldOpenHour(e.target.value)} className="w-full border rounded p-2 text-xs bg-white" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">ကွင်းပိတ်ချိန် (Close Hour)</label>
                          <input type="number" min="1" max="24" value={ownerEditFieldCloseHour} onChange={(e) => setOwnerEditFieldCloseHour(e.target.value)} className="w-full border rounded p-2 text-xs bg-white" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">KPay No (User ဘက်တွင်ပေါ်မည့်နံပါတ်)</label>
                        <input type="text" value={ownerEditFieldKpay} onChange={(e) => setOwnerEditFieldKpay(e.target.value)} placeholder="09-xxxxxxxxx (KPay)" className="w-full border rounded p-2 text-xs bg-white" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Wave No (User ဘက်တွင်ပေါ်မည့်နံပါတ်)</label>
                        <input type="text" value={ownerEditFieldWave} onChange={(e) => setOwnerEditFieldWave(e.target.value)} placeholder="09-xxxxxxxxx (Wave)" className="w-full border rounded p-2 text-xs bg-white" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">ကွင်းအခြေအနေ (Field Status)</label>
                        <select value={ownerEditFieldStatus} onChange={(e) => setOwnerEditFieldStatus(e.target.value)} className="w-full border rounded p-2 text-xs bg-white">
                          <option value="Active">Active (ဖွင့်)</option>
                          <option value="Disabled">Disabled / Inactive (ပိတ်)</option>
                        </select>
                      </div>

                      <div className="border-t pt-3">
                        <h5 className="font-bold text-xs text-gray-800 mb-2">ကွင်းခွဲများ (Sub-Fields) နှင့် ကွင်းခွဲအလိုက် အချိန်များ စီမံရန်</h5>
                        <div className="space-y-3 mb-3">
                          {ownerEditSubFields.map((sf, index) => (
                            <div key={sf.id || index} className="bg-white p-3 rounded border space-y-2">
                              <div className="grid grid-cols-2 gap-2">
                                <input 
                                  type="text" 
                                  value={sf.name} 
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setOwnerEditSubFields(prev => prev.map((item, idx) => idx === index ? { ...item, name: val } : item));
                                  }} 
                                  placeholder="ကွင်းခွဲအမည်" 
                                  className="border rounded p-1.5 text-xs" 
                                />
                                <input 
                                  type="number" 
                                  value={sf.price} 
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setOwnerEditSubFields(prev => prev.map((item, idx) => idx === index ? { ...item, price: parseFloat(val) || 0 } : item));
                                  }} 
                                  placeholder="ဈေးနှုန်း" 
                                  className="border rounded p-1.5 text-xs" 
                                />
                              </div>
                              <div className="grid grid-cols-3 gap-2 items-center">
                                <div>
                                  <label className="block text-[10px] font-bold text-gray-600">ကွင်းခွဲဖွင့်ချိန်:</label>
                                  <input 
                                    type="number" 
                                    min="0" 
                                    max="23" 
                                    value={sf.openHour !== undefined ? sf.openHour : ownerEditFieldOpenHour} 
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setOwnerEditSubFields(prev => prev.map((item, idx) => idx === index ? { ...item, openHour: parseInt(val) || 0 } : item));
                                    }} 
                                    className="border rounded p-1 text-xs w-full" 
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-gray-600">ကွင်းခွဲပိတ်ချိန်:</label>
                                  <input 
                                    type="number" 
                                    min="1" 
                                    max="24" 
                                    value={sf.closeHour !== undefined ? sf.closeHour : ownerEditFieldCloseHour} 
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setOwnerEditSubFields(prev => prev.map((item, idx) => idx === index ? { ...item, closeHour: parseInt(val) || 22 } : item));
                                    }} 
                                    className="border rounded p-1 text-xs w-full" 
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-gray-600">Status:</label>
                                  <select 
                                    value={sf.status} 
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setOwnerEditSubFields(prev => prev.map((item, idx) => idx === index ? { ...item, status: val } : item));
                                    }} 
                                    className="border rounded p-1 text-xs w-full"
                                  >
                                    <option value="Active">Active</option>
                                    <option value="Inactive">Disable</option>
                                  </select>
                                </div>
                              </div>
                              <div className="flex justify-end pt-1">
                                <button 
                                  type="button" 
                                  onClick={() => setOwnerEditSubFields(prev => prev.filter((_, idx) => idx !== index))} 
                                  className="bg-red-500 text-white px-2 py-1 rounded text-[10px] font-bold"
                                >
                                  ကွင်းခွဲဖျက်ရန်
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                        <button 
                          type="button" 
                          onClick={() => setOwnerEditSubFields(prev => [...prev, { id: 'sf_' + Date.now(), name: 'New SubField', price: 35000, openHour: parseInt(ownerEditFieldOpenHour), closeHour: parseInt(ownerEditFieldCloseHour), status: 'Active' }])}
                          className="bg-blue-600 text-white px-3 py-1.5 rounded text-xs font-bold mb-3"
                        >
                          + ကွင်းခွဲ အသစ်ထည့်ရန်
                        </button>
                      </div>

                      <button onClick={handleSaveOwnerEditedField} className="w-full bg-amber-600 text-white py-2.5 rounded text-xs font-bold">ပြင်ဆင်မှု သိမ်းဆည်းမည်</button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {fields.filter(f => (f.ownerEmail === currentUser.email || f.ownerEmail?.toLowerCase() === currentUser.email?.toLowerCase() || f.ownerUid === currentUser.uid || f.ownerId === currentUser.uid)).map(f => (
                      <div key={f.id} className="bg-gray-50 border rounded-xl p-4 flex justify-between items-center">
                        <div>
                          <h4 className="font-bold text-sm text-gray-800">{f.name} ({f.location})</h4>
                          <p className="text-xs text-gray-500">KPay: {f.paymentInfo?.kpay} | Wave: {f.paymentInfo?.wave}</p>
                        </div>
                        <button onClick={() => handleStartEditOwnerField(f)} className="bg-emerald-600 text-white px-3 py-1.5 rounded text-xs font-bold">✏️ အချိန်နှင့် အချက်အလက် ပြင်ဆင်ရန်</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {ownerActiveTab === 'pending' && (
              <div>
                <h3 className="text-base font-bold mb-4 text-gray-800">🏟️ Direct Booking တင်ရန် (Owner Manual Booking)</h3>
                <p className="text-xs text-gray-500 mb-4"> ဖုန်းဖြင့်ဖြစ်စေ၊ လူကိုယ်တိုင်ဖြစ်စေ လာရောက် booking တင်သည်များကို ဤနေရာမှ တိုက်ရိုက်ထည့်သွင်းနိုင်ပါသည်။ </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4 bg-gray-50 p-4 rounded-xl border">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">ကွင်းရွေးချယ်ရန်</label>
                      <select 
                        value={userSelectedField?.id || ''} 
                        onChange={(e) => {
                          const found = fields.find(f => f.id === e.target.value);
                          setUserSelectedField(found || null);
                          setSelectedSubField(null);
                        }}
                        className="w-full border rounded-lg p-2.5 text-sm bg-white"
                      >
                        <option value="">-- ကွင်းရွေးပါ --</option>
                        {fields.filter(f => (f.ownerEmail === currentUser.email || f.ownerEmail?.toLowerCase() === currentUser.email?.toLowerCase() || f.ownerUid === currentUser.uid || f.ownerId === currentUser.uid)).map(f => (
                          <option key={f.id} value={f.id}>{f.name} ({f.location})</option>
                        ))}
                      </select>
                    </div>

                    {userSelectedField && (
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">ကွင်းခွဲရွေးချယ်ရန် (Sub-Field)</label>
                        <select 
                          value={selectedSubField?.id || ''} 
                          onChange={(e) => {
                            const foundSf = userSelectedField.subFields.find(sf => sf.id === e.target.value);
                            setSelectedSubField(foundSf || null);
                          }}
                          className="w-full border rounded-lg p-2.5 text-sm bg-white"
                        >
                          <option value="">-- ကွင်းခွဲရွေးပါ --</option>
                          {userSelectedField.subFields.map(sf => (
                            <option key={sf.id} value={sf.id}>{sf.name} ({sf.price} ကျပ်) [{format12Hour(sf.openHour !== undefined ? sf.openHour : (userSelectedField.openHour ?? 8))} ~ {format12Hour(sf.closeHour !== undefined ? sf.closeHour : (userSelectedField.closeHour ?? 22))}]</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">ကစားမည့်ရွေးချယ်ရန် ရက်စွဲ (Date)</label>
                      <input 
                        type="date" 
                        value={userCheckDate} 
                        onChange={(e) => setUserCheckDate(e.target.value)}
                        className="w-full border rounded-lg p-2.5 text-sm bg-white font-bold"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">စတင်မည့်အချိန် (Start)</label>
                        <select 
                          value={selectedStartSlot} 
                          onChange={(e) => setSelectedStartSlot(e.target.value)}
                          className="w-full border rounded-lg p-2 text-sm bg-white font-bold"
                        >
                          <option value="">-- Start --</option>
                          {generateSingleTimeSlots(
                            selectedSubField?.openHour !== undefined ? selectedSubField.openHour : (userSelectedField?.openHour ?? 8), 
                            selectedSubField?.closeHour !== undefined ? selectedSubField.closeHour : (userSelectedField?.closeHour ?? 22)
                          ).map(slot => (
                            <option key={slot.hour} value={slot.hour}>{format12Hour(slot.hour)}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">ပြီးဆုံးမည့်အချိန် (End)</label>
                        <select 
                          value={selectedEndSlot} 
                          onChange={(e) => setSelectedEndSlot(e.target.value)}
                          className="w-full border rounded-lg p-2 text-sm bg-white font-bold"
                        >
                          <option value="">-- End --</option>
                          {generateSingleTimeSlots(
                            selectedSubField?.openHour !== undefined ? selectedSubField.openHour : (userSelectedField?.openHour ?? 8), 
                            selectedSubField?.closeHour !== undefined ? selectedSubField.closeHour : (userSelectedField?.closeHour ?? 22),
                            true
                          )
                            .filter(slot => selectedStartSlot === '' || slot.hour > parseInt(selectedStartSlot))
                            .map(slot => (
                              <option key={slot.hour} value={slot.hour}>{format12Hour(slot.hour)}</option>
                            ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">ဖောက်သည် အမည် (Customer Name)</label>
                      <input 
                        type="text" 
                        placeholder="ဥပမာ - ကိုအောင်အောင်" 
                        value={ownerCustomerName} 
                        onChange={(e) => setOwnerCustomerName(e.target.value)} 
                        className="w-full border rounded-lg p-2.5 text-sm bg-white" 
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">ဖောက်သည် ဖုန်းနံပါတ် (Customer Phone)</label>
                      <input 
                        type="text" 
                        placeholder="ဥပမာ - 09791234567" 
                        value={ownerCustomerPhone} 
                        onChange={(e) => setOwnerCustomerPhone(e.target.value)} 
                        className="w-full border rounded-lg p-2.5 text-sm bg-white" 
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">ငွေပေးချေမှု ပုံစံ</label>
                      <select 
                        value={selectedPaymentMethod} 
                        onChange={(e) => setSelectedPaymentMethod(e.target.value)}
                        className="w-full border rounded-lg p-2.5 text-sm bg-white font-bold"
                      >
                        <option value="">-- ပုံစံရွေးပါ --</option>
                        <option value="Cash">Cash (ငွေသား)</option>
                        <option value="KPay">KPay</option>
                        <option value="Wave">Wave</option>
                      </select>
                    </div>


                    {selectedPaymentMethod !== 'Cash' && (
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">ငွေပေးချေမည့် အစီအစဉ်</label>
                        <select 
                          value={paymentPlan}
                          onChange={(e) => setPaymentPlan(e.target.value)}
                          className="w-full border rounded-lg p-2.5 text-sm bg-white font-bold"
                        >
                          <option value="50">50% ငွေပေးချေရန် ({calculatedTotalPrice > 0 ? Math.round(calculatedTotalPrice * 0.5).toLocaleString() : 0} ကျပ်)</option>
                          <option value="100">100% ငွေပေးချေရန် ({calculatedTotalPrice > 0 ? calculatedTotalPrice.toLocaleString() : 0} ကျပ်)</option>
                        </select>
                      </div>
                    )}

                    {calculatedDuration > 0 && (
                      <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl text-xs space-y-1 font-bold text-emerald-900">
                        <p>⏱️ ကြာချိန်: {calculatedDuration} နာရီ</p>
                        <p>💵 စုစုပေါင်းကျသင့်ငွေ: {calculatedTotalPrice.toLocaleString()} ကျပ်</p>
                            {selectedPaymentMethod !== 'Cash' && (
                              <p className="text-amber-700">💳 {paymentPlanPercent}% ပေးချေရန်: {calculatedPayableAmount.toLocaleString()} ကျပ်</p>
                            )}
                      </div>
                    )}

                    <button 
                      onClick={handleBookingSubmit}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl text-sm font-bold shadow transition-colors"
                    >
                      Direct Booking အတည်ပြုမည် (Approve Already)
                    </button>
                  </div>

                  <div>
                    <h4 className="font-bold text-sm text-gray-800 mb-2">ရွေးချယ်ထားသော ကွင်းခွဲ၏ အချိန်ဇယား (Schedule Status)</h4>
                    {selectedSubField ? (
                      <div className="bg-white border rounded-xl p-4 shadow-sm space-y-2">
                        <p className="text-xs font-bold text-emerald-700 mb-3">📅 ရက်စွဲ: {userCheckDate} ({selectedSubField.name})</p>
                        <div className="space-y-1.5 max-h-96 overflow-y-auto">
                          {generateSingleTimeSlots(
                            selectedSubField?.openHour !== undefined ? selectedSubField.openHour : (userSelectedField?.openHour ?? 8), 
                            selectedSubField?.closeHour !== undefined ? selectedSubField.closeHour : (userSelectedField?.closeHour ?? 22)
                          ).map(slot => {
                            const stType = getSlotStatusType(slot.hour);
                            return (
                              <div key={slot.hour} className={`flex justify-between items-center p-2 rounded text-xs border ${
                                stType === 'booked' ? 'bg-red-50 border-red-200 text-red-700 font-bold' :
                                stType === 'pending' ? 'bg-amber-50 border-amber-200 text-amber-700 font-bold' :
                                stType === 'expired' ? 'bg-gray-100 text-gray-400' :
                                'bg-emerald-50 border-emerald-200 text-emerald-800'
                              }`}>
                                <span>{slot.label}</span>
                                <span>
                                  {stType === 'booked' ? '🔴 Booked (ပြီးပြီ)' :
                                   stType === 'pending' ? '🟡 Pending' :
                                   stType === 'expired' ? '⏰ Expired' : '🟢 Available'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="bg-gray-50 border rounded-xl p-8 text-center text-xs text-gray-500">
                        ကျေးဇူးပြု၍ ကွင်းနှင့် ကွင်းခွဲကို ဦးစွာ ရွေးချယ်ပါ။
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {ownerActiveTab === 'history' && (
              <div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
                  <h3 className="text-base font-bold text-gray-800">Booking မှတ်တမ်းများ (Owner Fields: {ownerHistoryBookings.length}{historyHasMore ? '+' : ''})</h3>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => printBookingHistory(ownerHistoryBookings, 'owner')}
                      className="rounded-lg bg-slate-700 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-slate-800 active:scale-[0.98]"
                    >
                      🖨️ Print ထုတ်ရန်
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadHistoryExcel(ownerHistoryBookings, 'owner')}
                      className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 active:scale-[0.98]"
                      title="Excel ဖြင့်ဖွင့်နိုင်သော CSV ဖိုင် ဒေါင်းလုဒ်ရန်"
                    >
                      📊 Excel Export
                    </button>
                  </div>
                </div>
                <div className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
                  <label className="flex min-w-[180px] flex-1 flex-col gap-1 text-xs font-bold text-gray-700">
                    History Date Filter
                    <input type="date" value={historyDate} onChange={(event) => setHistoryDate(event.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-normal outline-none focus:border-emerald-500" />
                  </label>
                  <button type="button" onClick={() => setHistoryDate('')} className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-gray-700 shadow-sm hover:bg-gray-100">All Dates</button>
                  <button type="button" disabled={historyPage === 0 || historyLoading} onClick={() => setHistoryPage((page) => Math.max(0, page - 1))} className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-gray-700 shadow-sm disabled:cursor-not-allowed disabled:opacity-40">← Previous</button>
                  <span className="px-1 py-2 text-xs font-bold text-gray-500">Page {historyPage + 1}</span>
                  <button type="button" disabled={!historyHasMore || historyLoading} onClick={() => setHistoryPage((page) => page + 1)} className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-gray-700 shadow-sm disabled:cursor-not-allowed disabled:opacity-40">Next →</button>
                </div>
                <div className="overflow-x-auto rounded-lg">
                  <table className="w-full min-w-[1350px] table-fixed text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-100 text-xs border-b">
                        <th className="p-3 min-w-[170px] align-top">ဖောက်သည်အမည် (Name)</th>
                        <th className="p-3 min-w-[135px] align-top">Ph No</th>
                        <th className="p-3 min-w-[125px] align-top">ကွင်းခွဲ</th>
                        <th className="p-3 min-w-[115px] align-top">ရက်စွဲ</th>
                        <th className="p-3 min-w-[230px] align-top">စတင်ချိန် / အဆုံးချိန်</th>
                        <th className="p-3 min-w-[95px] align-top">အသုံးပြုချိန်</th>
                        <th className="p-3 min-w-[155px] align-top">တင်ခဲ့သည့်အချိန်</th>
                        <th className="p-3 min-w-[125px] align-top">သင့်ငွေ</th>
                        <th className="p-3 min-w-[220px] align-top">ငွေပေးချေမှု / Screenshot</th>
                        <th className="p-3 min-w-[105px] align-top">Status</th>
                        <th className="p-3 min-w-[155px] text-center align-top">လုပ်ဆောင်ချက်</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y text-sm">
                      {historyLoading ? (
                        <tr><td colSpan="11" className="p-8 text-center text-sm text-gray-500">History ဖတ်နေပါသည်...</td></tr>
                      ) : ownerHistoryBookings.length > 0 ? (
                        ownerHistoryBookings.map(item => {
                            const bookingExpired = isBookingExpired(item);
                            const timeRange = item.fullTimeSlot || item.timeSlot || '';
                            const [startTime, endTime] = timeRange.split(/\s*-\s*/);
                            const displayTimeRange = startTime && endTime ? `${startTime} - ${endTime}` : timeRange || '-';
                            const screenshotSrc = item.paymentScreenshot || item.paymentScreenshotUrl || item.screenshotDataUrl;
                            return (
                              <tr key={item.id} className="hover:bg-gray-50 align-top">
                                <td className="p-3 font-medium break-words">{getBookingCustomerName(item)}</td>
                                <td className="p-3 text-xs font-mono whitespace-nowrap">{getBookingCustomerPhone(item)}</td>
                                <td className="p-3 font-bold text-xs break-words">{item.subFieldName || '-'}</td>
                                <td className="p-3 text-xs font-mono whitespace-nowrap">{item.date || '-'}</td>
                                <td className="p-3 text-xs font-bold text-emerald-700 whitespace-nowrap">{displayTimeRange}</td>
                                <td className="p-3 text-xs whitespace-nowrap"><span className="bg-blue-50 text-blue-600 font-bold px-2 py-0.5 rounded">{item.duration || '-'}</span></td>
                                <td className="p-3 text-xs font-mono text-gray-500 whitespace-nowrap">{item.bookedAt || '-'}</td>
                                <td className="p-3 text-xs whitespace-nowrap">
                                  <div className="font-bold text-emerald-700">{item.totalPrice ? `${Number(item.totalPrice).toLocaleString()} ကျပ်` : '-'}</div>
                                  <div className="mt-1 text-[11px] font-bold text-amber-700">{getBookingPaymentPlanPercent(item)}% ပေးချေ · {getBookingPayableAmount(item) ? `${getBookingPayableAmount(item).toLocaleString()} ကျပ်` : '-'}</div>
                                </td>
                                <td className="p-3 text-xs font-bold align-top">
                                  <div className="space-y-2">
                                    <div className="uppercase whitespace-nowrap">{item.paymentMethod || '-'}</div>
                                    {screenshotSrc ? (
                                      <button
                                        type="button"
                                        onClick={() => setSelectedPaymentReview({
                                          screenshotSrc,
                                          paymentMethod: item.paymentMethod,
                                          transactionLast5: item.transactionLast5,
                                          userName: getBookingCustomerName(item),
                                          customerPhone: getBookingCustomerPhone(item),
                                          subFieldName: item.subFieldName,
                                          date: item.date,
                                          timeRange: displayTimeRange,
                                          totalPrice: item.totalPrice,
                                          status: item.status
                                        })}
                                        className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-1.5 text-left text-emerald-700 hover:bg-emerald-100 active:scale-[0.98]"
                                        title="Payment Screenshot နှင့် Transaction တိုက်စစ်ရန်"
                                      >
                                        <img src={screenshotSrc} alt="Payment screenshot" className="h-14 w-20 rounded object-cover" />
                                        <span className="text-[10px] font-bold whitespace-nowrap">တိုက်စစ်ရန်</span>
                                      </button>
                                    ) : (
                                      <span className="inline-block rounded bg-gray-100 px-2 py-1 text-[10px] font-medium text-gray-500">Screenshot မတင်ထားပါ</span>
                                    )}
                                  </div>
                                </td>
                                <td className="p-3 font-bold text-xs whitespace-nowrap">
                                  <span className={item.status === 'Approved' ? 'text-emerald-600' : item.status === 'Rejected' ? 'text-red-500' : 'text-amber-500'}>{item.status || '-'}</span>
                                </td>
                                <td className="p-3 text-center align-top">
                                  <div className="flex flex-col items-center gap-1">
                                    <button
                                      type="button"
                                      disabled={bookingExpired}
                                      title={bookingExpired ? 'ဤ Booking အချိန်ကျော်လွန်သွားပါပြီ' : 'Approve'}
                                      onClick={() => handleStatusChangeWithConfirm(item.id, item.status, 'Approved', item.fieldId)}
                                      className={`w-[64px] px-2 py-1 rounded text-[10px] font-bold ${bookingExpired ? 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-60' : 'bg-emerald-600 text-white'}`}
                                    >
                                      Approve
                                    </button>
                                    <button
                                      type="button"
                                      disabled={bookingExpired}
                                      title={bookingExpired ? 'ဤ Booking အချိန်ကျော်လွန်သွားပါပြီ' : 'Reject'}
                                      onClick={() => handleStatusChangeWithConfirm(item.id, item.status, 'Rejected', item.fieldId)}
                                      className={`w-[64px] px-2 py-1 rounded text-[10px] font-bold ${bookingExpired ? 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-60' : 'bg-red-500 text-white'}`}
                                    >
                                      Reject
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                      ) : (
                        <tr>
                          <td colSpan="11" className="text-center py-8 text-gray-500 text-sm">Booking များ မရှိသေးပါ။</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div>
            {activeTab === 'fields' && (
              <>
                {userSelectedField ? (
              <div className="bg-white rounded-xl shadow p-6">
                <button onClick={() => { setUserSelectedField(null); setSelectedSubField(null); sessionStorage.removeItem('userSelectedField'); sessionStorage.removeItem('selectedSubField'); }} className="text-xs text-blue-600 font-bold hover:underline mb-4 inline-block">← ကွင်းစာရင်းသို့ ပြန်သွားရန်</button>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="md:col-span-1 space-y-4">
                    <div>
                      <h2 className="text-xl font-bold text-gray-800">{userSelectedField.name}</h2>
                      <p className="text-xs text-gray-500 mt-0.5">{userSelectedField.address || userSelectedField.location} | Tel: {userSelectedField.phone}</p>
                      <p className="text-xs text-emerald-700 font-bold mt-1">🕒 ကွင်းဖွင့်ချိန်: {format12Hour(userSelectedField.openHour ?? 8)} မှ {format12Hour(userSelectedField.closeHour ?? 22)} ထိ</p>
                    </div>

                    <div className="border-t pt-3">
                      <h3 className="text-xs font-bold text-gray-700 mb-2">ကွင်းခွဲများ (Sub-Fields) ရွေးရန်</h3>
                      <div className="space-y-2">
                        {userSelectedField.subFields.map(sf => {
                          const isSubActive = sf.status !== 'Inactive';
                          return (
                            <div 
                              key={sf.id} 
                              onClick={() => {
                                if (!isSubActive) {
                                  alert('ဤကွင်းခွဲမှာ လက်ရှိ ပိတ်ထားပါသည်။');
                                  return;
                                }
                                setSelectedSubField(sf);
                                setSelectedStartSlot('');
                                setSelectedEndSlot('');
                              }}
                              className={`p-3 rounded-xl border cursor-pointer transition-all ${
                                !isSubActive ? 'bg-gray-100 opacity-60 cursor-not-allowed' :
                                selectedSubField?.id === sf.id ? 'border-emerald-600 bg-emerald-50 shadow-sm' : 'hover:bg-gray-50'
                              }`}
                            >
                              <div className="flex justify-between items-center">
                                <span className="font-bold text-sm text-gray-800">{sf.name}</span>
                                <span className="text-xs font-bold text-emerald-700">{sf.price?.toLocaleString()} ကျပ် / နာရီ</span>
                              </div>
                              <div className="flex justify-between items-center mt-1">
                                <span className="text-[11px] text-gray-500">ဖွင့်ချိန်: {format12Hour(sf.openHour !== undefined ? sf.openHour : (userSelectedField.openHour ?? 8))} ~ {format12Hour(sf.closeHour !== undefined ? sf.closeHour : (userSelectedField.closeHour ?? 22))}</span>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${isSubActive ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                                  {isSubActive ? 'Active' : 'Inactive'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="bg-gray-50 p-3.5 rounded-xl border text-xs space-y-2">
                      <p className="font-bold text-gray-800 mb-1">💳 ငွေပေးချေရန် Account များ</p>
                      {(() => {
                        const cleanNum = (str) => {
                          if (!str) return '09795562378';
                          return str.replace(/\(KPay|Wave|kpay|wave\)/gi, '').trim();
                        };
                        const kpayNum = cleanNum(userSelectedField.paymentInfo?.kpay);
                        const waveNum = cleanNum(userSelectedField.paymentInfo?.wave);

                        if (selectedPaymentMethod === 'KPay') {
                          return (
                            <div className="flex items-center justify-between bg-emerald-50 border border-emerald-300 p-2.5 rounded-lg shadow-sm">
                              <div>
                                <span className="font-bold text-gray-700 text-xs">KPay No: </span>
                                <span className="text-emerald-700 font-bold text-sm tracking-wide">{kpayNum}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(kpayNum);
                                  alert('KPay နံပါတ် (' + kpayNum + ') ကူးယူပြီးပါပြီ (Copied!)');
                                }}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-md text-xs font-bold transition-colors shadow"
                              >
                                📋 Copy
                              </button>
                            </div>
                          );
                        } else if (selectedPaymentMethod === 'Wave') {
                          return (
                            <div className="flex items-center justify-between bg-blue-50 border border-blue-300 p-2.5 rounded-lg shadow-sm">
                              <div>
                                <span className="font-bold text-gray-700 text-xs">Wave No: </span>
                                <span className="text-blue-700 font-bold text-sm tracking-wide">{waveNum}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(waveNum);
                                  alert('Wave နံပါတ် (' + waveNum + ') ကူးယူပြီးပါပြီ (Copied!)');
                                }}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-md text-xs font-bold transition-colors shadow"
                              >
                                📋 Copy
                              </button>
                            </div>
                          );
                        } else {
                          return (
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between bg-white p-2 rounded border">
                                <span className="font-semibold text-gray-700">KPay: <span className="font-bold text-gray-900">{kpayNum}</span></span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText(kpayNum);
                                    alert('KPay နံပါတ် (' + kpayNum + ') ကူးယူပြီးပါပြီ (Copied!)');
                                  }}
                                  className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-2.5 py-1 rounded text-xs font-bold"
                                >
                                  Copy
                                </button>
                              </div>
                              <div className="flex items-center justify-between bg-white p-2 rounded border">
                                <span className="font-semibold text-gray-700">Wave: <span className="font-bold text-gray-900">{waveNum}</span></span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText(waveNum);
                                    alert('Wave နံပါတ် (' + waveNum + ') ကူးယူပြီးပါပြီ (Copied!)');
                                  }}
                                  className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-2.5 py-1 rounded text-xs font-bold"
                                >
                                  Copy
                                </button>
                              </div>
                              <p className="text-gray-500 text-[11px] mt-1 italic">*(ငွေပေးချေမည့်နည်းလမ်း KPay သို့မဟုတ် Wave ကို ရွေးချယ်ပါက သက်ဆိုင်ရာ နံပါတ်နှင့် Copy ခလုတ် သီးသန့်ပေါ်လာပါမည်)*</p>
                            </div>
                          );
                        }
                      })()}
                    </div>
                  </div>

                  <div className="md:col-span-2 space-y-6">
                    {selectedSubField ? (
                      <div className="bg-gray-50 p-6 rounded-2xl border space-y-4">
                        <div className="flex justify-between items-center border-b pb-3">
                          <div>
                            <h3 className="text-base font-bold text-gray-800">📅 Booking တင်ရန် ({selectedSubField.name})</h3>
                            <p className="text-xs text-gray-500">ဈေးနှုန်း: {selectedSubField.price?.toLocaleString()} ကျပ် / နာရီ</p>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-gray-600 mb-1">ရက်စွဲရွေးရန်</label>
                            <input 
                              type="date" 
                              value={userCheckDate} 
                              onChange={(e) => setUserCheckDate(e.target.value)}
                              className="border rounded-lg p-2 text-xs font-bold bg-white"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                          <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">စတင်မည့်အချိန် (Start Slot)</label>
                            <select 
                              value={selectedStartSlot} 
                              onChange={(e) => {
                                setSelectedStartSlot(e.target.value);
                                setSelectedEndSlot('');
                              }}
                              className="w-full border rounded-lg p-2.5 text-sm bg-white font-bold"
                            >
                              <option value="">-- Start Time --</option>
                              {generateSingleTimeSlots(
                                selectedSubField?.openHour !== undefined ? selectedSubField.openHour : (userSelectedField?.openHour ?? 8), 
                                selectedSubField?.closeHour !== undefined ? selectedSubField.closeHour : (userSelectedField?.closeHour ?? 22)
                              ).map(slot => {
                                const isUnavail = isSlotUnavailable(slot.hour);
                                return (
                                  <option key={slot.hour} value={slot.hour} disabled={isUnavail}>
                                    {format12Hour(slot.hour)} {isUnavail ? '(Booked / Expired)' : ''}
                                  </option>
                                );
                              })}
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">ပြီးဆုံးမည့်အချိန် (End Slot)</label>
                            <select 
                              value={selectedEndSlot} 
                              onChange={(e) => setSelectedEndSlot(e.target.value)}
                              className="w-full border rounded-lg p-2.5 text-sm bg-white font-bold"
                            >
                              <option value="">-- End Time --</option>
                              {generateSingleTimeSlots(
                                selectedSubField?.openHour !== undefined ? selectedSubField.openHour : (userSelectedField?.openHour ?? 8), 
                                selectedSubField?.closeHour !== undefined ? selectedSubField.closeHour : (userSelectedField?.closeHour ?? 22),
                                true
                              )
                                .filter(slot => selectedStartSlot === '' || slot.hour > parseInt(selectedStartSlot))
                                .map(slot => {
                                  const startNum = parseInt(selectedStartSlot);
                                  let hasConflictInRange = false;
                                  for (let h = startNum; h < slot.hour; h++) {
                                    if (isSlotUnavailable(h)) {
                                      hasConflictInRange = true;
                                      break;
                                    }
                                  }
                                  return (
                                    <option key={slot.hour} value={slot.hour} disabled={hasConflictInRange}>
                                      {format12Hour(slot.hour)} {hasConflictInRange ? '(Unavailable)' : ''}
                                    </option>
                                  );
                                })}
                            </select>
                          </div>
                        </div>

                        {currentUser.role !== 'owner' && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                            <div>
                              <label className="block text-xs font-bold text-gray-700 mb-1">ဖောက်သည်အမည် (Customer Name)</label>
                              <input
                                type="text"
                                value={customerName}
                                onChange={(e) => setCustomerName(e.target.value)}
                                placeholder="ဥပမာ - ကိုအောင်အောင်"
                                className="w-full border rounded-lg p-2.5 text-sm bg-white"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-gray-700 mb-1">ဖောက်သည် ဖုန်းနံပါတ် (Customer Phone)</label>
                              <input
                                type="tel"
                                value={customerPhone}
                                onChange={(e) => setCustomerPhone(e.target.value.replace(/[^0-9+ -]/g, ''))}
                                placeholder="ဥပမာ - 09791234567"
                                className="w-full border rounded-lg p-2.5 text-sm bg-white"
                              />
                            </div>
                          </div>
                        )}

                        <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">ငွေပေးချေမည့်နည်းလမ်း</label>
                            <select 
                              value={selectedPaymentMethod} 
                              onChange={(e) => {
                                const nextPaymentMethod = e.target.value;
                                setSelectedPaymentMethod(nextPaymentMethod);
                                if (nextPaymentMethod === 'Cash') {
                                  setTransactionLast5('');
                                  setPaymentScreenshot(null);
                                }
                              }}
                              className="w-full border rounded-lg p-2.5 text-sm bg-white font-bold"
                            >
                              <option value="">-- နည်းလမ်းရွေးပါ --</option>
                              <option value="KPay">KPay</option>
                              <option value="Wave">Wave</option>
                              <option value="Cash">Cash (ငွေသား)</option>
                            </select>


                            {selectedPaymentMethod !== 'Cash' && (
                              <div className="mt-3">
                                <label className="block text-xs font-bold text-gray-700 mb-1">ငွေပေးချေမည့် အစီအစဉ်</label>
                                <select
                                  value={paymentPlan}
                                  onChange={(e) => setPaymentPlan(e.target.value)}
                                  className="w-full border rounded-lg p-2.5 text-sm bg-white font-bold"
                                >
                                  <option value="50">50% ငွေပေးချေရန် ({calculatedTotalPrice > 0 ? Math.round(calculatedTotalPrice * 0.5).toLocaleString() : 0} ကျပ်)</option>
                                  <option value="100">100% ငွေပေးချေရန် ({calculatedTotalPrice > 0 ? calculatedTotalPrice.toLocaleString() : 0} ကျပ်)</option>
                                </select>
                              </div>
                            )}

                            {/* Dedicated Payment Account Box below dropdown */}
                            {selectedPaymentMethod && selectedPaymentMethod !== 'Cash' && (
                              <div className="mt-2.5 p-3 bg-emerald-50/70 border border-emerald-300 rounded-lg flex items-center justify-between shadow-sm">
                                <div className="space-y-0.5">
                                  <p className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">
                                    {selectedPaymentMethod === 'KPay' ? 'KPay ငွေလွှဲရန် နံပါတ်' : 'Wave ငွေလွှဲရန် နံပါတ်'}
                                  </p>
                                  <p className="text-base font-extrabold text-gray-900 tracking-wide font-mono">
                                    {(() => {
                                      const cleanNum = (str) => {
                                        if (!str) return '09795562378';
                                        return str.replace(/\(KPay|Wave|kpay|wave\)/gi, '').trim();
                                      };
                                      if (selectedPaymentMethod === 'KPay') {
                                        return cleanNum(userSelectedField.paymentInfo?.kpay);
                                      } else if (selectedPaymentMethod === 'Wave') {
                                        return cleanNum(userSelectedField.paymentInfo?.wave);
                                      }
                                      return '09795562378';
                                    })()}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const cleanNum = (str) => {
                                      if (!str) return '09795562378';
                                      return str.replace(/\(KPay|Wave|kpay|wave\)/gi, '').trim();
                                    };
                                    const num = selectedPaymentMethod === 'KPay' 
                                      ? cleanNum(userSelectedField.paymentInfo?.kpay) 
                                      : cleanNum(userSelectedField.paymentInfo?.wave);
                                    navigator.clipboard.writeText(num);
                                    alert(selectedPaymentMethod + ' နံပါတ် (' + num + ') ကို Copy ကူးယူပြီးပါပြီ!');
                                  }}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-md text-xs font-bold transition-colors shadow flex items-center gap-1"
                                >
                                  📋 Copy
                                </button>
                              </div>
                            )}
                          </div>

                        {selectedPaymentMethod !== 'Cash' && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                            <div>
                              <label className="block text-xs font-bold text-gray-700 mb-1">ငွေလွှဲ Transaction နံပါတ် နောက်ဆုံး ၅ လုံး</label>
                            <input 
                              type="text" 
                              maxLength="5" 
                              placeholder="ဥပမာ - 12345" 
                              value={transactionLast5} 
                              onChange={(e) => {
                                const val = e.target.value.replace(/[^0-9]/g, '');
                                setTransactionLast5(val);
                              }} 
                              className="w-full border rounded-lg p-2.5 text-sm bg-white font-mono" 
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">ငွေလွှဲ Screenshot တင်ရန်</label>
                            <input 
                              type="file" 
                              accept="image/*"
                              onChange={(e) => setPaymentScreenshot(e.target.files[0])}
                              className="w-full border rounded-lg p-1.5 text-xs bg-white file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100" 
                            />
                            </div>
                          </div>
                        )}

                        {calculatedDuration > 0 && (
                          <div className="bg-emerald-100 border border-emerald-300 p-3 rounded-xl text-xs space-y-1 font-bold text-emerald-900">
                            <p>⏱️ ကြာချိန်: {calculatedDuration} နာရီ ({format12Hour(parseInt(selectedStartSlot))} ~ {format12Hour(parseInt(selectedEndSlot))})</p>
                            <p>💵 စုစုပေါင်းကျသင့်ငွေ: {calculatedTotalPrice.toLocaleString()} ကျပ်</p>
                            {selectedPaymentMethod !== 'Cash' && (
                              <p className="text-amber-700">💳 {paymentPlanPercent}% ပေးချေရန်: {calculatedPayableAmount.toLocaleString()} ကျပ်</p>
                            )}
                          </div>
                        )}

                        <button 
                          onClick={handleBookingSubmit}
                          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl text-sm font-bold shadow transition-colors"
                        >
                          Booking တင်မည် (Confirm Booking)
                        </button>
                      </div>
                    ) : (
                      <div className="bg-gray-50 border rounded-2xl p-12 text-center text-gray-500 text-sm">
                        ဘယ်ဘက်ခြမ်းမှ ကွင်းခွဲ (Sub-Field) တစ်ခုကို ဦးစွာ ရွေးချယ်ပါ။
                      </div>
                    )}

                    <div>
                      <h3 className="text-sm font-bold text-gray-800 mb-3">🕒 ဤကွင်းခွဲ၏ အချိန်ဇယားနှင့် အခြေအနေများ</h3>
                      {selectedSubField ? (
                        <div className="bg-white border rounded-xl p-4 shadow-sm space-y-2">
                          <p className="text-xs font-bold text-emerald-700 mb-3">📅 ရက်စွဲ: {userCheckDate} ({selectedSubField.name})</p>
                          <div className="space-y-1.5 max-h-72 overflow-y-auto">
                            {generateSingleTimeSlots(
                              selectedSubField?.openHour !== undefined ? selectedSubField.openHour : (userSelectedField?.openHour ?? 8), 
                              selectedSubField?.closeHour !== undefined ? selectedSubField.closeHour : (userSelectedField?.closeHour ?? 22)
                            ).map(slot => {
                              const stType = getSlotStatusType(slot.hour);
                              return (
                                <div key={slot.hour} className={`flex justify-between items-center p-2 rounded text-xs border ${
                                  stType === 'booked' ? 'bg-red-50 border-red-200 text-red-700 font-bold' :
                                  stType === 'pending' ? 'bg-amber-50 border-amber-200 text-amber-700 font-bold' :
                                  stType === 'expired' ? 'bg-gray-100 text-gray-400' :
                                  'bg-emerald-50 border-emerald-200 text-emerald-800'
                                }`}>
                                  <span>{slot.label}</span>
                                  <span>
                                    {stType === 'booked' ? '🔴 Booked (ပြီးပြီ)' :
                                     stType === 'pending' ? '🟡 Pending (စောင့်ဆိုင်းဆဲ)' :
                                     stType === 'expired' ? '⏰ Expired (အချိန်ကုန်ပြီး)' : '🟢 Available (ရနိုင်သည်)'}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400">အချိန်ဇယားကြည့်ရန် ကွင်းခွဲတစ်ခုကို ရွေးပါ။</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-xl shadow-sm">
                  <div>
                    <h2 className="text-lg font-bold text-gray-800">ရနိုင်သော ဘောလုံးကွင်းများ</h2>
                    <p className="text-xs text-gray-500">မြို့နယ်အလိုက် ရှာဖွေနိုင်ပြီး လိုချင်သည့်ကွင်းကို ရွေးချယ် Booking တင်နိုင်ပါသည်။</p>
                  </div>
                  <div className="w-full md:w-72">
                    <input 
                      type="text" 
                      placeholder="🔍 မြို့နယ်ဖြင့် ရှာရန် (ဥပမာ - လှိုင်)" 
                      value={selectedTownship} 
                      onChange={(e) => setSelectedTownship(e.target.value)}
                      className="w-full border rounded-lg p-2.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:border-emerald-600 font-medium"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {displayedFields.length > 0 ? (
                    displayedFields.map(f => (
                      <div key={f.id} className="bg-white border rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
                        <div>
                          <div className="flex justify-between items-start mb-2">
                            <h3 className="text-base font-bold text-gray-800">{f.name}</h3>
                            <span className="text-xs bg-emerald-50 text-emerald-700 font-bold px-2.5 py-1 rounded-lg">{f.location}</span>
                          </div>
                          <p className="text-xs text-gray-500 mb-3">{f.address || f.location} | Tel: {f.phone}</p>
                          <p className="text-xs text-emerald-700 font-bold mb-3">🕒 ဖွင့်ချိန်: {format12Hour(f.openHour ?? 8)} မှ {format12Hour(f.closeHour ?? 22)} ထိ</p>
                          
                          <div className="space-y-1.5 mb-4">
                            {f.subFields.map(sf => (
                              <div key={sf.id} className="text-xs bg-gray-50 p-2 rounded-lg flex justify-between items-center">
                                <span className="font-medium text-gray-700">{sf.name}</span>
                                <span className="font-bold text-emerald-700">{sf.price?.toLocaleString()} ကျပ်</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <button 
                          onClick={() => {
                            setUserSelectedField(f);
                            if (f.subFields.length > 0) setSelectedSubField(f.subFields[0]);
                          }}
                          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl text-xs font-bold shadow transition-colors"
                        >
                          ကွင်းရွေးမည် & Booking တင်မည် →
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="col-span-3 text-center py-16 bg-white rounded-xl shadow-sm text-gray-500 text-sm">
                      ရှာဖွေထားသော မြို့နယ်နှင့် ကိုက်ညီသော ကွင်းများ မရှိသေးပါ။
                    </div>
                  )}
                </div>
              </div>
                )}
              </>
            )}

            {activeTab === 'password' && currentUser.role === 'user' && (
              <div className="bg-white rounded-xl shadow p-6 mt-6 max-w-md">
                <div className="flex justify-between items-center mb-6 border-b pb-4">
                  <h2 className="text-xl font-bold text-gray-800">🔒 Change Password</h2>
                  <button onClick={() => setActiveTab('fields')} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold">← ကွင်းများသို့ ပြန်ရန်</button>
                </div>
                <form onSubmit={handleChangeMyPassword} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Password အဟောင်း (Current Password)</label>
                    <input type="password" value={oldPasswordInput} onChange={(e) => setOldPasswordInput(e.target.value)} className="w-full border rounded-lg p-2.5 text-sm bg-white font-mono" required placeholder="••••••••" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Password အသစ် (New Password - အနည်းဆုံး ၆ လုံး)</label>
                    <input type="password" value={newPasswordInput} onChange={(e) => setNewPasswordInput(e.target.value)} className="w-full border rounded-lg p-2.5 text-sm bg-white font-mono" required placeholder="••••••••" />
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <button type="submit" className="bg-emerald-600 text-white px-4 py-2.5 rounded-lg text-xs font-bold hover:bg-emerald-700 transition">Password ပြောင်းမည်</button>
                    <button type="button" onClick={handleForgotPassword} className="text-xs text-blue-600 font-bold hover:underline">Password မေ့နေပါသလား? (Forgot)</button>
                  </div>
                </form>
              </div>
            )}

            {activeTab === 'history' && currentUser.role === 'user' && (
              <div className="bg-white rounded-xl shadow p-6 mt-6">
                <div className="flex justify-between items-center mb-6 border-b pb-4">
                  <h2 className="text-xl font-bold text-gray-800">📋 ကျွန်ုပ်၏ Booking မှတ်တမ်းများ</h2>
                  <button onClick={() => setActiveTab('fields')} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold">← ကွင်းများသို့ ပြန်ရန်</button>
                </div>
                <div className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
                  <label className="flex min-w-[180px] flex-1 flex-col gap-1 text-xs font-bold text-gray-700">
                    History Date Filter
                    <input type="date" value={historyDate} onChange={(event) => setHistoryDate(event.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-normal outline-none focus:border-emerald-500" />
                  </label>
                  <button type="button" onClick={() => setHistoryDate('')} className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-gray-700 shadow-sm hover:bg-gray-100">All Dates</button>
                  <button type="button" disabled={historyPage === 0 || historyLoading} onClick={() => setHistoryPage((page) => Math.max(0, page - 1))} className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-gray-700 shadow-sm disabled:cursor-not-allowed disabled:opacity-40">← Previous</button>
                  <span className="px-1 py-2 text-xs font-bold text-gray-500">Page {historyPage + 1}</span>
                  <button type="button" disabled={!historyHasMore || historyLoading} onClick={() => setHistoryPage((page) => page + 1)} className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-gray-700 shadow-sm disabled:cursor-not-allowed disabled:opacity-40">Next →</button>
                </div>

                <div className="overflow-x-auto rounded-lg">
                  <table className="w-full min-w-[1000px] table-fixed text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-100 text-xs border-b">
                        <th className="p-3 min-w-[190px] align-top">ကွင်း / ကွင်းခွဲ</th>
                        <th className="p-3 min-w-[115px] align-top">ရက်စွဲ</th>
                        <th className="p-3 min-w-[230px] align-top">စတင်ချိန် / အဆုံးချိန်</th>
                        <th className="p-3 min-w-[95px] align-top">အသုံးပြုချိန်</th>
                        <th className="p-3 min-w-[155px] align-top">တင်ခဲ့သည့်အချိန်</th>
                        <th className="p-3 min-w-[125px] align-top">သင့်ငွေ</th>
                        <th className="p-3 min-w-[160px] align-top">ငွေပေးချေမှု / Txn</th>
                        <th className="p-3 min-w-[105px] align-top">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y text-sm">
                      {historyLoading ? (
                        <tr><td colSpan="8" className="p-8 text-center text-sm text-gray-500">History ဖတ်နေပါသည်...</td></tr>
                      ) : userHistoryBookings.length > 0 ? (
                        userHistoryBookings.map(item => {
                            const targetField = fields.find(f => f.id === item.fieldId);
                            const timeRange = item.fullTimeSlot || item.timeSlot || '';
                            const [startTime, endTime] = timeRange.split(/\s*-\s*/);
                            const displayTimeRange = startTime && endTime ? `${startTime} - ${endTime}` : timeRange || '-';
                            return (
                              <tr key={item.id} className="hover:bg-gray-50 align-top">
                                <td className="p-3">
                                  <div className="font-bold text-gray-800 break-words">{targetField?.name || 'Unknown'}</div>
                                  <div className="text-xs text-gray-500 break-words">{item.subFieldName || '-'}</div>
                                </td>
                                <td className="p-3 text-xs font-mono text-gray-500 whitespace-nowrap">{item.date || '-'}</td>
                                <td className="p-3 text-xs font-bold text-emerald-700 whitespace-nowrap">{displayTimeRange}</td>
                                <td className="p-3 text-xs whitespace-nowrap"><span className="bg-blue-50 text-blue-600 font-bold px-2 py-0.5 rounded">{item.duration || '-'}</span></td>
                                <td className="p-3 text-xs font-mono text-gray-500 whitespace-nowrap">{item.bookedAt || '-'}</td>
                                <td className="p-3 text-xs whitespace-nowrap">
                                  <div className="font-bold text-emerald-700">{item.totalPrice ? `${Number(item.totalPrice).toLocaleString()} ကျပ်` : '-'}</div>
                                  <div className="mt-1 text-[11px] font-bold text-amber-700">{getBookingPaymentPlanPercent(item)}% ပေးချေ · {getBookingPayableAmount(item) ? `${getBookingPayableAmount(item).toLocaleString()} ကျပ်` : '-'}</div>
                                </td>
                                <td className="p-3 text-xs whitespace-nowrap">
                                  <div className="uppercase font-bold">{item.paymentMethod || '-'}</div>
                                  <div className="font-mono text-gray-600">Txn: {item.transactionLast5 || '-'}</div>
                                </td>
                                <td className="p-3 font-bold text-xs whitespace-nowrap">
                                  {(() => {
                                    const expired = isBookingExpired(item);
                                    const baseStatus = String(item.status || 'Pending').replace(/\s+and\s+Expire$/i, '').trim() || 'Pending';
                                    const displayStatus = expired ? `${baseStatus} and Expire` : baseStatus;
                                    const statusColor = baseStatus === 'Approved' ? 'text-emerald-600' : baseStatus === 'Rejected' ? 'text-red-500' : 'text-amber-500';
                                    return (
                                      <span className={statusColor}>
                                        {displayStatus}
                                      </span>
                                    );
                                  })()}
                                </td>
                              </tr>
                            );
                          })
                      ) : (
                        <tr>
                          <td colSpan="8" className="text-center py-8 text-gray-500 text-sm">သင်၏ Booking မှတ်တမ်းများ မရှိသေးပါ။</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
        {selectedPaymentReview && (
          <div
            className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-3 sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-review-title"
            onClick={(event) => {
              if (event.target === event.currentTarget) setSelectedPaymentReview(null);
            }}
          >
            <div className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  <h2 id="payment-review-title" className="truncate text-sm font-bold text-gray-900 sm:text-base">Payment နှင့် Transaction တိုက်စစ်ရန်</h2>
                  <p className="mt-0.5 text-[11px] text-gray-500">Screenshot ကို app အတွင်းမှာပဲ ကြည့်နေပါသည်။</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedPaymentReview(null)}
                  className="shrink-0 rounded-lg bg-gray-100 px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-200 active:scale-[0.98]"
                  aria-label="Close payment review"
                >
                  ပိတ်မည် ✕
                </button>
              </div>

              <div className="min-h-0 overflow-y-auto">
                <div className="bg-slate-950 p-3 sm:p-5">
                  <img
                    src={selectedPaymentReview.screenshotSrc}
                    alt="Uploaded payment screenshot for transaction verification"
                    className="mx-auto max-h-[58vh] w-auto max-w-full rounded-lg object-contain shadow-lg"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 sm:p-5">
                  <div className="col-span-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 sm:col-span-1">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Transaction နောက်ဆုံး ၅ လုံး</p>
                    <p className="mt-1 break-all font-mono text-xl font-extrabold tracking-[0.18em] text-emerald-950">{selectedPaymentReview.transactionLast5 || '-'}</p>
                  </div>
                  <div className="rounded-xl border bg-gray-50 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Payment Method</p>
                    <p className="mt-1 text-sm font-extrabold text-gray-900">{selectedPaymentReview.paymentMethod || '-'}</p>
                  </div>
                  <div className="rounded-xl border bg-gray-50 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Status</p>
                    <p className={`mt-1 text-sm font-extrabold ${selectedPaymentReview.status === 'Approved' ? 'text-emerald-600' : selectedPaymentReview.status === 'Rejected' ? 'text-red-600' : 'text-amber-600'}`}>{selectedPaymentReview.status || '-'}</p>
                  </div>
                  <div className="col-span-2 rounded-xl border bg-gray-50 p-3 sm:col-span-3">
                    <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
                      <p><span className="font-bold text-gray-500">ဖောက်သည်:</span> <span className="font-semibold text-gray-900">{selectedPaymentReview.userName || '-'}</span></p>
                      <p><span className="font-bold text-gray-500">ရက်စွဲ:</span> <span className="font-semibold text-gray-900">{selectedPaymentReview.date || '-'}</span></p>
                      <p><span className="font-bold text-gray-500">အချိန်:</span> <span className="font-semibold text-gray-900">{selectedPaymentReview.timeRange || '-'}</span></p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
      </div>
    </div>
    </>
  );
}
