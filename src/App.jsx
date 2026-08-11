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
  
  const [newOwnerEmail, setNewOwnerEmail] = useState('');
  const [newOwnerPassword, setNewOwnerPassword] = useState('');

  const [newSubFieldName, setNewSubFieldName] = useState('');
  const [newSubFieldPrice, setNewSubFieldPrice] = useState('');
  const [newSubFieldStatus, setNewSubFieldStatus] = useState('Active');

  const [ownerSubFields, setOwnerSubFields] = useState([]);

  const [editingFieldId, setEditingFieldId] = useState(null);
  const [editFieldName, setEditFieldName] = useState('');
  const [editFieldLocation, setEditFieldLocation] = useState('');
  const [editFieldAddress, setEditFieldAddress] = useState('');
  const [editFieldPhone, setEditFieldPhone] = useState('');
  const [editFieldOpenHour, setEditFieldOpenHour] = useState(8);
  const [editFieldCloseHour, setEditFieldCloseHour] = useState(22);
  const [editSubFields, setEditSubFields] = useState([]);

  // Owner ဘက်မှ မိမိကွင်းများကို ပြင်ဆင်ရန် state များ
  const [editingOwnerFieldId, setEditingOwnerFieldId] = useState(null);
  const [ownerEditFieldName, setOwnerEditFieldName] = useState('');
  const [ownerEditFieldLocation, setOwnerEditFieldLocation] = useState('');
  const [ownerEditFieldAddress, setOwnerEditFieldAddress] = useState('');
  const [ownerEditFieldPhone, setOwnerEditFieldPhone] = useState('');
  const [ownerEditFieldOpenHour, setOwnerEditFieldOpenHour] = useState(8);
  const [ownerEditFieldCloseHour, setOwnerEditFieldCloseHour] = useState(22);
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

  const triggerSmsNotification = async (message) => {
    const newNoti = {
      message: message,
      time: new Date().toLocaleTimeString(),
      date: new Date().toLocaleDateString(),
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
          `🔔 [Direct Booking] Owner မှ ${targetFieldObj?.name} (${selectedSubField.name}) အတွက် Direct Booking တင်ပြီးပါပြီ။`
        );
        alert('Owner ၏ Manual Booking တင်ခြင်း အောင်မြင်ပြီး အတည်ပြုပြီးသား ဖြစ်သွားပါပြီ။');
        setOwnerCustomerName('');
        setOwnerCustomerPhone('');
        setActiveTab('owner_manage');
      } else {
        await triggerSmsNotification(
          `🔔 [New Booking] ${currentUser.name} ထံမှ ${targetFieldObj?.name} (${selectedSubField.name}) အတွက် Booking အသစ် ဝင်ရောက်လာပါသည်။`
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
      status: newSubFieldStatus
    };
    setOwnerSubFields(prev => [...prev, subFieldObj]);
    setNewSubFieldName('');
    setNewSubFieldPrice('');
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
      paymentInfo: { kpay: '09-791234567 (KPay)', wave: '09-421234567 (Wave)' }
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
    setEditSubFields(field.subFields.map(sf => ({
      ...sf,
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
      subFields: editSubFields
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

  // Owner ဘက်မှ ကွင်းများကို ပြင်ဆင်ခြင်း (ကွင်းခွဲများဖျက်ရန်၊ open hour, close hour, price edit လုပ်ရန်၊ Active/Disable ပြောင်းရန်)
  const handleStartEditOwnerField = (field) => {
    setEditingOwnerFieldId(field.id);
    setOwnerEditFieldName(field.name);
    setOwnerEditFieldLocation(field.location);
    setOwnerEditFieldAddress(field.address || '');
    setOwnerEditFieldPhone(field.phone || '');
    setOwnerEditFieldOpenHour(field.openHour ?? 8);
    setOwnerEditFieldCloseHour(field.closeHour ?? 22);
    setOwnerEditSubFields(field.subFields.map(sf => ({
      ...sf,
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
      subFields: ownerEditSubFields
    };

    try {
      await updateDoc(doc(db, "fields", editingOwnerFieldId), updatedData);
      alert('ကွင်းအချက်အလက် ပြင်ဆင်မှု အောင်မြင်ပါသည်။');
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

  const handleUpdateBookingStatus = async (bookingId, newStatus) => {
    const targetBooking = bookings.find(b => b.id === bookingId);
    if (targetBooking) {
      await triggerSmsNotification(`🔔 Booking Status Update: ${targetBooking.subFieldName} (${targetBooking.date}) - ${newStatus}`);
    }
    await updateDoc(doc(db, "bookings", bookingId), { status: newStatus });
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
                Pending Bookings ({sortedBookings.filter(b => b.status === 'Pending').length})
              </button>
              <button onClick={() => setAdminTab('manage_fields')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${adminTab === 'manage_fields' ? 'bg-emerald-600 text-white shadow' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                Manage Fields & Add Field
              </button>
              <button onClick={() => setAdminTab('manage_owners')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${adminTab === 'manage_owners' ? 'bg-emerald-600 text-white shadow' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                🔑 Manage Owners & Passwords
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

            {adminTab === 'pending' && (
              <div>
                <h3 className="text-base font-bold mb-4 text-gray-800">အတည်ပြုရန် စောင့်ဆိုင်းနေသော Booking များ</h3>
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
                        <th className="p-3 text-center">လုပ်ဆောင်ချက်</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y text-sm">
                      {sortedBookings.filter(b => b.status === 'Pending').length > 0 ? (
                        sortedBookings.filter(b => b.status === 'Pending').map(item => {
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
                              <td className="p-3 text-center space-x-2">
                                <button onClick={() => handleUpdateBookingStatus(item.id, 'Approved')} className="bg-emerald-600 text-white px-3 py-1 rounded text-xs font-bold hover:bg-emerald-700">Approve</button>
                                <button onClick={() => handleUpdateBookingStatus(item.id, 'Rejected')} className="bg-red-500 text-white px-3 py-1 rounded text-xs font-bold hover:bg-red-600">Reject</button>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan="8" className="text-center py-8 text-gray-500 text-sm">စောင့်ဆိုင်းဆဲ Booking များ မရှိပါ။</td>
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
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                      </div>

                      <div className="border-t pt-4">
                        <h4 className="text-sm font-bold mb-3 text-gray-800">ကွင်းခွဲများ (Sub-Fields) ပြင်ဆင်ရန်</h4>
                        <div className="space-y-3 mb-4">
                          {editSubFields.map((sf, index) => (
                            <div key={sf.id || index} className="grid grid-cols-1 md:grid-cols-3 gap-2 bg-white p-3 rounded-lg border">
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
                              <div className="flex gap-2">
                                <select 
                                  value={sf.status} 
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setEditSubFields(prev => prev.map((item, idx) => idx === index ? { ...item, status: val } : item));
                                  }} 
                                  className="border rounded p-2 text-xs flex-1"
                                >
                                  <option value="Active">Active</option>
                                  <option value="Inactive">Inactive</option>
                                </select>
                                <button 
                                  type="button" 
                                  onClick={() => setEditSubFields(prev => prev.filter((_, idx) => idx !== index))} 
                                  className="bg-red-500 text-white px-2 py-1 rounded text-xs"
                                >
                                  ဖယ်ရန်
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                        <button 
                          type="button" 
                          onClick={() => setEditSubFields(prev => [...prev, { id: 'sf_' + Date.now(), name: 'New SubField', price: 35000, status: 'Active' }])}
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
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                          <label className="block text-xs font-bold text-gray-700 mb-1">Owner Email (Login ဝင်ရန်)</label>
                          <input type="email" placeholder="owner@gmail.com" value={newOwnerEmail} onChange={(e) => setNewOwnerEmail(e.target.value)} className="w-full border rounded-lg p-2.5 text-sm bg-white" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">Owner Password</label>
                          <input type="text" placeholder="owner password" value={newOwnerPassword} onChange={(e) => setNewOwnerPassword(e.target.value)} className="w-full border rounded-lg p-2.5 text-sm bg-white" />
                        </div>
                      </div>

                      <div className="border-t pt-4 mt-4">
                        <h4 className="text-sm font-bold mb-3 text-gray-800">ကွင်းခွဲများ (Sub-Fields) ထည့်ရန်</h4>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
                          <input type="text" placeholder="ကွင်းခွဲအမည် (ဥပမာ - Field A)" value={newSubFieldName} onChange={(e) => setNewSubFieldName(e.target.value)} className="border rounded-lg p-2 text-sm bg-white" />
                          <input type="number" placeholder="ဈေးနှုန်း (ကျပ်)" value={newSubFieldPrice} onChange={(e) => setNewSubFieldPrice(e.target.value)} className="border rounded-lg p-2 text-sm bg-white" />
                          <select value={newSubFieldStatus} onChange={(e) => setNewSubFieldStatus(e.target.value)} className="border rounded-lg p-2 text-sm bg-white">
                            <option value="Active">Active (ဖွင့်)</option>
                            <option value="Inactive">Inactive (ပိတ်)</option>
                          </select>
                          <button type="button" onClick={handleAddOwnerSubField} className="bg-blue-600 text-white rounded-lg p-2 text-xs font-bold hover:bg-blue-700">+ ကွင်းခွဲ ထည့်မည်</button>
                        </div>

                        {ownerSubFields.length > 0 && (
                          <div className="bg-white p-3 rounded-lg border space-y-2">
                            {ownerSubFields.map(sf => (
                              <div key={sf.id} className="flex justify-between items-center text-xs bg-gray-50 p-2 rounded">
                                <span><b>{sf.name}</b> - {sf.price} ကျပ် ({sf.status})</span>
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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {fields.map(f => (
                      <div key={f.id} className="bg-white border rounded-xl p-4 shadow-sm flex flex-col justify-between">
                        <div>
                          <div className="flex justify-between items-start">
                            <h4 className="font-bold text-base text-gray-800">{f.name}</h4>
                            <span className="text-xs bg-gray-100 px-2 py-1 rounded font-medium">{f.location}</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">{f.address} | Tel: {f.phone}</p>
                          <p className="text-xs text-emerald-700 font-bold mt-1">🕒 ဖွင့်ချိန်/ပိတ်ချိန်: {format12Hour(f.openHour ?? 8)} မှ {format12Hour(f.closeHour ?? 22)} ထိ</p>
                          <div className="mt-3 space-y-1">
                            {f.subFields.map(sf => (
                              <div key={sf.id} className="text-xs bg-gray-50 p-2 rounded flex justify-between">
                                <span>{sf.name} ({sf.price} ကျပ်)</span>
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

            <div className="flex gap-2 mb-6">
              <button onClick={() => setOwnerActiveTab('pending')} className={`px-4 py-2 rounded-lg text-xs font-bold ${ownerActiveTab === 'pending' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
                Booking တင်ရန် (Direct Booking)
              </button>
              <button onClick={() => setOwnerActiveTab('history')} className={`px-4 py-2 rounded-lg text-xs font-bold ${ownerActiveTab === 'history' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
                Booking မှတ်တမ်းများ
              </button>
              <button onClick={() => setOwnerActiveTab('settings')} className={`px-4 py-2 rounded-lg text-xs font-bold ${ownerActiveTab === 'settings' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
                Password ချိန်းရန် နှင့် ကွင်းများကို ပြင်ဆင်ရန်
              </button>
            </div>

            {ownerActiveTab === 'settings' && (
              <div className="space-y-8 max-w-2xl">
                <div className="bg-gray-50 border rounded-2xl p-6">
                  <h3 className="text-lg font-bold mb-4 text-gray-800">Owner Password ချိန်းရန်</h3>
                  <form onSubmit={handleChangeMyPassword} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Password အသစ်</label>
                      <input type="text" value={myNewPassword} onChange={(e) => setMyNewPassword(e.target.value)} className="w-full border rounded-lg p-2.5 text-sm bg-white font-mono" required />
                    </div>
                    <button type="submit" className="bg-emerald-600 text-white px-4 py-2.5 rounded-lg text-xs font-bold">Password ပြောင်းမည်</button>
                  </form>
                </div>

                <div className="bg-gray-50 border rounded-2xl p-6">
                  <h3 className="text-lg font-bold mb-4 text-gray-800">ကွင်းများကို ပြင်ဆင်ရန် (Edit Fields & Sub-Fields)</h3>
                  
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
                            <label className="block text-xs font-bold text-gray-700 mb-1">ဖွင့်ချိန် (Open Hour)</label>
                            <input type="number" min="0" max="23" value={ownerEditFieldOpenHour} onChange={(e) => setOwnerEditFieldOpenHour(e.target.value)} className="w-full border rounded p-2 text-xs bg-white" />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">ပိတ်ချိန် (Close Hour)</label>
                            <input type="number" min="1" max="24" value={ownerEditFieldCloseHour} onChange={(e) => setOwnerEditFieldCloseHour(e.target.value)} className="w-full border rounded p-2 text-xs bg-white" />
                          </div>
                        </div>

                        <div className="border-t pt-3">
                          <h5 className="font-bold text-xs text-gray-800 mb-2">ကွင်းခွဲများ (Sub-Fields) စီမံရန်</h5>
                          <div className="space-y-2 mb-3">
                            {ownerEditSubFields.map((sf, index) => (
                              <div key={sf.id || index} className="bg-white p-2.5 rounded border space-y-2">
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
                                <div className="flex justify-between items-center">
                                  <select 
                                    value={sf.status} 
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setOwnerEditSubFields(prev => prev.map((item, idx) => idx === index ? { ...item, status: val } : item));
                                    }} 
                                    className="border rounded p-1 text-xs"
                                  >
                                    <option value="Active">Active</option>
                                    <option value="Inactive">Disable</option>
                                  </select>
                                  <button 
                                    type="button" 
                                    onClick={() => setOwnerEditSubFields(prev => prev.filter((_, idx) => idx !== index))} 
                                    className="bg-red-500 text-white px-2 py-1 rounded text-[10px]"
                                  >
                                    ဖျက်ရန်
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                          <button 
                            type="button" 
                            onClick={() => setOwnerEditSubFields(prev => [...prev, { id: 'sf_' + Date.now(), name: 'New SubField', price: 35000, status: 'Active' }])}
                            className="bg-blue-600 text-white px-3 py-1.5 rounded text-xs font-bold mb-3"
                          >
                            + ကွင်းခွဲ အသစ်ထည့်ရန်
                          </button>
                        </div>

                        <button onClick={handleSaveOwnerEditedField} className="w-full bg-amber-600 text-white py-2.5 rounded text-xs font-bold shadow hover:bg-amber-700">ပြင်ဆင်မှုများကို သိမ်းဆည်းမည်</button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {fields.filter(f => f.ownerEmail === currentUser.email).map(f => (
                        <div key={f.id} className="bg-white border rounded-xl p-4 shadow-sm flex flex-col justify-between">
                          <div>
                            <h4 className="font-bold text-base text-gray-800">{f.name}</h4>
                            <p className="text-xs text-gray-500 mt-0.5">{f.location} | ဖွင့်/ပိတ်: {format12Hour(f.openHour ?? 8)} - {format12Hour(f.closeHour ?? 22)}</p>
                            <div className="mt-3 space-y-1">
                              {f.subFields.map(sf => (
                                <div key={sf.id} className="text-xs bg-gray-50 p-2 rounded flex justify-between">
                                  <span>{sf.name} ({sf.price} ကျပ်)</span>
                                  <span className={sf.status === 'Active' ? 'text-emerald-600 font-bold' : 'text-red-500 font-bold'}>{sf.status}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="mt-4 pt-3 border-t flex justify-end">
                            <button onClick={() => handleStartEditOwnerField(f)} className="bg-amber-500 text-white px-3 py-1.5 rounded text-xs font-bold hover:bg-amber-600">✏️ ကွင်းပြင်ဆင်ရန်</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {ownerActiveTab === 'history' && (
              <div>
                <h3 className="text-base font-bold mb-4 text-gray-800">သင့်ကွင်းများ၏ Booking မှတ်တမ်းများ (မိမိနှင့်သက်ဆိုင်သော Booking များသာ)</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-100 text-xs border-b">
                        <th className="p-3">ကွင်း / ကွင်းခွဲ</th>
                        <th className="p-3">တင်ချိန် (Booking Time)</th>
                        <th className="p-3">ကစားမည့်အချိန် (Play Time)</th>
                        <th className="p-3">Duration (ကြာချိန်)</th>
                        <th className="p-3">Total Price (သင့်ငွေ)</th>
                        <th className="p-3">Customer အမည် / ဖုန်း</th>
                        <th className="p-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y text-sm">
                      {sortedBookings.filter(b => ownerFieldIds.includes(b.fieldId)).length > 0 ? (
                        sortedBookings.filter(b => ownerFieldIds.includes(b.fieldId)).map(item => {
                          const targetField = fields.find(f => f.id === item.fieldId);
                          return (
                            <tr key={item.id} className="hover:bg-gray-50">
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
                              <td className="p-3 font-medium text-xs">{item.userName}</td>
                              <td className="p-3 font-bold text-xs">
                                <span className={item.status === 'Approved' ? 'text-emerald-600' : item.status === 'Rejected' ? 'text-red-500' : 'text-amber-500'}>{item.status}</span>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan="7" className="text-center py-8 text-gray-500">Booking မှတ်တမ်း မရှိသေးပါ။</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {ownerActiveTab === 'pending' && (
              <div>
                <p className="text-xs text-gray-600 mb-4">ဖုန်းဖြင့်ဖြစ်စေ၊ လူကိုယ်တိုင်ဖြစ်စေ လာရောက်ဘိုကင်တင်သူများအတွက် Owner ကိုယ်တိုင် ဤနေရာမှ တိုက်ရိုက် Booking တင်နိုင်ပါသည်။</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {fields.filter(f => f.ownerEmail === currentUser.email && (!f.ownerStatus || f.ownerStatus.toLowerCase() !== 'disabled')).map(f => (
                    <div key={f.id} className="border rounded-xl p-4 bg-gray-50 flex flex-col justify-between">
                      <div>
                        <h4 className="font-bold text-base text-gray-800">{f.name}</h4>
                        <p className="text-xs text-gray-500 mb-3">{f.location}</p>
                        <div className="space-y-2">
                          {f.subFields.map(sf => (
                            <button 
                              key={sf.id} 
                              onClick={() => { setUserSelectedField(f); setSelectedSubField(sf); setActiveTab('fields'); }}
                              className="w-full text-left bg-white border p-2.5 rounded-lg text-xs font-bold hover:bg-emerald-50 flex justify-between items-center"
                            >
                              <span>{sf.name} ({sf.price} ကျပ်)</span>
                              <span className="text-emerald-600">Book Now →</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : currentUser.role === 'user' && activeTab === 'history' ? (
          <div className="bg-white rounded-xl shadow p-6">
            <div className="flex justify-between items-center mb-6 border-b pb-4">
              <h2 className="text-xl font-bold text-gray-800">ကျွန်ုပ်၏ Booking မှတ်တမ်းများ</h2>
              <button onClick={() => setActiveTab('fields')} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold">← ကွင်းများသို့ ပြန်ရန်</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-100 text-xs border-b">
                    <th className="p-3">ကွင်း / ကွင်းခွဲ</th>
                    <th className="p-3">တင်ချိန် (Booking Time)</th>
                    <th className="p-3">ကစားမည့်အချိန် (Play Time)</th>
                    <th className="p-3">Duration (ကြာချိန်)</th>
                    <th className="p-3">Total Price (သင့်ငွေ)</th>
                    <th className="p-3">ငွေပေးချေမှု</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y text-sm">
                  {sortedBookings.filter(b => b.userEmail === currentUser.email).length > 0 ? (
                    sortedBookings.filter(b => b.userEmail === currentUser.email).map(item => {
                      const targetField = fields.find(f => f.id === item.fieldId);
                      return (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="p-3">
                            <div className="font-bold">{targetField?.name}</div>
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
                          <td className="p-3 text-xs uppercase font-bold">{item.paymentMethod}</td>
                          <td className="p-3 text-xs font-bold">
                            <span className={item.status === 'Approved' ? 'text-emerald-600' : item.status === 'Rejected' ? 'text-red-500' : 'text-amber-500'}>{item.status}</span>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="7" className="text-center py-8 text-gray-500 text-sm">သင်၏ Booking မှတ်တမ်းများ မရှိသေးပါ။</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : userSelectedField && selectedSubField ? (
          <div className="bg-white rounded-xl shadow p-6 max-w-2xl mx-auto">
            <button onClick={() => { setUserSelectedField(null); setSelectedSubField(null); sessionStorage.removeItem('userSelectedField'); sessionStorage.removeItem('selectedSubField'); }} className="text-xs text-blue-600 font-bold mb-4 inline-block hover:underline">← ကွင်းများစာရင်းသို့ ပြန်ရန်</button>
            <h2 className="text-xl font-bold text-gray-800 mb-1">{userSelectedField.name} - {selectedSubField.name}</h2>
            <p className="text-xs text-emerald-600 font-bold mb-2">ဈေးနှုန်း: {selectedSubField.price} ကျပ် / တစ်နာရီ</p>
            
            <div className="bg-gray-50 border rounded-xl p-3 mb-6 text-xs text-gray-700 space-y-1.5">
              <p>🕒 <b>ဖွင့်ချိန်/ပိတ်ချိန်:</b> {format12Hour(userSelectedField.openHour ?? 8)} မှ {format12Hour(userSelectedField.closeHour ?? 22)} ထိ</p>
              <p>📍 <b>လိပ်စာ:</b> {userSelectedField.address || userSelectedField.location}</p>
              <p>📞 <b>ဖုန်းနံပါတ်:</b> {userSelectedField.phone || 'မရှိပါ'}</p>
            </div>

            <div className="mb-6">
              <label className="block text-xs font-bold text-gray-700 mb-1">ရက်စွဲ ရွေးချယ်ရန်</label>
              <input type="date" value={userCheckDate} onChange={(e) => setUserCheckDate(e.target.value)} className="border rounded-lg p-2.5 text-sm bg-white" />
            </div>

            <div className="mb-6 bg-gray-50 border rounded-xl p-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-xs font-bold text-gray-800">⏰ ရွေးချယ်ထားသောနေ့အတွက် အချိန်ဇယားများ (Time Slots)</h3>
                <div className="flex items-center space-x-2 text-[10px] flex-wrap gap-y-1">
                  <span className="flex items-center"><span className="w-2.5 h-2.5 bg-emerald-500 rounded-full inline-block mr-1"></span> Available</span>
                  <span className="flex items-center"><span className="w-2.5 h-2.5 bg-amber-500 rounded-full inline-block mr-1"></span> Pending</span>
                  <span className="flex items-center"><span className="w-2.5 h-2.5 bg-red-500 rounded-full inline-block mr-1"></span> Booked / Expired</span>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {generateSingleTimeSlots(userSelectedField.openHour, userSelectedField.closeHour).map(slot => {
                  const statusType = getSlotStatusType(slot.hour);
                  const isSelected = selectedStartSlot !== '' && selectedEndSlot !== '' && slot.hour >= parseInt(selectedStartSlot) && slot.hour < parseInt(selectedEndSlot);

                  let badgeBg = "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100";
                  let statusText = "Available";
                  
                  if (statusType === 'expired') {
                    badgeBg = "bg-gray-100 text-gray-400 border-gray-200 opacity-60 cursor-not-allowed";
                    statusText = "Expired";
                  } else if (statusType === 'booked') {
                    badgeBg = "bg-red-50 text-red-600 border-red-200 cursor-not-allowed";
                    statusText = "Already Booked";
                  } else if (statusType === 'pending') {
                    badgeBg = "bg-amber-50 text-amber-700 border-amber-300 cursor-not-allowed";
                    statusText = "Pending";
                  } else if (isSelected) {
                    badgeBg = "bg-emerald-600 text-white border-emerald-700 shadow-sm";
                    statusText = "Selected";
                  }

                  return (
                    <div key={slot.hour} className={`border rounded-lg p-2 text-center text-xs transition-all ${badgeBg}`}>
                      <div className="font-bold">{slot.label}</div>
                      <div className="text-[10px] mt-0.5 opacity-90">{statusText}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-xs font-bold text-gray-700 mb-2">အချိန် အပိုင်းအခြား ရွေးချယ်ရန်</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div>
                  <label className="text-[10px] text-gray-500">စတင်မည့်အချိန် (Start Time)</label>
                  <select 
                    value={selectedStartSlot} 
                    onChange={(e) => {
                      setSelectedStartSlot(e.target.value);
                      if (selectedEndSlot !== '' && parseInt(e.target.value) >= parseInt(selectedEndSlot)) {
                        setSelectedEndSlot('');
                      }
                    }} 
                    className="w-full border rounded p-2 text-xs bg-white"
                  >
                    <option value="">ရွေးပါ</option>
                    {generateSingleTimeSlots(userSelectedField.openHour, userSelectedField.closeHour).map(slot => (
                      <option key={slot.hour} value={slot.hour} disabled={isSlotUnavailable(slot.hour)}>{format12Hour(slot.hour)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-gray-500">ပြီးဆုံးမည့်အချိန် (End Time)</label>
                  <select 
                    value={selectedEndSlot} 
                    onChange={(e) => setSelectedEndSlot(e.target.value)} 
                    className="w-full border rounded p-2 text-xs bg-white"
                  >
                    <option value="">ရွေးပါ</option>
                    {generateSingleTimeSlots(
                      selectedStartSlot !== '' ? parseInt(selectedStartSlot) + 1 : (userSelectedField.openHour ?? 8) + 1, 
                      (userSelectedField.closeHour ?? 22) + 1
                    ).map(slot => (
                      <option key={slot.hour + 1} value={slot.hour + 1}>{format12Hour(slot.hour + 1)}</option>
                    ))}
                  </select>
                </div>
              </div>
              {calculatedDuration > 0 && (
                <p className="text-xs text-emerald-700 font-bold mt-2">စုစုပေါင်းကြာချိန်: {calculatedDuration} နာရီ | ကျသင့်ငွေ: {calculatedTotalPrice.toLocaleString()} ကျပ်</p>
              )}
            </div>

            {currentUser.role === 'owner' ? (
              <div className="space-y-4 mb-6 border-t pt-4">
                <h3 className="text-sm font-bold text-gray-800">Owner Direct Booking အချက်အလက်များ</h3>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Customer အမည်</label>
                  <input type="text" value={ownerCustomerName} onChange={(e) => setOwnerCustomerName(e.target.value)} placeholder="Customer Name" className="w-full border rounded p-2.5 text-sm bg-white" required />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Customer ဖုန်းနံပါတ်</label>
                  <input type="text" value={ownerCustomerPhone} onChange={(e) => setOwnerCustomerPhone(e.target.value)} placeholder="09xxxxxxxxx" className="w-full border rounded p-2.5 text-sm bg-white" required />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">ငွေပေးချေမှု ပုံစံ</label>
                  <select 
                    value={selectedPaymentMethod} 
                    onChange={(e) => setSelectedPaymentMethod(e.target.value)} 
                    className="w-full border rounded p-2.5 text-sm bg-white" 
                    required
                  >
                    <option value="">ရွေးချယ်ပါ</option>
                    <option value="kpay">KPay</option>
                    <option value="wave">Wave Money</option>
                    <option value="cash">Cash (လက်ငင်း)</option>
                  </select>
                </div>
                {selectedPaymentMethod === 'kpay' && (
                  <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-lg text-xs font-medium">
                    <b>KPay ဖုန်းနံပါတ်:</b> {userSelectedField.paymentInfo?.kpay}
                  </div>
                )}
                {selectedPaymentMethod === 'wave' && (
                  <div className="bg-blue-50 border border-blue-200 text-blue-800 p-3 rounded-lg text-xs font-medium">
                    <b>Wave Money ဖုန်းနံပါတ်:</b> {userSelectedField.paymentInfo?.wave}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4 mb-6 border-t pt-4">
                <h3 className="text-sm font-bold text-gray-800">ငွေပေးချေရန်</h3>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">ငွေလွှဲအမျိုးအစား (Payment Method)</label>
                  <select 
                    value={selectedPaymentMethod} 
                    onChange={(e) => setSelectedPaymentMethod(e.target.value)} 
                    className="w-full border rounded p-2.5 text-sm bg-white" 
                    required
                  >
                    <option value="">ရွေးချယ်ပါ</option>
                    <option value="kpay">KPay</option>
                    <option value="wave">Wave Money</option>
                  </select>
                </div>

                {selectedPaymentMethod === 'kpay' && (
                  <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-lg text-xs font-medium">
                    <b>KPay ဖုန်းနံပါတ်:</b> {userSelectedField.paymentInfo?.kpay}
                  </div>
                )}
                {selectedPaymentMethod === 'wave' && (
                  <div className="bg-blue-50 border border-blue-200 text-blue-800 p-3 rounded-lg text-xs font-medium">
                    <b>Wave Money ဖုန်းနံပါတ်:</b> {userSelectedField.paymentInfo?.wave}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Transaction နံပါတ် နောက်ဆုံး ၅ လုံး</label>
                  <input type="text" maxLength={5} value={transactionLast5} onChange={(e) => setTransactionLast5(e.target.value)} placeholder="12345" className="w-full border rounded p-2.5 text-sm font-mono bg-white" required />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">ငွေလွှဲစလစ် (Screenshot)</label>
                  <input type="file" onChange={(e) => setPaymentScreenshot(e.target.files[0])} className="w-full border rounded p-2 text-xs bg-white" required />
                </div>
              </div>
            )}

            <button onClick={handleBookingSubmit} className="w-full bg-emerald-600 text-white py-3 rounded-xl text-sm font-bold shadow hover:bg-emerald-700">Booking တင်မည်</button>
          </div>
        ) : userSelectedField ? (
          <div className="bg-white rounded-xl shadow p-6 max-w-4xl mx-auto">
            <button onClick={() => { setUserSelectedField(null); sessionStorage.removeItem('userSelectedField'); }} className="text-xs text-blue-600 font-bold mb-4 inline-block hover:underline">← ကွင်းများစာရင်းသို့ ပြန်ရန်</button>
            <div className="flex justify-between items-start mb-6 border-b pb-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-800">{userSelectedField.name}</h2>
                <p className="text-xs text-gray-500 mt-1">{userSelectedField.address} | Tel: {userSelectedField.phone}</p>
                <p className="text-xs text-emerald-700 font-bold mt-1">🕒 ဖွင့်ချိန်/ပိတ်ချိန်: {format12Hour(userSelectedField.openHour ?? 8)} မှ {format12Hour(userSelectedField.closeHour ?? 22)} ထိ</p>
              </div>
              <span className="text-xs bg-emerald-100 text-emerald-800 px-3 py-1 rounded font-bold">{userSelectedField.location}</span>
            </div>

            <h3 className="text-base font-bold text-gray-800 mb-4">ကွင်းခွဲများ ရွေးချယ်ရန်</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {userSelectedField.subFields.map(sf => (
                <div key={sf.id} className="border rounded-xl p-4 bg-gray-50 flex flex-col justify-between">
                  <div>
                    <h4 className="font-bold text-base text-gray-800">{sf.name}</h4>
                    <p className="text-sm font-bold text-emerald-600 mt-1">{sf.price} ကျပ် / နာရီ</p>
                    <p className="text-xs mt-2 font-medium">Status: <span className={sf.status === 'Active' ? 'text-emerald-600 font-bold' : 'text-red-500 font-bold'}>{sf.status}</span></p>
                  </div>
                  <button 
                    disabled={sf.status !== 'Active'}
                    onClick={() => setSelectedSubField(sf)}
                    className={`mt-4 w-full py-2 rounded-lg text-xs font-bold ${sf.status === 'Active' ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
                  >
                    {sf.status === 'Active' ? 'Booking တင်မည်' : 'ပိတ်ထားသည်'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <div className="bg-white rounded-xl shadow p-4 mb-6 flex flex-col md:flex-row justify-between items-center gap-4">
              <h2 className="text-lg font-bold text-gray-800">ရရှိနိုင်သော ဘောလုံးကွင်းများ</h2>
              <div className="w-full md:w-72 township-dropdown-container">
                <input 
                  type="text" 
                  list="townships-list"
                  placeholder="မြို့နယ် ရှာရန် (ဥပမာ - လှိုင်)"
                  value={selectedTownship}
                  onChange={(e) => setSelectedTownship(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-xs bg-gray-50 flex focus:bg-white"
                />
                <datalist id="townships-list">
                  {Array.from(new Set(fields.map(f => f.location))).map((loc, idx) => (
                    <option key={idx} value={loc} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {displayedFields.map(field => (
                <div key={field.id} onClick={() => setUserSelectedField(field)} className="bg-white rounded-xl shadow hover:shadow-lg transition-all border p-5 cursor-pointer flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="firestore-title font-bold text-lg text-gray-800">{field.name}</h3>
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full font-bold">{field.location}</span>
                    </div>
                    <p className="text-xs text-gray-500 mb-3">{field.address}</p>
                    <p className="text-xs text-gray-600 mb-1">📞 {field.phone}</p>
                    <p className="text-xs text-emerald-700 font-bold">🕒 ဖွင့်ချိန်: {format12Hour(field.openHour ?? 8)} - {format12Hour(field.closeHour ?? 22)}</p>
                  </div>
                  <div className="mt-4 pt-3 border-t flex justify-between items-center">
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded">ကွင်းခွဲ ({field.subFields.length}) ခု ရှိပါသည်။</span>
                    <span className="text-xs font-bold text-blue-600">ကြည့်မည် →</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}