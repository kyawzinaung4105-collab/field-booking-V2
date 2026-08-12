import React, { useState, useEffect } from 'react';
import { db } from './firebase'; 
import { collection, getDoc, getDocs, addDoc, updateDoc, deleteDoc, doc, setDoc, runTransaction, onSnapshot, query, where } from 'firebase/firestore';

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

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  const [authMode, setAuthMode] = useState('login'); 
  const [signupName, setSignupName] = useState('');
  const [signupPassword, setSignupPassword] = useState('');

  const [myNewPassword, setMyNewPassword] = useState('');
  // The admin password is persisted in appConfig/settings and is loaded once at startup.
  // Keep the legacy default only as an offline/first-run fallback.
  const [adminPassword, setAdminPassword] = useState('admin123');
  const [selectedTownship, setSelectedTownship] = useState('');

  const [usersList, setUsersList] = useState(defaultUsers);
  const [fields, setFields] = useState(defaultFields);
  const [bookings, setBookings] = useState([]);
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
  const [paymentScreenshot, setPaymentScreenshot] = useState(null);
  const [transactionLast5, setTransactionLast5] = useState('');

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
  const [ownerEditSubFields, setOwnerEditSubFields] = useState([]);

  const [adminTab, setAdminTab] = useState('pending');
  const [ownerActiveTab, setOwnerActiveTab] = useState('pending');

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

    const unsubBookings = onSnapshot(collection(db, "bookings"), (snapshot) => {
      const rawBookings = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      // Hide legacy duplicate booking documents in the UI. New bookings are also
      // protected transactionally below, so duplicate history cannot be created.
      const seen = new Set();
      const uniqueBookings = rawBookings.filter(b => {
        const key = [
          b.fieldId || '',
          b.subFieldId || '',
          b.date || '',
          Number(b.startHour),
          Number(b.endHour),
          b.userEmail || '',
          b.bookedBy || ''
        ].join('|');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setBookings(uniqueBookings);
    });

    const unsubNoti = onSnapshot(collection(db, "notifications"), (snapshot) => {
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
      unsubBookings();
      unsubNoti();
    };
  }, []);

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

  const ownerFieldIds = fields.filter(f => f.ownerEmail === currentUser?.email).map(f => f.id);

    const handleLogin = (e) => {
    e.preventDefault();
    const loginIdentifier = email.trim().toLowerCase();
    if (loginIdentifier === 'admin@gmail.com') {
      if (password === adminPassword) {
        setCurrentUser({ name: 'System Admin', role: 'admin', email: 'admin@gmail.com' });
        setActiveTab('fields');
        setEmail('');
        setPassword('');
        return;
      } else {
        alert('Admin Password မှားယွင်းနေပါသည်။');
        return;
      }
    }

    let foundUser = usersList.find(u => u.name.toLowerCase() === email.trim().toLowerCase() && u.password === password);
    
    if (!foundUser) {
      const fieldMatched = fields.find(f => f.ownerEmail === email && f.ownerPassword === password);
      if (fieldMatched) {
        if (fieldMatched.ownerStatus === 'Disabled') {
          alert('ဤ Owner အကောင့်မှာ Disabled လုပ်ထားပါသဖြင့် Login ဝင်၍ မရပါ။');
          return;
        }
        foundUser = { name: fieldMatched.name, role: 'owner', email: fieldMatched.ownerEmail };
      }
    }

    if (foundUser) {
      setCurrentUser({ name: foundUser.name, role: foundUser.role, email: foundUser.email || foundUser.name });
      setActiveTab('fields');
    } else {
      alert('Username သို့မဟုတ် Password မှားယွင်းနေပါသည်။');
    }
    setEmail('');
    setPassword('');
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

    const newUserObj = {
      email: `${signupName.trim().toLowerCase()}_user@gmail.com`,
      password: signupPassword,
      name: signupName.trim(),
      role: 'user'
    };

    try {
      const docRef = await addDoc(collection(db, "users"), newUserObj);
      setUsersList(prev => [...prev, { id: docRef.id, ...newUserObj }]);
      alert('အကောင့်ဖွင့်ခြင်း အောင်မြင်ပါသည်။ ကျေးဇူးပြု၍ Login ဝင်ပါ။');
      setAuthMode('login');
      setSignupName('');
      setSignupPassword('');
    } catch (error) {
      console.error("Error signing up: ", error);
      alert('အကောင့်ဖွင့်ရာတွင် အမှားအယွင်းရှိပါသည်။');
    }
  };

    const handleChangeMyPassword = async (e) => {
    e.preventDefault();
    const nextPassword = myNewPassword.trim();
    if (!nextPassword) {
      alert('ကျေးဇူးပြု၍ Password အသစ် ထည့်သွင်းပါ။');
      return;
    }

    try {
      if (currentUser.role === 'admin') {
        // Use the same canonical document that is read during startup. `setDoc` with
        // merge also works when appConfig/settings has not been created yet.
        await setDoc(doc(db, 'appConfig', 'settings'), { adminPassword: nextPassword }, { merge: true });
        setAdminPassword(nextPassword);
        alert('Password ပြောင်းတာအောင်မြင်ပါသည်။ နောက်တစ်ကြိမ် Login ဝင်ရာတွင် Password အသစ်ကို အသုံးပြုပါ။');
        setMyNewPassword('');
      } else if (currentUser.role === 'owner') {
        const updatedFields = fields.map(f => {
          if (f.ownerEmail === currentUser.email) {
            return { ...f, ownerPassword: nextPassword };
          }
          return f;
        });
        const targetField = updatedFields.find(f => f.ownerEmail === currentUser.email);
        if (!targetField || !targetField.id) {
          alert('Owner ကွင်းအချက်အလက် မတွေ့ပါသဖြင့် Password ပြောင်း၍ မရပါ။');
          return;
        }
        await updateDoc(doc(db, 'fields', targetField.id), { ownerPassword: nextPassword });
        setFields(updatedFields);
        alert('Password ပြောင်းတာအောင်မြင်ပါသည်');
        setMyNewPassword('');
      }
    } catch (error) {
      console.error('Error changing password:', error);
      alert('Password ပြောင်းရာတွင် အမှားအယွင်းရှိပါသည်။ ကျေးဇူးပြု၍ ထပ်မံကြိုးစားပါ။');
    }
  };

  const handleLogout = () => {
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
      if (
        selectedStartSlot === '' ||
        selectedEndSlot === '' ||
        !selectedPaymentMethod ||
        !transactionLast5 ||
        !paymentScreenshot
      ) {
        alert('ကျေးဇူးပြု၍ လိုအပ်သော အချက်အလက်များ အားလုံးဖြည့်စွက်ပါ။');
        return;
      }

      if (transactionLast5.length !== 5) {
        alert('Transaction နံပါတ် နောက်ဆုံး ၅ လုံးတိတိ ထည့်ပါ။');
        return;
      }
    }

    let paymentScreenshotDataUrl = null;
    if (currentUser.role !== 'owner') {
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
        // Firestore Web transactions support document reads, but not query reads.
        // Refresh the booking list with a normal query, then use the transaction
        // below for the deterministic exact-booking document lock.
        const bookingsQuery = query(
          collection(db, "bookings"),
          where("fieldId", "==", userSelectedField.id)
        );
        const bookingsSnap = await getDocs(bookingsQuery);
        const existingBookings = bookingsSnap.docs.map(d => ({
          id: d.id,
          ...d.data()
        }));

        const conflictingBooking = existingBookings.find(b => {
          if (b.subFieldId !== selectedSubField.id || b.date !== userCheckDate) return false;
          if (b.status !== 'Pending' && b.status !== 'Approved') return false;

          const existingStart = Number(b.startHour);
          const existingEnd = Number(b.endHour);
          if (Number.isNaN(existingStart) || Number.isNaN(existingEnd)) return false;

          return startH < existingEnd && endH > existingStart;
        });

        if (conflictingBooking) {
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
          bookedAt: bookedTimeFormatted,
          createdAtTime: timestampMillis,
          userEmail: currentUser.email,
          userName: currentUser.role === 'owner' ? `${ownerCustomerName} (${ownerCustomerPhone}) [Owner Direct Booked]` : currentUser.name,
          paymentMethod: selectedPaymentMethod,
          transactionLast5: currentUser.role === 'owner' ? 'OWNER' : transactionLast5,
          screenshotName: currentUser.role === 'owner' ? 'Direct Manual Booking' : paymentScreenshot?.name,
          ...(currentUser.role === 'owner' ? {} : { paymentScreenshot: paymentScreenshotDataUrl }),
          status: currentUser.role === 'owner' ? 'Approved' : 'Pending',
          bookedBy: currentUser.role === 'owner' ? 'Owner' : 'User'
        };

        transaction.set(newBookingRef, newBookingObj);
        return {
          id: newBookingRef.id,
          ...newBookingObj
        };
      });

      setBookings(prev => [result, ...prev]);

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
        alert('Booking တင်ခြင်း အောင်မြင်ပါသည်။ Admin အတည်ပြုရန် စောင့်ဆိုင်းပါ။');
        setActiveTab('history');
      }

      setSelectedStartSlot('');
      setSelectedEndSlot('');
      setSelectedPaymentMethod('');
      setPaymentScreenshot(null);
      setTransactionLast5('');

    } catch (error) {
      if (error.message === 'SLOT_ALREADY_BOOKED') {
        alert('⚠️ ဒီအချိန်ကို အခြား User တစ်ယောက်က Booking တင်ပြီးပါပြီ။\n\nအခြားအချိန်ကို ရွေးချယ်ပေးပါ။');
        return;
      }

      console.error("Error saving booking:", error);
      alert('Booking သိမ်းဆည်းရာတွင် အမှားအယွင်းရှိပါသည်။');
    }
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
    setEditSubFields(field.subFields.map(sf => ({
      ...sf,
      openHour: sf.openHour !== undefined ? sf.openHour : (field.openHour ?? 8),
      closeHour: sf.closeHour !== undefined ? sf.closeHour : (field.closeHour ?? 22),
      status: sf.status ?? 'Active'
    })));
  };

  const handleSaveEditedField = async () => {
    if (!editingFieldId) return;
    if (!editFieldName || !editFieldLocation || editSubFields.length === 0) {
      alert('ကွင်းအမည်၊ မြို့နယ် နှင့် ကွင်းခွဲ အနည်းဆုံး ၁ ခု ထည့်သွင်းပါ။');
      return;
    }

    const updatedData = {
      name: editFieldName,
      location: editFieldLocation,
      address: editFieldAddress || editFieldLocation,
      phone: editFieldPhone || '09-XXXXXXXXX',
      openHour: parseInt(editFieldOpenHour),
      closeHour: parseInt(editFieldCloseHour),
      subFields: editSubFields,
      paymentInfo: { kpay: editFieldKpay, wave: editFieldWave }
    };

    try {
      await updateDoc(doc(db, "fields", editingFieldId), updatedData);
      alert('ကွင်းအချက်အလက် ပြင်ဆင်မှု အောင်မြင်ပါသည်။');
      setEditingFieldId(null);
    } catch (error) {
      console.error("Error updating field: ", error);
      alert('ကွင်းပြင်ဆင်ရာတွင် အမှားအယွင်းရှိပါသည်။');
    }
  };

  const handleStartEditOwnerField = (field) => {
    setEditingOwnerFieldId(field.id);
    setOwnerEditFieldName(field.name);
    setOwnerEditFieldLocation(field.location);
    setOwnerEditFieldAddress(field.address || '');
    setOwnerEditFieldPhone(field.phone || '');
    setOwnerEditFieldOpenHour(field.openHour ?? 8);
    setOwnerEditFieldCloseHour(field.closeHour ?? 22);
    setOwnerEditFieldKpay(field.paymentInfo?.kpay || '');
    setOwnerEditFieldWave(field.paymentInfo?.wave || '');
    setOwnerEditSubFields(field.subFields.map(sf => ({
      ...sf,
      openHour: sf.openHour !== undefined ? sf.openHour : (field.openHour ?? 8),
      closeHour: sf.closeHour !== undefined ? sf.closeHour : (field.closeHour ?? 22),
      status: sf.status ?? 'Active'
    })));
  };

  const handleSaveOwnerEditedField = async () => {
    if (!editingOwnerFieldId) return;
    if (!ownerEditFieldName || !ownerEditFieldLocation || ownerEditSubFields.length === 0) {
      alert('ကွင်းအမည်၊ မြို့နယ် နှင့် ကွင်းခွဲ အနည်းဆုံး ၁ ခု ထည့်သွင်းပါ။');
      return;
    }

    const updatedData = {
      name: ownerEditFieldName,
      location: ownerEditFieldLocation,
      address: ownerEditFieldAddress || ownerEditFieldLocation,
      phone: ownerEditFieldPhone || '09-XXXXXXXXX',
      openHour: parseInt(ownerEditFieldOpenHour),
      closeHour: parseInt(ownerEditFieldCloseHour),
      subFields: ownerEditSubFields,
      paymentInfo: { kpay: ownerEditFieldKpay, wave: ownerEditFieldWave }
    };

    try {
      await updateDoc(doc(db, "fields", editingOwnerFieldId), updatedData);
      
      await triggerSmsNotification(
        `🔔 [Owner Update] ${currentUser.name} (${ownerEditFieldName}) မှ ကွင်းခွဲအချိန်များ သို့မဟုတ် KPay/Wave နံပါတ်များကို ပြင်ဆင်သွားပါသည်။`,
        'owner_update',
        'owner_update_info',
        editingOwnerFieldId
      );

      alert('ကွင်းအချက်အလက် ပြင်ဆင်မှု အောင်မြင်ပါသည်။ Admin ထံသို့ အကြောင်းကြားပြီးပါပြီ။');
      setEditingOwnerFieldId(null);
    } catch (error) {
      console.error("Error updating owner field: ", error);
      alert('ကွင်းပြင်ဆင်ရာတွင် အမှားအယွင်းရှိပါသည်။');
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

    const targetBooking = bookings.find(b => b.id === bookingId);
    if (targetBooking && isBookingExpired(targetBooking)) {
      alert('ဤ Booking ၏ ရက်စွဲ သို့မဟုတ် ကစားချိန်သည် ကျော်လွန်သွားပါပြီ။ Approve / Reject လုပ်၍ မရတော့ပါ။');
      return;
    }

    if (window.confirm(confirmMsg)) {
      if (targetBooking) {
        const targetField = fields.find(f => f.id === targetBooking.fieldId);
        const bookingFieldName = targetBooking.subFieldName || targetField?.name || 'Unknown Field';
        const bookingDate = targetBooking.date || '-';
        const bookingTimeRange = targetBooking.fullTimeSlot || targetBooking.timeSlot || '-';
        const bookingUserName = targetBooking.userName || targetBooking.userEmail || 'User';
        const bookingSummary = `${bookingFieldName} (${bookingDate} / ${bookingTimeRange}) ${bookingUserName}`;
        let notiMsg = '';
        if (desiredStatus === 'Rejected') {
          notiMsg = `❌ [Booking Reject] ${bookingSummary} ၏ Booking ကို Reject လုပ်လိုက်ပါသည်။`;
        } else if (desiredStatus === 'Pending') {
          notiMsg = `⏳ [Booking Pending] ${bookingSummary} ၏ Booking ကို Pending သို့ ပြောင်းလိုက်ပါသည်။`;
        } else {
          notiMsg = `✅ [Booking Approved] ${bookingSummary} ၏ Booking ကို Approve လုပ်လိုက်ပါသည်။`;
        }
        await triggerSmsNotification(notiMsg, 'booking', subType, fieldId || targetBooking.fieldId, bookingId);
      }
      await updateDoc(doc(db, "bookings", bookingId), { status: desiredStatus });
    }
  };

  const activeFieldsForUser = fields.filter(f => {
    const status = f.ownerStatus ? f.ownerStatus.trim().toLowerCase() : '';
    return status !== 'disabled';
  });

  const baseFieldsList = currentUser?.role === 'owner'
    ? activeFieldsForUser.filter(f => f.ownerEmail === currentUser.email)
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

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4 font-sans">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8">
          <div className="text-center mb-6">
            <span className="text-3xl">⚽</span>
            <h1 className="text-2xl font-bold text-gray-800 mt-1">Field Booking App</h1>
          </div>

          <div className="flex bg-gray-100 p-1 rounded-xl mb-6">
            <button 
              type="button" 
              onClick={() => setAuthMode('login')} 
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${authMode === 'login' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500'}`}
            >
              Login ဝင်ရန်
            </button>
            <button 
              type="button" 
              onClick={() => setAuthMode('signup')} 
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${authMode === 'signup' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500'}`}
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
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  className="w-full border rounded-lg p-2.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:border-emerald-600" 
                  required 
                />
              </div>
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
        </div>
      </div>
    );
  }

  // If forced update is required, block entire app usage with a non-dismissible screen
  if (forceUpdate) {
    return (
      <div className="fixed inset-0 bg-gray-900 z-50 flex items-center justify-center p-4">
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

  return (
    <>
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

    <div className="min-h-screen bg-gray-50 font-sans pb-12">
      <header className="bg-emerald-700 text-white shadow-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center space-x-2 cursor-pointer" onClick={() => { setActiveTab('fields'); setUserSelectedField(null); setSelectedSubField(null); sessionStorage.removeItem('userSelectedField'); sessionStorage.removeItem('selectedSubField'); }}>
            <span className="text-2xl">⚽</span>
            <h1 className="text-xl font-bold">Field Booking App</h1>
          </div>
          <div className="flex items-center space-x-3">
            {currentUser.role === 'user' && (
              <button onClick={() => setActiveTab('history')} className="text-xs px-3 py-1.5 rounded bg-emerald-800 text-white font-bold hover:bg-emerald-900">📋 History</button>
            )}
            {currentUser.role === 'admin' && (
              <button onClick={() => setActiveTab('dashboard')} className="text-xs px-3 py-1.5 rounded bg-emerald-800 text-white font-bold hover:bg-emerald-900">⚙️ Admin Dashboard</button>
            )}
            {currentUser.role === 'owner' && (
              <button onClick={() => setActiveTab('owner_manage')} className="text-xs px-3 py-1.5 rounded bg-emerald-800 text-white font-bold hover:bg-emerald-900">🏟️ Manage Fields & History</button>
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
                >
                  🔔
                  {smsNotifications.filter(n => !n.read).length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] rounded-full h-4 w-4 flex items-center justify-center font-bold">
                      {smsNotifications.filter(n => !n.read).length}
                    </span>
                  )}
                </button>

                {showNotiDropdown && (
                  <div className="absolute right-0 mt-2 w-80 bg-white border text-gray-800 rounded-xl shadow-2xl z-50 p-3">
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

            <span className="text-xs bg-emerald-800 px-3 py-1 rounded font-medium">{currentUser.name} ({currentUser.role})</span>
            <button onClick={handleLogout} className="bg-red-500 hover:bg-red-600 text-white text-xs px-3 py-1.5 rounded font-bold">Logout</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 mt-6">
        {currentUser.role === 'admin' && activeTab === 'dashboard' ? (
          <div className="bg-white rounded-xl shadow p-6">
            <div className="flex justify-between items-center mb-6 border-b pb-4">
              <h2 className="text-xl font-bold text-gray-800">Admin Management Dashboard</h2>
              <button onClick={() => setActiveTab('fields')} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold">← ကွင်းများသို့ ပြန်ရန်</button>
            </div>

            <div className="flex flex-wrap gap-2 mb-6">
              <button onClick={() => setAdminTab('pending')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${adminTab === 'pending' ? 'bg-emerald-600 text-white shadow' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                Bookings အားလုံး ({sortedBookings.length})
              </button>
              <button onClick={() => setAdminTab('manage_fields')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${adminTab === 'manage_fields' ? 'bg-emerald-600 text-white shadow' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                Manage Fields & Add Field
              </button>
              <button onClick={() => setAdminTab('manage_owners')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${adminTab === 'manage_owners' ? 'bg-emerald-600 text-white shadow' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                🔑 Manage Owners & Passwords
              </button>
              <button onClick={() => setAdminTab('notifications_page')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${adminTab === 'notifications_page' ? 'bg-emerald-600 text-white shadow' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                🔔 Notifications & Filter Page
              </button>
              <button onClick={() => setAdminTab('change_password')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${adminTab === 'change_password' ? 'bg-emerald-600 text-white shadow' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                🔒 ကိုယ်ပိုင် Password ပြောင်းရန်
              </button>
            </div>

            {adminTab === 'change_password' && (
              <div className="bg-gray-50 border rounded-2xl p-6 max-w-md">
                <h3 className="text-lg font-bold mb-4 text-gray-800">Admin Password ပြောင်းလဲရန်</h3>
                <form onSubmit={handleChangeMyPassword} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Password အသစ်</label>
                    <input 
                      type="text" 
                      placeholder="Password အသစ်ထည့်ပါ" 
                      value={myNewPassword} 
                      onChange={(e) => setMyNewPassword(e.target.value)} 
                      className="w-full border rounded-lg p-2.5 text-sm bg-white font-mono" 
                      required 
                    />
                  </div>
                  <button type="submit" className="bg-emerald-600 text-white px-4 py-2.5 rounded-lg text-xs font-bold shadow hover:bg-emerald-700">Password ပြောင်းမည်</button>
                </form>
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
                <h3 className="text-base font-bold mb-4 text-gray-800">Booking မှတ်တမ်းများ</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-100 text-xs border-b">
                        <th className="p-3">အသုံးပြုသူ</th>
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
                      {sortedBookings.length > 0 ? (
                        sortedBookings.map(item => {
                          const targetField = fields.find(f => f.id === item.fieldId);
                          const bookingExpired = isBookingExpired(item);
                          return (
                            <tr key={item.id} className="hover:bg-gray-50">
                              <td className="p-3 font-medium">{item.userName}</td>
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
                                <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded">{item.totalPrice ? `${item.totalPrice.toLocaleString()} ကျပ်` : '-'}</span>
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
                          <td colSpan="9" className="text-center py-8 text-gray-500 text-sm">Booking များ မရှိသေးပါ။</td>
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
          <div className="bg-white rounded-xl shadow p-6">
            <div className="flex justify-between items-center mb-6 border-b pb-4">
              <h2 className="text-xl font-bold text-gray-800">🏟️ Owner Dashboard & Direct Booking</h2>
              <button onClick={() => setActiveTab('fields')} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold">← ကွင်းများသို့ ပြန်ရန်</button>
            </div>

            <div className="flex flex-wrap gap-2 mb-6">
              <button onClick={() => setOwnerActiveTab('pending')} className={`px-4 py-2 rounded-lg text-xs font-bold ${ownerActiveTab === 'pending' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
                Booking တင်ရန် (Direct Booking)
              </button>
              <button onClick={() => setOwnerActiveTab('history')} className={`px-4 py-2 rounded-lg text-xs font-bold ${ownerActiveTab === 'history' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
                Booking မှတ်တမ်းများ
              </button>
              <button onClick={() => setOwnerActiveTab('notifications_page')} className={`px-4 py-2 rounded-lg text-xs font-bold ${ownerActiveTab === 'notifications_page' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
                🔔 Notifications Page (Pending/New/Reject)
              </button>
              <button onClick={() => setOwnerActiveTab('password')} className={`px-4 py-2 rounded-lg text-xs font-bold ${ownerActiveTab === 'password' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
                🔒 Password ချိန်းရန်
              </button>
              <button onClick={() => setOwnerActiveTab('fields_edit')} className={`px-4 py-2 rounded-lg text-xs font-bold ${ownerActiveTab === 'fields_edit' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
                🏟️ ကွင်းအချိန်များနှင့် KPay/Wave နံပါတ်များ ပြင်ဆင်ရန်
              </button>
            </div>

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
                        <option value="all">ကိုယ့်ကွင်းများအားလုံး (All My Fields)</option>
                        {fields.filter(f => f.ownerEmail === currentUser.email).map(f => (
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

                      const myFieldIds = fields.filter(f => f.ownerEmail === currentUser.email).map(f => f.id);
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

                          const myFieldIds = fields.filter(f => f.ownerEmail === currentUser.email).map(f => f.id);
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
                <h3 className="text-lg font-bold mb-4 text-gray-800">Owner Password ချိန်းရန်</h3>
                <form onSubmit={handleChangeMyPassword} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Password အသစ်</label>
                    <input type="text" value={myNewPassword} onChange={(e) => setMyNewPassword(e.target.value)} className="w-full border rounded-lg p-2.5 text-sm bg-white font-mono" required />
                  </div>
                  <button type="submit" className="bg-emerald-600 text-white px-4 py-2.5 rounded-lg text-xs font-bold">Password ပြောင်းမည်</button>
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
                    {fields.filter(f => f.ownerEmail === currentUser.email).map(f => (
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
                        {fields.filter(f => f.ownerEmail === currentUser.email).map(f => (
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

                    {calculatedDuration > 0 && (
                      <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl text-xs space-y-1 font-bold text-emerald-900">
                        <p>⏱️ ကြာချိန်: {calculatedDuration} နာရီ</p>
                        <p>💵 စုစုပေါင်း ကျသင့်ငွေ: {calculatedTotalPrice.toLocaleString()} ကျပ်</p>
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
                <h3 className="text-base font-bold mb-4 text-gray-800">Booking မှတ်တမ်းများ (Owner Fields)</h3>
                <div className="overflow-x-auto rounded-lg">
                  <table className="w-full min-w-[1150px] table-fixed text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-100 text-xs border-b">
                        <th className="p-3 min-w-[210px] align-top">ဖောက်သည်</th>
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
                      {sortedBookings.filter(b => ownerFieldIds.includes(b.fieldId)).length > 0 ? (
                        sortedBookings
                          .filter(b => ownerFieldIds.includes(b.fieldId))
                          .map(item => {
                            const bookingExpired = isBookingExpired(item);
                            const timeRange = item.fullTimeSlot || item.timeSlot || '';
                            const [startTime, endTime] = timeRange.split(/\s*-\s*/);
                            const displayTimeRange = startTime && endTime ? `${startTime} - ${endTime}` : timeRange || '-';
                            const screenshotSrc = item.paymentScreenshot || item.paymentScreenshotUrl || item.screenshotDataUrl;
                            return (
                              <tr key={item.id} className="hover:bg-gray-50 align-top">
                                <td className="p-3 font-medium break-words">{item.userName || '-'}</td>
                                <td className="p-3 font-bold text-xs break-words">{item.subFieldName || '-'}</td>
                                <td className="p-3 text-xs font-mono whitespace-nowrap">{item.date || '-'}</td>
                                <td className="p-3 text-xs font-bold text-emerald-700 whitespace-nowrap">{displayTimeRange}</td>
                                <td className="p-3 text-xs whitespace-nowrap"><span className="bg-blue-50 text-blue-600 font-bold px-2 py-0.5 rounded">{item.duration || '-'}</span></td>
                                <td className="p-3 text-xs font-mono text-gray-500 whitespace-nowrap">{item.bookedAt || '-'}</td>
                                <td className="p-3 text-xs font-bold text-emerald-700 whitespace-nowrap">{item.totalPrice?.toLocaleString() || '-'} ကျပ်</td>
                                <td className="p-3 text-xs font-bold align-top">
                                  <div className="space-y-2">
                                    <div className="uppercase whitespace-nowrap">{item.paymentMethod || '-'}</div>
                                    {screenshotSrc ? (
                                      <a
                                        href={screenshotSrc}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-1.5 text-emerald-700 hover:bg-emerald-100"
                                        title="Payment Screenshot ကြည့်ရန်"
                                      >
                                        <img src={screenshotSrc} alt="Payment screenshot" className="h-14 w-20 rounded object-cover" />
                                        <span className="text-[10px] font-bold whitespace-nowrap">ကြည့်ရန် ↗</span>
                                      </a>
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
                          <td colSpan="10" className="text-center py-8 text-gray-500 text-sm">Booking များ မရှိသေးပါ။</td>
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
            {activeTab !== 'history' && (
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

                                                  <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">ငွေပေးချေမည့်နည်းလမ်း</label>
                            <select 
                              value={selectedPaymentMethod} 
                              onChange={(e) => setSelectedPaymentMethod(e.target.value)}
                              className="w-full border rounded-lg p-2.5 text-sm bg-white font-bold"
                            >
                              <option value="">-- နည်းလမ်းရွေးပါ --</option>
                              <option value="KPay">KPay</option>
                              <option value="Wave">Wave</option>
                            </select>

                            {/* Dedicated Payment Account Box below dropdown */}
                            {selectedPaymentMethod && (
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

                        {calculatedDuration > 0 && (
                          <div className="bg-emerald-100 border border-emerald-300 p-3 rounded-xl text-xs space-y-1 font-bold text-emerald-900">
                            <p>⏱️ ကြာချိန်: {calculatedDuration} နာရီ ({format12Hour(parseInt(selectedStartSlot))} ~ {format12Hour(parseInt(selectedEndSlot))})</p>
                            <p>💵 စုစုပေါင်း ကျသင့်ငွေ: {calculatedTotalPrice.toLocaleString()} ကျပ်</p>
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

            {activeTab === 'history' && currentUser.role === 'user' && (
              <div className="bg-white rounded-xl shadow p-6 mt-6">
                <div className="flex justify-between items-center mb-6 border-b pb-4">
                  <h2 className="text-xl font-bold text-gray-800">📋 ကျွန်ုပ်၏ Booking မှတ်တမ်းများ</h2>
                  <button onClick={() => setActiveTab('fields')} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold">← ကွင်းများသို့ ပြန်ရန်</button>
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
                      {sortedBookings.filter(b => b.userEmail === currentUser.email).length > 0 ? (
                        sortedBookings
                          .filter(b => b.userEmail === currentUser.email)
                          .map(item => {
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
                                <td className="p-3 text-xs font-bold text-emerald-700 whitespace-nowrap">{item.totalPrice?.toLocaleString() || '-'} ကျပ်</td>
                                <td className="p-3 text-xs whitespace-nowrap">
                                  <div className="uppercase font-bold">{item.paymentMethod || '-'}</div>
                                  <div className="font-mono text-gray-600">Txn: {item.transactionLast5 || '-'}</div>
                                </td>
                                <td className="p-3 font-bold text-xs whitespace-nowrap">
                                  <span className={item.status === 'Approved' ? 'text-emerald-600' : item.status === 'Rejected' ? 'text-red-500' : 'text-amber-500'}>{item.status || '-'}</span>
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
      </main>
    </div>
    </>
  );
}