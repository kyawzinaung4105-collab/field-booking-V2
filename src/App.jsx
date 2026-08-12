import React, { useState, useEffect } from 'react';
import { db } from './firebase'; 
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, setDoc, runTransaction, onSnapshot } from 'firebase/firestore';

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

const generateSingleTimeSlots = (openHour, closeHour) => {
  const slots = [];
  const start = openHour !== undefined && !isNaN(openHour) ? parseInt(openHour) : 8;
  const end = closeHour !== undefined && !isNaN(closeHour) ? parseInt(closeHour) : 22;
  
  for (let i = start; i < end; i++) {
    const format12Hour = (h24) => {
      const period = h24 >= 12 ? 'PM' : 'AM';
      const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
      return `${h12 < 10 ? `0${h12}` : h12}:00 ${period}`;
    };
    slots.push({ hour: i, label: `${format12Hour(i)} - ${format12Hour(i + 1)}` });
  }
  return slots;
};

export default function FieldBookingApp() {
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
  const [selectedTownship, setSelectedTownship] = useState('');

  const [usersList, setUsersList] = useState(defaultUsers);
  const [fields, setFields] = useState(defaultFields);
  const [bookings, setBookings] = useState([]);
  const [smsNotifications, setSmsNotifications] = useState([]);
  const [showNotiDropdown, setShowNotiDropdown] = useState(false);

  // Notification Filter state for Admin Page
  const [notiFilterType, setNotiFilterType] = useState('all');
  const [adminNotiDate, setAdminNotiDate] = useState(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });
  const [adminNotiFieldId, setAdminNotiFieldId] = useState('all');
  
  // Notification Filter state for Owner Page
  const [ownerNotiFilterType, setOwnerNotiFilterType] = useState('all');
  const [ownerNotiDate, setOwnerNotiDate] = useState(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });
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
      setBookings(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubNoti = onSnapshot(collection(db, "notifications"), (snapshot) => {
      setSmsNotifications(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
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

  const triggerSmsNotification = async (message, type = 'general', subType = '', fieldId = '') => {
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
      time: now.toLocaleTimeString(),
      date: currentDateStr,
      read: false
    };
    try {
      const docRef = await addDoc(collection(db, "notifications"), newNoti);
      setSmsNotifications(prev => [{ id: docRef.id, ...newNoti }, ...prev]);
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

    if (email.trim().toLowerCase() === 'admin@gmail.com') {
      if (password === 'admin123') {
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
    if (!myNewPassword.trim()) {
      alert('ကျေးဇူးပြု၍ Password အသစ် ထည့်သွင်းပါ။');
      return;
    }

    if (currentUser.role === 'admin') {
      alert('Password ပြောင်းတာအောင်မြင်ပါသည်');
      setMyNewPassword('');
    } else if (currentUser.role === 'owner') {
      const updatedFields = fields.map(f => {
        if (f.ownerEmail === currentUser.email) {
          return { ...f, ownerPassword: myNewPassword.trim() };
        }
        return f;
      });
      setFields(updatedFields);
      const targetField = updatedFields.find(f => f.ownerEmail === currentUser.email);
      if (targetField && targetField.id) {
        await updateDoc(doc(db, "fields", targetField.id), { ownerPassword: myNewPassword.trim() });
      }
      alert('Password ပြောင်းတာအောင်မြင်ပါသည်');
      setMyNewPassword('');
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

  const isSlotUnavailable = (hour) => {
    if (checkIsExpired(hour)) return true;
    const slotLabelCheck = `${format12Hour(hour)} - ${format12Hour(hour + 1)}`;
    const bookingFound = bookings.find(
      b => b.subFieldId === selectedSubField?.id && b.date === userCheckDate && (b.status === 'Approved' || b.status === 'Pending') &&
      (b.timeSlot === slotLabelCheck || (b.startHour !== undefined && b.endHour !== undefined && hour >= b.startHour && hour < b.endHour))
    );
    return !!bookingFound;
  };

  const getSlotStatusType = (hour) => {
    if (checkIsExpired(hour)) return 'expired';
    
    const approvedBooking = bookings.find(
      b => b.subFieldId === selectedSubField?.id && 
           b.date === userCheckDate && 
           b.status === 'Approved' && 
           (hour >= b.startHour && hour < b.endHour)
    );
    if (approvedBooking) return 'booked';

    const pendingBooking = bookings.find(
      b => b.subFieldId === selectedSubField?.id && 
           b.date === userCheckDate && 
           b.status === 'Pending' && 
           (hour >= b.startHour && hour < b.endHour)
    );
    if (pendingBooking) return 'pending';

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

    const startH = parseInt(selectedStartSlot);
    const endH = parseInt(selectedEndSlot);

    if (startH >= endH) {
      alert('ပြီးဆုံးမည့်အချိန်သည် စတင်မည့်အချိန်ထက် နောက်ကျရပါမည်။');
      return;
    }

    for (let h = startH; h < endH; h++) {
      if (isSlotUnavailable(h)) {
        alert('ရွေးချယ်ထားသော အချိန်အတွင်း Booking ရှိနေပါသည်။ အခြားအချိန်ကို ရွေးချယ်ပါ။');
        return;
      }
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
        const bookingsRef = collection(db, "bookings");
        const bookingsSnap = await getDocs(bookingsRef);
        const existingBookings = bookingsSnap.docs.map(d => ({
          id: d.id,
          ...d.data()
        }));

        const conflictingBooking = existingBookings.find(b => {
          if (
            b.fieldId !== userSelectedField.id ||
            b.subFieldId !== selectedSubField.id ||
            b.date !== userCheckDate
          ) {
            return false;
          }

          if (b.status !== 'Pending' && b.status !== 'Approved') {
            return false;
          }

          const existingStart = Number(b.startHour);
          const existingEnd = Number(b.endHour);

          if (Number.isNaN(existingStart) || Number.isNaN(existingEnd)) {
            return false;
          }

          return (
            startH < existingEnd &&
            endH > existingStart
          );
        });

        if (conflictingBooking) {
          throw new Error('SLOT_ALREADY_BOOKED');
        }

        const newBookingRef = doc(collection(db, "bookings"));

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
          userSelectedField.id
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
          userSelectedField.id
        );
        alert('Booking တင်ခြင်း အောင်မြင်ပါသည်။ ');
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

    if (window.confirm(confirmMsg)) {
      const targetBooking = bookings.find(b => b.id === bookingId);
      if (targetBooking) {
        let notiMsg = '';
        if (desiredStatus === 'Rejected') {
          notiMsg = `❌ [Booking Reject] ${targetBooking.subFieldName} (${targetBooking.date}) ၏ Booking ကို Reject လုပ်လိုက်ပါသည်။`;
        } else if (desiredStatus === 'Pending') {
          notiMsg = `⏳ [Booking Pending] ${targetBooking.subFieldName} (${targetBooking.date}) ၏ Booking ကို Pending သို့ ပြောင်းလိုက်ပါသည်။`;
        } else {
          notiMsg = `✅ [Booking Approved] ${targetBooking.subFieldName} (${targetBooking.date}) ၏ Booking ကို Approve လုပ်လိုက်ပါသည်။`;
        }
        await triggerSmsNotification(notiMsg, 'booking', subType, fieldId || targetBooking.fieldId);
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

  return (
    <div className="min-h-screen bg-gray-50 font-sans pb-12">
      <header className="bg-emerald-700 text-white shadow-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center space-x-2 cursor-pointer" onClick={() => { setActiveTab('fields'); setUserSelectedField(null); setSelectedSubField(null); sessionStorage.removeItem('userSelectedField'); sessionStorage.removeItem('selectedSubField'); }}>
            <span className="text-2xl">⚽</span>
            <h1 className="text-xl font-bold">Field Booking App</h1>
          </div>
          <div className="flex items-center space-x-3">
            {currentUser.role === 'user' && (
              <>
                <button 
                  onClick={() => { setActiveTab('fields'); }} 
                  className={`text-xs px-3 py-1.5 rounded font-bold ${activeTab === 'fields' ? 'bg-emerald-900 text-white' : 'bg-emerald-800 text-emerald-100 hover:bg-emerald-900'}`}
                >
                  🏟️ Booking တဲ့ရန်
                </button>
                <button 
                  onClick={() => { setActiveTab('history'); }} 
                  className={`text-xs px-3 py-1.5 rounded font-bold ${activeTab === 'history' ? 'bg-emerald-900 text-white' : 'bg-emerald-800 text-emerald-100 hover:bg-emerald-900'}`}
                >
                  📋 Booking History
                </button>
              </>
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
                    <div className="max-h-60 overflow-y-auto space-y-2">
                      {smsNotifications.length === 0 ? (
                        <p className="text-xs text-gray-500 text-center py-4">အကြောင်းကြားစာ မရှိသေးပါ။</p>
                      ) : (
                        smsNotifications.map(n => (
                          <div key={n.id} className="text-xs bg-gray-50 p-2.5 rounded-lg border-l-4 border-emerald-600 shadow-sm">
                            <p className="text-gray-800">{n.message}</p>
                            <span className="text-[10px] text-gray-400 mt-1 block">{n.date} {n.time}</span>
                          </div>
                        ))
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
                      smsNotifications
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
                      <p className="text-center py-12 text-gray-500 text-sm">ရွေးချယ်ထားသော Filter နှင့် ကိုက်ညီသော Notifications များ မရှိသေးပါ။</p>
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
                                  onClick={() => handleStatusChangeWithConfirm(item.id, item.status, 'Approved', item.fieldId)} 
                                  className="bg-emerald-600 text-white px-2.5 py-1 rounded text-[11px] font-bold hover:bg-emerald-700"
                                >
                                  Approve
                                </button>
                                <button 
                                  onClick={() => handleStatusChangeWithConfirm(item.id, item.status, 'Rejected', item.fieldId)} 
                                  className="bg-red-500 text-white px-2.5 py-1 rounded text-[11px] font-bold hover:bg-red-600"
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
                      <h3 className="text-base font-bold text-amber-900">✏️ ကွင်းအချက်အလက် ပြင်ဆင်ရန်</h3>
                      <button onClick={() => setEditingFieldId(null)} className="text-xs text-red-600 font-bold hover:underline">Cancel</button>
                    </div>
                    {/* Field Edit Form Items */}
                  </div>
                ) : (
                  <div className="bg-gray-50 border rounded-2xl p-6">
                    <h3 className="text-base font-bold mb-4 text-gray-800">🏟️ ကွင်းအသစ် ထည့်သွင်းရန်</h3>
                    <form onSubmit={handleCreateNewField} className="space-y-4">
                      {/* New Field Form Fields */}
                      <button type="submit" className="w-full bg-emerald-600 text-white py-3 rounded-lg text-sm font-bold shadow hover:bg-emerald-700">ကွင်းအသစ်ကို သိမ်းဆည်းမည်</button>
                    </form>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : currentUser.role === 'owner' && activeTab === 'owner_manage' ? (
          <div className="bg-white rounded-xl shadow p-6">
            <div className="flex justify-between items-center mb-6 border-b pb-4">
              <h2 className="text-xl font-bold text-gray-800">🏟️ Owner Dashboard & Direct Booking</h2>
              <button onClick={() => setActiveTab('fields')} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold">← ကွင်းများသို့ ပြန်ရန်</button>
            </div>
            {/* Owner Management Content */}
          </div>
        ) : currentUser.role === 'user' && activeTab === 'history' ? (
          /* ======================================================== */
          /* 1. BOOKING HISTORY PAGE (သီးသန့်ခွဲထားသော Page)             */
          /* ======================================================== */
          <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8 animate-fadeIn">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b pb-4 mb-6 gap-4">
              <div>
                <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  <span>📋</span> ကျွန်ုပ်၏ Booking မှတ်တမ်းများ (Booking History)
                </h2>
                <p className="text-xs text-gray-500 mt-1">သင် တင်ထားခဲ့သော Booking အချက်အလက်များနှင့် Status များကို ဤနေရာတွင် ကြည့်ရှုနိုင်ပါသည်။</p>
              </div>
              <button 
                onClick={() => setActiveTab('fields')} 
                className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-emerald-700 shadow transition-all"
              >
                + ကွင်းအသစ်ထပ် Booking တင်မည်
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-100 text-xs border-b text-gray-700 uppercase font-bold">
                    <th className="p-3 rounded-l-lg">ကွင်း / ကွင်းခွဲ</th>
                    <th className="p-3">တင်ချိန်</th>
                    <th className="p-3">ကစားမည့်အချိန်</th>
                    <th className="p-3">ကြာချိန်</th>
                    <th className="p-3">သင့်ငွေ</th>
                    <th className="p-3">ငွေပေးချေမှု / Txn</th>
                    <th className="p-3 rounded-r-lg">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y text-sm">
                  {sortedBookings.filter(b => b.userEmail === currentUser.email).length > 0 ? (
                    sortedBookings
                      .filter(b => b.userEmail === currentUser.email)
                      .map(item => {
                        const targetField = fields.find(f => f.id === item.fieldId);
                        return (
                          <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                            <td className="p-3">
                              <div className="font-bold text-gray-800">{targetField?.name || 'Unknown Field'}</div>
                              <div className="text-xs text-emerald-600 font-semibold">{item.subFieldName}</div>
                            </td>
                            <td className="p-3 text-xs font-mono text-gray-500">
                              {item.bookedAt || '-'}
                            </td>
                            <td className="p-3 text-xs">
                              <div className="text-gray-700 font-bold">{item.date}</div>
                              <div className="font-bold text-emerald-700">{item.fullTimeSlot || item.timeSlot}</div>
                            </td>
                            <td className="p-3 text-xs">
                              <span className="font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full">{item.duration || '1 Hr'}</span>
                            </td>
                            <td className="p-3 text-xs">
                              <span className="font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full">{item.totalPrice ? `${item.totalPrice.toLocaleString()} ကျပ်` : '-'}</span>
                            </td>
                            <td className="p-3 text-xs">
                              <div className="uppercase font-bold text-gray-700">{item.paymentMethod}</div>
                              <div className="font-mono text-gray-500">Txn: {item.transactionLast5}</div>
                            </td>
                            <td className="p-3 font-bold text-xs">
                              <span className={`px-3 py-1 rounded-full text-xs inline-block ${
                                item.status === 'Approved' ? 'bg-emerald-100 text-emerald-800' : 
                                item.status === 'Rejected' ? 'bg-red-100 text-red-800' : 
                                'bg-amber-100 text-amber-800'
                              }`}>
                                {item.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                  ) : (
                    <tr>
                      <td colSpan="7" className="text-center py-12 text-gray-400 text-sm">
                        <div className="text-4xl mb-2">📭</div>
                        သင် တင်ထားသော Booking မှတ်တမ်းများ မရှိသေးပါ။
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* ======================================================== */
          /* 2. FIELD SELECTION & BOOKING FORM PAGE (သီးသန့်ခွဲထားသော Page) */
          /* ======================================================== */
          <div className="space-y-6">
            {!userSelectedField ? (
              <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                  <div>
                    <h2 className="text-xl font-bold text-gray-800">🏟️ ဘောလုံးကွင်းများ ရွေးချယ်ရန်</h2>
                    <p className="text-xs text-gray-500 mt-1">အောက်ပါ ကွင်းများထဲမှ သင်ကြိုက်နှစ်သက်ရာ ကွင်းကို ရွေးချယ်၍ Booking တင်နိုင်ပါသည်။</p>
                  </div>
                  <div className="flex items-center gap-2 w-full md:w-auto township-dropdown-container">
                    <input 
                      type="text" 
                      placeholder="မြို့နယ်ဖြင့် ရှာရန် (ဥပမာ - လှိုင်)" 
                      value={selectedTownship}
                      onChange={(e) => setSelectedTownship(e.target.value)}
                      className="border rounded-xl px-3 py-2 text-xs bg-gray-50 focus:bg-white focus:outline-none focus:border-emerald-600 w-full md:w-60"
                    />
                    {selectedTownship && (
                      <button onClick={() => setSelectedTownship('')} className="text-xs text-gray-500 hover:text-red-500 font-bold px-2">ဖျက်ရန်</button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {displayedFields.length > 0 ? (
                    displayedFields.map(field => (
                      <div key={field.id} className="bg-white border rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between border-t-4 border-t-emerald-600">
                        <div>
                          <div className="flex justify-between items-start mb-2">
                            <h3 className="font-bold text-lg text-gray-800">{field.name}</h3>
                            <span className="text-xs bg-emerald-50 text-emerald-700 font-bold px-2.5 py-1 rounded-full">{field.location}</span>
                          </div>
                          <p className="text-xs text-gray-500 mb-2">{field.address} | Tel: {field.phone}</p>
                          <p className="text-xs text-emerald-800 font-bold mb-4 bg-emerald-50/50 p-2 rounded-lg">🕒 ဖွင့်ချိန်: {format12Hour(field.openHour ?? 8)} မှ {format12Hour(field.closeHour ?? 22)} ထိ</p>
                          
                          <div className="space-y-2 mb-4">
                            <p className="text-xs font-bold text-gray-700">ကွင်းခွဲများ (Sub-Fields):</p>
                            {field.subFields.map(sf => (
                              <div key={sf.id} className="text-xs bg-gray-50 p-2.5 rounded-xl flex justify-between items-center border">
                                <div>
                                  <span className="font-bold text-gray-800">{sf.name}</span>
                                  <span className="text-emerald-700 font-semibold block">{sf.price.toLocaleString()} ကျပ် / နာရီ</span>
                                </div>
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${sf.status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                                  {sf.status}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <button 
                          onClick={() => {
                            setUserSelectedField(field);
                            if (field.subFields.length > 0) {
                              setSelectedSubField(field.subFields[0]);
                            }
                          }}
                          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl text-xs font-bold shadow transition-colors"
                        >
                          ဤကွင်းကို ရွေးချယ်မည် (Select Field) →
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="col-span-full text-center py-12 text-gray-500 text-sm">
                      ရှာဖွေတွေ့ရှိသော ဘောလုံးကွင်းများ မရှိပါ။
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8">
                <div className="flex justify-between items-center border-b pb-4 mb-6">
                  <div>
                    <h2 className="text-xl font-bold text-gray-800">⚽ {userSelectedField.name} - Booking တင်ရန်</h2>
                    <p className="text-xs text-gray-500 mt-1">အောက်ပါ ဖောင်တွင် လိုအပ်သော အချက်အလက်များနှင့် အချိန်ကို ရွေးချယ်ပါ။</p>
                  </div>
                  <button 
                    onClick={() => {
                      setUserSelectedField(null);
                      setSelectedSubField(null);
                      sessionStorage.removeItem('userSelectedField');
                      sessionStorage.removeItem('selectedSubField');
                    }}
                    className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-xl text-xs font-bold transition-all"
                  >
                    ← ကွင်းများစာရင်းသို့ ပြန်သွားရန်
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* Left Column: SubField & Date selection */}
                  <div className="lg:col-span-1 space-y-6">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-2">ကွင်းခွဲ (Sub-Field) ရွေးရန်</label>
                      <div className="space-y-2">
                        {userSelectedField.subFields.map(sf => (
                          <div 
                            key={sf.id}
                            onClick={() => setSelectedSubField(sf)}
                            className={`p-3 rounded-xl border cursor-pointer transition-all flex justify-between items-center ${selectedSubField?.id === sf.id ? 'border-emerald-600 bg-emerald-50/50 shadow-sm' : 'border-gray-200 hover:bg-gray-50'}`}
                          >
                            <div>
                              <div className="font-bold text-sm text-gray-800">{sf.name}</div>
                              <div className="text-xs text-emerald-700 font-semibold">{sf.price.toLocaleString()} ကျပ် / နာရီ</div>
                            </div>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${sf.status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                              {sf.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-2">ကစားမည့်ရက်စွဲ (Date)</label>
                      <input 
                        type="date" 
                        value={userCheckDate}
                        min={new Date().toISOString().split('T')[0]}
                        onChange={(e) => setUserCheckDate(e.target.value)}
                        className="w-full border rounded-xl p-3 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:border-emerald-600 font-bold"
                      />
                    </div>

                    <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl space-y-2 text-xs">
                      <p className="font-bold text-emerald-900">💳 ငွေပေးချေရန် နံပါတ်များ:</p>
                      <p className="text-emerald-800"><b>KPay:</b> {userSelectedField.paymentInfo?.kpay || 'မရှိပါ'}</p>
                      <p className="text-emerald-800"><b>Wave:</b> {userSelectedField.paymentInfo?.wave || 'မရှိပါ'}</p>
                    </div>
                  </div>

                  {/* Right Column: Time Slots & Booking Submission Form */}
                  <div className="lg:col-span-2 space-y-6">
                    {selectedSubField ? (
                      <div>
                        <div className="flex justify-between items-center mb-3">
                          <h3 className="text-sm font-bold text-gray-800">🕒 အချိန်ရွေးချယ်ရန် ({selectedSubField.name})</h3>
                          <span className="text-xs text-gray-500">စတင်ချိန်နှင့် ပြီးဆုံးမည့်အချိန်ကို ရွေးပါ</span>
                        </div>

                        {/* Slot Selection Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-6">
                          {generateSingleTimeSlots(
                            selectedSubField.openHour !== undefined ? selectedSubField.openHour : (userSelectedField.openHour ?? 8), 
                            selectedSubField.closeHour !== undefined ? selectedSubField.closeHour : (userSelectedField.closeHour ?? 22)
                          ).map(slot => {
                            const status = getSlotStatusType(slot.hour);
                            const isStart = selectedStartSlot !== '' && parseInt(selectedStartSlot) === slot.hour;
                            const isEnd = selectedEndSlot !== '' && parseInt(selectedEndSlot) === slot.hour + 1;
                            const isInRange = selectedStartSlot !== '' && selectedEndSlot !== '' && slot.hour >= parseInt(selectedStartSlot) && slot.hour < parseInt(selectedEndSlot);

                            let bgClass = 'bg-white border-gray-200 hover:border-emerald-500 text-gray-700';
                            if (status === 'expired') bgClass = 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed opacity-60';
                            else if (status === 'booked') bgClass = 'bg-red-50 border-red-200 text-red-600 cursor-not-allowed';
                            else if (status === 'pending') bgClass = 'bg-amber-50 border-amber-200 text-amber-600 cursor-not-allowed';
                            else if (isStart || isEnd || isInRange) bgClass = 'bg-emerald-600 border-emerald-600 text-white shadow-sm';

                            return (
                              <button
                                key={slot.hour}
                                type="button"
                                disabled={status !== 'available'}
                                onClick={() => {
                                  if (selectedStartSlot === '' || (selectedStartSlot !== '' && selectedEndSlot !== '')) {
                                    setSelectedStartSlot(slot.hour);
                                    setSelectedEndSlot('');
                                  } else {
                                    if (slot.hour + 1 > parseInt(selectedStartSlot)) {
                                      setSelectedEndSlot(slot.hour + 1);
                                    } else {
                                      setSelectedStartSlot(slot.hour);
                                      setSelectedEndSlot('');
                                    }
                                  }
                                }}
                                className={`border rounded-xl p-2.5 text-xs font-bold transition-all flex flex-col items-center justify-center ${bgClass}`}
                              >
                                <span>{slot.label}</span>
                                <span className="text-[10px] font-normal mt-0.5 opacity-80">
                                  {status === 'expired' ? 'ကုန်ဆုံးပြီ' : status === 'booked' ? 'Bookပြီး' : status === 'pending' ? 'စောင့်ဆိုင်းဆဲ' : 'ရနိုင်သည်'}
                                </span>
                              </button>
                            );
                          })}
                        </div>

                        {/* Booking Summary Box */}
                        {calculatedDuration > 0 && (
                          <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl mb-6 flex justify-between items-center">
                            <div>
                              <p className="text-xs text-emerald-800 font-bold">ရွေးချယ်ထားသော ကြာချိန်: <span className="text-emerald-900 font-extrabold">{calculatedDuration} နာရီ</span></p>
                              <p className="text-xs text-emerald-800 font-bold mt-1">ကျသင့်ငွေ စုစုပေါင်း: <span className="text-emerald-900 font-extrabold text-sm">{calculatedTotalPrice.toLocaleString()} ကျပ်</span></p>
                            </div>
                            <button 
                              type="button" 
                              onClick={() => { setSelectedStartSlot(''); setSelectedEndSlot(''); }}
                              className="text-xs text-red-600 hover:underline font-bold"
                            >
                              အချိန်ပြန်ရွေးမည်
                            </button>
                          </div>
                        )}

                        {/* Booking Submit Form */}
                        <form onSubmit={handleBookingSubmit} className="space-y-4 border-t pt-4">
                          <h3 className="text-sm font-bold text-gray-800">ငွေပေးချေမှု အချက်အလက်များ ဖြည့်သွင်းရန်</h3>
                          
                          <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">ငွေလွှဲမည့် နည်းလမ်း</label>
                            <select 
                              value={selectedPaymentMethod} 
                              onChange={(e) => setSelectedPaymentMethod(e.target.value)}
                              className="w-full border rounded-xl p-3 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:border-emerald-600 font-bold"
                              required
                            >
                              <option value="">ငွေပေးချေမည့် နည်းလမ်းကို ရွေးပါ</option>
                              <option value="kpay">KPay (KBZ Pay)</option>
                              <option value="wave">Wave Money</option>
                            </select>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-bold text-gray-700 mb-1">ငွေလွှဲပြီး Transaction နံပါတ် နောက်ဆုံး ၅ လုံး</label>
                              <input 
                                type="text" 
                                maxLength="5"
                                placeholder="ဥပမာ - 12345" 
                                value={transactionLast5}
                                onChange={(e) => setTransactionLast5(e.target.value.replace(/[^0-9]/g, ''))}
                                className="w-full border rounded-xl p-3 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:border-emerald-600 font-mono font-bold"
                                required
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-gray-700 mb-1">ငွေလွှဲ Screenshot တင်ရန်</label>
                              <input 
                                type="file" 
                                accept="image/*"
                                onChange={(e) => setPaymentScreenshot(e.target.files[0])}
                                className="w-full border rounded-xl p-2 text-xs bg-gray-50 focus:bg-white focus:outline-none file:mr-4 file:py-1 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
                                required
                              />
                            </div>
                          </div>

                          <button 
                            type="submit" 
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3.5 rounded-xl text-sm font-bold shadow-lg transition-colors mt-2"
                          >
                            Booking တင်မည် (Submit Booking)
                          </button>
                        </form>
                      </div>
                    ) : (
                      <div className="text-center py-20 text-gray-400 text-sm">
                        ကျေးဇူးပြု၍ ဘယ်ဘက်မှ ကွင်းခွဲ (Sub-Field) တစ်ခုကို ရွေးချယ်ပါ။
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}