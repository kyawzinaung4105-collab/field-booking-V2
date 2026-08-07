import React, { useState, useEffect } from 'react';

// Default user အနေဖြင့် Admin တစ်ခုတည်းသာ ထားရှိပါမည်
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

export default function FieldBookingApp() {
  const [currentUser, setCurrentUser] = useState(null); 
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  const [authMode, setAuthMode] = useState('login'); 
  const [signupName, setSignupName] = useState('');
  const [signupPassword, setSignupPassword] = useState('');

  // Password ပြောင်းရန် State အသစ်များ
  const [myNewPassword, setMyNewPassword] = useState('');

  // မြို့နယ်အလိုက် Search ပြုလုပ်ရန် State
  const [selectedTownship, setSelectedTownship] = useState('');

  const [usersList, setUsersList] = useState(() => {
    const saved = localStorage.getItem('app_users');
    return saved ? JSON.parse(saved) : defaultUsers;
  });

  const [fields, setFields] = useState(() => {
    const saved = localStorage.getItem('app_fields');
    return saved ? JSON.parse(saved) : defaultFields;
  });

  const [bookings, setBookings] = useState(() => {
    const saved = localStorage.getItem('app_bookings');
    return saved ? JSON.parse(saved) : [];
  });

  const [smsNotifications, setSmsNotifications] = useState(() => {
    const saved = localStorage.getItem('app_notifications');
    return saved ? JSON.parse(saved) : [];
  });
  const [showNotiDropdown, setShowNotiDropdown] = useState(false);

  useEffect(() => {
    localStorage.setItem('app_fields', JSON.stringify(fields));
  }, [fields]);

  useEffect(() => {
    localStorage.setItem('app_bookings', JSON.stringify(bookings));
  }, [bookings]);

  useEffect(() => {
    localStorage.setItem('app_users', JSON.stringify(usersList));
  }, [usersList]);

  useEffect(() => {
    localStorage.setItem('app_notifications', JSON.stringify(smsNotifications));
  }, [smsNotifications]);

  const triggerSmsNotification = (message) => {
    const newNoti = {
      id: Date.now() + Math.random(),
      message: message,
      time: new Date().toLocaleTimeString(),
      date: new Date().toLocaleDateString(),
      read: false
    };
    setSmsNotifications(prev => [newNoti, ...prev]);
  };
  
  const [activeTab, setActiveTab] = useState('fields'); 
  const [userSelectedField, setUserSelectedField] = useState(null);
  const [selectedSubField, setSelectedSubField] = useState(null);
  const [userCheckDate, setUserCheckDate] = useState('2026-08-06');
  
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
  const [newFieldOpenHour, setNewFieldOpenHour] = useState(6);
  const [newFieldCloseHour, setNewFieldCloseHour] = useState(23);
  
  const [newOwnerEmail, setNewOwnerEmail] = useState('');
  const [newOwnerPassword, setNewOwnerPassword] = useState('');

  const [newSubFieldName, setNewSubFieldName] = useState('');
  const [newSubFieldPrice, setNewSubFieldPrice] = useState('');
  const [newSubFieldOpenHour, setNewSubFieldOpenHour] = useState(6);
  const [newSubFieldCloseHour, setNewSubFieldCloseHour] = useState(23);
  const [newSubFieldStatus, setNewSubFieldStatus] = useState('Active');

  const [ownerSubFields, setOwnerSubFields] = useState([]);

  const [editingFieldId, setEditingFieldId] = useState(null);
  const [editFieldName, setEditFieldName] = useState('');
  const [editFieldLocation, setEditFieldLocation] = useState('');
  const [editFieldAddress, setEditFieldAddress] = useState('');
  const [editFieldPhone, setEditFieldPhone] = useState('');
  const [editFieldOpenHour, setEditFieldOpenHour] = useState(6);
  const [editFieldCloseHour, setEditFieldCloseHour] = useState(23);
  const [editSubFields, setEditSubFields] = useState([]);
  
  const [editSubName, setEditSubName] = useState('');
  const [editSubPrice, setEditSubPrice] = useState('');
  const [editSubOpenHour, setEditSubOpenHour] = useState(6);
  const [editSubCloseHour, setEditSubCloseHour] = useState(23);
  const [editSubStatus, setEditSubStatus] = useState('Active');

  const [adminTab, setAdminTab] = useState('pending');
  const [ownerActiveTab, setOwnerActiveTab] = useState('pending');

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

  const activeFieldsForUser = fields.filter(f => f.ownerStatus !== 'Disabled');

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

  const handleSignup = (e) => {
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

    const updatedUsers = [...usersList, newUserObj];
    setUsersList(updatedUsers);
    localStorage.setItem('app_users', JSON.stringify(updatedUsers));

    alert('အကောင့်ဖွင့်ခြင်း အောင်မြင်ပါသည်။ ကျေးဇူးပြု၍ Login ဝင်ပါ။');
    setAuthMode('login');
    setSignupName('');
    setSignupPassword('');
  };

  const handleChangeMyPassword = (e) => {
    e.preventDefault();
    if (!myNewPassword.trim()) {
      alert('ကျေးဇူးပြု၍ Password အသစ် ထည့်သွင်းပါ။');
      return;
    }

    if (currentUser.role === 'admin') {
      alert('Password ပြောင်းတာအောင်မြင်ပါသည်');
      setMyNewPassword('');
    } else if (currentUser.role === 'owner') {
      setFields(prevFields => prevFields.map(f => {
        if (f.ownerEmail === currentUser.email) {
          return { ...f, ownerPassword: myNewPassword.trim() };
        }
        return f;
      }));
      alert('Password ပြောင်းတာအောင်မြင်ပါသည်');
      setMyNewPassword('');
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setUserSelectedField(null);
    setSelectedSubField(null);
    setActiveTab('fields');
  };

  const format12Hour = (h24) => {
    const period = h24 >= 12 ? 'PM' : 'AM';
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${h12 < 10 ? `0${h12}` : h12}:00 ${period}`;
  };

  const generateTimeSlotsForField = (openH, closeH) => {
    const slots = [];
    for (let h = openH; h < closeH; h++) {
      slots.push({ hour: h, label: format12Hour(h) });
    }
    return slots;
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
      b => b.subFieldId === selectedSubField?.id && b.date === userCheckDate && b.timeSlot === slotLabelCheck && b.status === 'Approved'
    );
    return !!bookingFound;
  };

  const calculatedDuration = selectedStartSlot !== '' && selectedEndSlot !== '' 
    ? parseInt(selectedEndSlot) - parseInt(selectedStartSlot) 
    : 0;

  const calculatedTotalPrice = selectedSubField && calculatedDuration > 0 
    ? calculatedDuration * selectedSubField.price 
    : 0;

  const handleBookingSubmit = (e) => {
    e.preventDefault();
    if (!selectedSubField || selectedSubField.status !== 'Active') {
      alert('ဤကွင်းခွဲမှာ လက်ရှိ ပိတ်ထားပါသဖြင့် (Inactive) Booking တင်၍ မရပါ။');
      return;
    }

    if (currentUser.role === 'owner') {
      if (selectedStartSlot === '' || selectedEndSlot === '' || !selectedPaymentMethod || !ownerCustomerName || !ownerCustomerPhone) {
        alert('ကျေးဇူးပြု၍ လိုအပ်သော အချက်အလက်များ အားလုံးဖြည့်စွက်ပါ။');
        return;
      }
    } else {
      if (selectedStartSlot === '' || selectedEndSlot === '' || !selectedPaymentMethod || !transactionLast5 || !paymentScreenshot) {
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
        alert('ရွေးချယ်ထားသော အချိန်အတွင်း အတည်ပြုပြီးသား (Approved) Booking များ ပါဝင်နေပါသည်။');
        return;
      }
    }

    const now = new Date();
    const bookedTimeFormatted = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${now.toLocaleTimeString()}`;

    const newBookings = [];
    for (let h = startH; h < endH; h++) {
      newBookings.push({
        id: (currentUser.role === 'owner' ? 'b_owner_' : 'b_') + Date.now() + Math.random(),
        fieldId: userSelectedField.id,
        subFieldId: selectedSubField.id,
        subFieldName: selectedSubField.name,
        date: userCheckDate,
        timeSlot: `${format12Hour(h)} - ${format12Hour(h + 1)}`,
        bookedAt: bookedTimeFormatted,
        userEmail: currentUser.email,
        userName: currentUser.role === 'owner' ? `${ownerCustomerName} (${ownerCustomerPhone}) [Owner Direct Booked]` : currentUser.name,
        paymentMethod: selectedPaymentMethod,
        transactionLast5: currentUser.role === 'owner' ? 'OWNER' : transactionLast5,
        screenshotName: currentUser.role === 'owner' ? 'Direct Manual Booking' : paymentScreenshot?.name,
        status: currentUser.role === 'owner' ? 'Approved' : 'Pending',
        bookedBy: currentUser.role === 'owner' ? 'Owner' : 'User'
      });
    }

    setBookings(prev => [...prev, ...newBookings]);

    const targetFieldObj = fields.find(f => f.id === userSelectedField.id);
    if (currentUser.role === 'owner') {
      triggerSmsNotification(`🔔 [Direct Booking] Owner မှ ${targetFieldObj?.name} (${selectedSubField.name}) အတွက် Direct Booking တင်ပြီးပါပြီ။`);
      alert('Owner ၏ Manual Booking တင်ခြင်း အောင်မြင်ပြီး အတည်ပြုပြီးသား ဖြစ်သွားပါပြီ။');
      setOwnerCustomerName('');
      setOwnerCustomerPhone('');
      setActiveTab('owner_manage');
    } else {
      triggerSmsNotification(`🔔 [New Booking] ${currentUser.name} ထံမှ ${targetFieldObj?.name} (${selectedSubField.name}) အတွက် Booking အသစ် ဝင်ရောက်လာပါသည်။`);
      alert('Booking တင်ခြင်း အောင်မြင်ပါသည်။');
      setActiveTab('history');
    }

    setSelectedStartSlot('');
    setSelectedEndSlot('');
    setSelectedPaymentMethod('');
    setPaymentScreenshot(null);
    setTransactionLast5('');
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
  };

  const handleCreateNewField = (e) => {
    e.preventDefault();
    if (!newFieldName || !newFieldLocation || ownerSubFields.length === 0) {
      alert('ကွင်းအမည်၊ မြို့နယ် နှင့် ကွင်းခွဲ အနည်းဆုံး ၁ ခု ထည့်သွင်းပါ။');
      return;
    }

    const newFieldObj = {
      id: 'f_' + Date.now(),
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

    setFields(prev => [...prev, newFieldObj]);
    alert('ကွင်းအသစ် သိမ်းဆည်းခြင်း အောင်မြင်ပါသည်။');
    setNewFieldName('');
    setNewFieldLocation('');
    setNewFieldAddress('');
    setNewFieldPhone('');
    setNewOwnerEmail('');
    setNewOwnerPassword('');
    setOwnerSubFields([]);
  };

  const handleStartEditField = (field) => {
    setEditingFieldId(field.id);
    setEditFieldName(field.name);
    setEditFieldLocation(field.location);
    setEditFieldAddress(field.address || '');
    setEditFieldPhone(field.phone || '');
    setEditFieldOpenHour(field.openHour ?? 6);
    setEditFieldCloseHour(field.closeHour ?? 23);
    setEditSubFields(field.subFields.map(sf => ({
      ...sf,
      openHour: sf.openHour ?? field.openHour ?? 6,
      closeHour: sf.closeHour ?? field.closeHour ?? 23,
      status: sf.status ?? 'Active'
    })));
  };

  const handleAddEditSubField = () => {
    if (!editSubName || !editSubPrice) {
      alert('ကွင်းခွဲအမည်နှင့် ဈေးနှုန်း ထည့်ပါ။');
      return;
    }
    setEditSubFields(prev => [
      ...prev,
      {
        id: 'sf_' + Date.now() + Math.random(),
        name: editSubName,
        price: parseFloat(editSubPrice),
        openHour: parseInt(editSubOpenHour),
        closeHour: parseInt(editSubCloseHour),
        status: editSubStatus
      }
    ]);
    setEditSubName('');
    setEditSubPrice('');
  };

  const handleRemoveEditSubField = (sfId) => {
    setEditSubFields(prev => prev.filter(sf => sf.id !== sfId));
  };

  const handleUpdateEditSubFieldProperty = (sfId, fieldKey, value) => {
    setEditSubFields(prev => prev.map(sf => {
      if (sf.id === sfId) {
        return { ...sf, [fieldKey]: value };
      }
      return sf;
    }));
  };

  const handleSaveEditField = (e) => {
    e.preventDefault();
    setFields(prev => prev.map(f => {
      if (f.id === editingFieldId) {
        return {
          ...f,
          name: currentUser.role === 'admin' ? editFieldName : f.name,
          location: currentUser.role === 'admin' ? editFieldLocation : f.location,
          address: currentUser.role === 'admin' ? editFieldAddress : f.address,
          phone: currentUser.role === 'admin' ? editFieldPhone : f.phone,
          openHour: currentUser.role === 'admin' ? parseInt(editFieldOpenHour) : f.openHour,
          closeHour: currentUser.role === 'admin' ? parseInt(editFieldCloseHour) : f.closeHour,
          subFields: editSubFields
        };
      }
      return f;
    }));
    setEditingFieldId(null);
    alert('ကွင်းအချက်အလက်များ Update လုပ်ပြီးပါပြီ။');
  };

  const handleAdminUpdateOwnerInfo = (fieldId, newEmail, newPass, newStatus) => {
    setFields(prevFields => prevFields.map(f => {
      if (f.id === fieldId) {
        return { ...f, ownerEmail: newEmail, ownerPassword: newPass, ownerStatus: newStatus };
      }
      return f;
    }));
    alert('Owner အချက်အလက်များကို သိမ်းဆည်းပြီးပါပြီ။');
  };

  const handleAdminDeleteOwnerField = (fieldId) => {
    if (window.confirm('ဤ Owner နှင့် ၎င်း၏ကွင်းကို ဖျက်ရန် သေချာပါသလား?')) {
      setFields(prev => prev.filter(f => f.id !== fieldId));
    }
  };

  const handleUpdateBookingStatus = (bookingId, newStatus) => {
    setBookings(prev => prev.map(b => {
      if (b.id === bookingId) {
        triggerSmsNotification(`🔔 Booking Status Update: ${b.subFieldName} (${b.date}) - ${newStatus}`);
        return { ...b, status: newStatus };
      }
      return b;
    }));
  };

  const baseFieldsList = currentUser?.role === 'owner' 
    ? activeFieldsForUser.filter(f => f.ownerEmail === currentUser.email)
    : activeFieldsForUser;

  // မြို့နယ်အလိုက် Search ပြုလုပ်ရန် Logic (စာရိုက်ရှာလို့ရရန် Datalist နှင့် တွဲသုံးထားသည်)
  const displayedFields = selectedTownship.trim() === '' 
    ? baseFieldsList 
    : baseFieldsList.filter(f => f.location && f.location.toLowerCase().includes(selectedTownship.trim().toLowerCase()));

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
                <p className="text-[10px] text-gray-500 mt-1">အင်္ဂလိပ်စာလုံး (A-Z, a-z) နှင့် ဂဏန်း (0-9) သာ လက်ခံပါသည်။</p>
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
                <p className="text-[10px] text-gray-500 mt-1">ဂဏန်း (0-9) များသာ ရိုက်ထည့်နိုင်ပါသည်။</p>
              </div>
              <button type="submit" className="w-full bg-emerald-600 text-white py-2.5 rounded-lg text-sm font-bold shadow hover:bg-emerald-700 transition-colors">အကောင့်ဖန်တီးမည် (Sign Up)</button>
            </form>
          )}
        </div>
      </div>
    );
  }

  const ownerFieldIds = fields.filter(f => f.ownerEmail === currentUser.email).map(f => f.id);

  return (
    <div className="min-h-screen bg-gray-50 font-sans pb-12">
      <header className="bg-emerald-700 text-white shadow-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center space-x-2 cursor-pointer" onClick={() => { setActiveTab('fields'); setUserSelectedField(null); setSelectedSubField(null); }}>
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
                  onClick={() => setShowNotiDropdown(!showNotiDropdown)}
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
                Pending Bookings ({bookings.filter(b => b.status === 'Pending').length})
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
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-100 text-xs border-b">
                      <th className="p-3">အသုံးပြုသူ</th>
                      <th className="p-3">ကွင်း / ကွင်းခွဲ</th>
                      <th className="p-3">အချိန် / နေ့စွဲ</th>
                      <th className="p-3">ငွေပေးချေမှု / Txn</th>
                      <th className="p-3 text-center">လုပ်ဆောင်ချက်</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-sm">
                    {bookings.filter(b => b.status === 'Pending').length > 0 ? (
                      bookings.filter(b => b.status === 'Pending').map(item => {
                        const targetField = fields.find(f => f.id === item.fieldId);
                        return (
                          <tr key={item.id}>
                            <td className="p-3 font-bold text-gray-800">{item.userName} <br/><span className="text-xs text-gray-500 font-normal">{item.userEmail}</span></td>
                            <td className="p-3 font-bold text-emerald-700">{targetField?.name} <span className="text-blue-600 text-xs">[{item.subFieldName}]</span></td>
                            <td className="p-3 text-xs">{item.date} <br/><span className="font-bold text-gray-700">{item.timeSlot}</span></td>
                            <td className="p-3 text-xs">
                              <span className="font-bold uppercase text-gray-700">{item.paymentMethod}</span><br/>
                              <span className="font-mono text-gray-600">Txn: {item.transactionLast5}</span>
                            </td>
                            <td className="p-3 text-center space-x-2">
                              <button onClick={() => handleUpdateBookingStatus(item.id, 'Approved')} className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded text-xs font-bold">Approve</button>
                              <button onClick={() => handleUpdateBookingStatus(item.id, 'Rejected')} className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded text-xs font-bold">Reject</button>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr><td colSpan="5" className="p-6 text-center text-gray-500 text-sm">စောင့်ဆိုင်းနေသော Booking များ မရှိပါ။</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {adminTab === 'manage_owners' && (
              <div>
                <h3 className="text-lg font-bold mb-2 text-gray-800">🔑 ကွင်းပိုင်ရှင်များ (Owners) စီမံရန်</h3>
                <div className="space-y-4 mt-4">
                  {fields.filter(f => f.ownerEmail).length > 0 ? (
                    fields.filter(f => f.ownerEmail).map(field => (
                      <OwnerCredentialRow field={field} key={field.id} onDelete={handleAdminDeleteOwnerField} onUpdate={handleAdminUpdateOwnerInfo}/>
                    ))
                  ) : (
                    <p className="text-center text-gray-500 text-sm py-6">Owner အကောင့် သတ်မှတ်ထားသော ကွင်းများ မရှိသေးပါ။</p>
                  )}
                </div>
              </div>
            )}

            {adminTab === 'manage_fields' && (
              <div className="space-y-8">
                <div className="bg-gray-50 border rounded-2xl p-6">
                  <h3 className="text-lg font-bold mb-4 text-gray-800">ကွင်းအသစ် ထည့်သွင်းရန် (Admin Only)</h3>
                  <form onSubmit={handleCreateNewField} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">ကွင်းအမည်</label>
                        <input type="text" placeholder="ဥပမာ - YUFC" value={newFieldName} onChange={(e) => setNewFieldName(e.target.value)} className="w-full border rounded-lg p-2.5 text-sm bg-white" required />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">မြို့နယ်</label>
                        <input type="text" placeholder="ဥပမာ - လှိုင်မြို့နယ်" value={newFieldLocation} onChange={(e) => setNewFieldLocation(e.target.value)} className="w-full border rounded-lg p-2.5 text-sm bg-white" required />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">လိပ်စာအပြည့်အစုံ</label>
                      <input type="text" placeholder="အမှတ်..." value={newFieldAddress} onChange={(e) => setNewFieldAddress(e.target.value)} className="w-full border rounded-lg p-2.5 text-sm bg-white" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">ဖုန်းနံပါတ်</label>
                        <input type="text" placeholder="09-..." value={newFieldPhone} onChange={(e) => setNewFieldPhone(e.target.value)} className="w-full border rounded-lg p-2.5 text-sm bg-white" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">ဖွင့်ချိန် (နာရီ)</label>
                        <input type="number" min="0" max="23" value={newFieldOpenHour} onChange={(e) => setNewFieldOpenHour(e.target.value)} className="w-full border rounded-lg p-2.5 text-sm bg-white" required />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">ပိတ်ချိန် (နာရီ)</label>
                        <input type="number" min="1" max="24" value={newFieldCloseHour} onChange={(e) => setNewFieldCloseHour(e.target.value)} className="w-full border rounded-lg p-2.5 text-sm bg-white" required />
                      </div>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                      <h4 className="font-bold text-xs text-emerald-800 mb-2">🔑 Owner Login အချက်အလက်များ</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">Owner Email / Username</label>
                          <input type="text" placeholder="owner@gmail.com" value={newOwnerEmail} onChange={(e) => setNewOwnerEmail(e.target.value)} className="w-full border rounded-lg p-2 text-sm bg-white" required />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">Owner Password</label>
                          <input type="text" placeholder="••••••" value={newOwnerPassword} onChange={(e) => setNewOwnerPassword(e.target.value)} className="w-full border rounded-lg p-2 text-sm bg-white font-mono" required />
                        </div>
                      </div>
                    </div>
                    <div className="border-t pt-4">
                      <label className="block text-xs font-bold text-gray-700 mb-2">ကွင်းခွဲများ (Sub-fields) ထည့်ရန်</label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2 mb-3 bg-white p-3 rounded-xl border">
                        <input type="text" placeholder="နာမည် (ဥပမာ - Field A)" value={newSubFieldName} onChange={(e) => setNewSubFieldName(e.target.value)} className="border rounded p-2 text-xs" />
                        <input type="number" placeholder="ဈေးနှုန်း (Ks/hr)" value={newSubFieldPrice} onChange={(e) => setNewSubFieldPrice(e.target.value)} className="border rounded p-2 text-xs" />
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-gray-500">ဖွင့်:</span>
                          <input type="number" min="0" max="23" value={newSubFieldOpenHour} onChange={(e) => setNewSubFieldOpenHour(e.target.value)} className="w-full border rounded p-2 text-xs" />
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-gray-500">ပိတ်:</span>
                          <input type="number" min="1" max="24" value={newSubFieldCloseHour} onChange={(e) => setNewSubFieldCloseHour(e.target.value)} className="w-full border rounded p-2 text-xs" />
                        </div>
                        <div className="flex gap-1">
                          <select value={newSubFieldStatus} onChange={(e) => setNewSubFieldStatus(e.target.value)} className="w-full border rounded p-2 text-xs bg-white">
                            <option value="Active">Active</option>
                            <option value="Inactive">Inactive</option>
                          </select>
                          <button type="button" onClick={handleAddOwnerSubField} className="bg-blue-600 text-white px-3 py-2 rounded text-xs font-bold hover:bg-blue-700 whitespace-nowrap">ထည့်</button>
                        </div>
                      </div>
                      {ownerSubFields.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                          {ownerSubFields.map((sf, idx) => (
                            <div key={idx} className="bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs px-3 py-2 rounded-lg flex justify-between items-center shadow-sm">
                              <div>
                                <span className="font-bold">⚽ {sf.name}</span> - <span>{sf.price.toLocaleString()} Ks</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <button type="submit" className="w-full bg-emerald-600 text-white py-3 rounded-xl text-sm font-bold shadow hover:bg-emerald-700 transition-all">
                      ကွင်းအသစ် သိမ်းဆည်းမည်
                    </button>
                  </form>
                </div>

                <div className="bg-white border rounded-2xl p-6 shadow-sm">
                  <h3 className="text-lg font-bold mb-4 text-gray-800">🏟️ တည်ရှိပြီးသား ကွင်းများ စီမံရန် (Edit / Delete)</h3>
                  <div className="space-y-4">
                    {fields.map(field => (
                      <div key={field.id} className="border rounded-xl p-4 bg-gray-50 shadow-sm">
                        {editingFieldId === field.id ? (
                          <form onSubmit={handleSaveEditField} className="space-y-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <input type="text" value={editFieldName} onChange={(e) => setEditFieldName(e.target.value)} className="border rounded p-2 text-xs bg-white font-bold" placeholder="ကွင်းအမည်" />
                              <input type="text" value={editFieldLocation} onChange={(e) => setEditFieldLocation(e.target.value)} className="border rounded p-2 text-xs bg-white" placeholder="မြို့နယ်" />
                            </div>
                            <input type="text" value={editFieldAddress} onChange={(e) => setEditFieldAddress(e.target.value)} className="border rounded p-2 text-xs bg-white w-full" placeholder="လိပ်စာ" />
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                              <input type="text" value={editFieldPhone} onChange={(e) => setEditFieldPhone(e.target.value)} className="border rounded p-2 text-xs bg-white" placeholder="ဖုန်းနံပါတ်" />
                              <input type="number" value={editFieldOpenHour} onChange={(e) => setEditFieldOpenHour(e.target.value)} className="border rounded p-2 text-xs bg-white" placeholder="ဖွင့်ချိန်" />
                              <input type="number" value={editFieldCloseHour} onChange={(e) => setEditFieldCloseHour(e.target.value)} className="border rounded p-2 text-xs bg-white" placeholder="ပိတ်ချိန်" />
                            </div>

                            <div className="border-t pt-2">
                              <p className="text-xs font-bold text-gray-700 mb-2">⚽ ကွင်းခွဲများ (Sub-fields) တည်းဖြတ်ရန်:</p>
                              <div className="flex flex-col gap-2 mb-2">
                                {editSubFields.map(sf => (
                                  <div key={sf.id} className="flex flex-col sm:flex-row gap-2 items-center bg-white p-2 rounded border">
                                    <input type="text" value={sf.name} onChange={(e) => handleUpdateEditSubFieldProperty(sf.id, 'name', e.target.value)} className="border rounded p-1 text-xs font-bold w-full" />
                                    <input type="number" value={sf.price} onChange={(e) => handleUpdateEditSubFieldProperty(sf.id, 'price', parseFloat(e.target.value) || 0)} className="border rounded p-1 text-xs w-full" />
                                    <select value={sf.status || 'Active'} onChange={(e) => handleUpdateEditSubFieldProperty(sf.id, 'status', e.target.value)} className="border rounded p-1 text-xs font-bold">
                                      <option value="Active">Active</option>
                                      <option value="Inactive">Inactive</option>
                                    </select>
                                    <button type="button" onClick={() => handleRemoveEditSubField(sf.id)} className="bg-red-500 text-white px-2.5 py-1 rounded text-xs font-bold whitespace-nowrap">ဖယ်မည်</button>
                                  </div>
                                ))}
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-white p-2 rounded border">
                                <input type="text" placeholder="ကွင်းခွဲအသစ်" value={editSubName} onChange={(e) => setEditSubName(e.target.value)} className="border rounded p-1 text-xs" />
                                <input type="number" placeholder="ဈေးနှုန်း" value={editSubPrice} onChange={(e) => setEditSubPrice(e.target.value)} className="border rounded p-1 text-xs" />
                                <button type="button" onClick={handleAddEditSubField} className="bg-blue-600 text-white px-3 py-1 rounded text-xs font-bold">ထည့်ရန်</button>
                              </div>
                            </div>

                            <div className="flex gap-2 pt-2">
                              <button type="submit" className="bg-emerald-600 text-white px-3 py-1.5 rounded text-xs font-bold">Update သိမ်းမည်</button>
                              <button type="button" onClick={() => setEditingFieldId(null)} className="bg-gray-400 text-white px-3 py-1.5 rounded text-xs font-bold">မလုပ်တော့ပါ</button>
                            </div>
                          </form>
                        ) : (
                          <div className="flex justify-between items-center">
                            <div>
                              <h4 className="font-bold text-sm text-gray-900">🏟️ {field.name} ({field.location})</h4>
                              <p className="text-xs text-gray-500 mt-0.5">📞 {field.phone} | ⏰ {format12Hour(field.openHour ?? 6)} - {format12Hour(field.closeHour ?? 23)}</p>
                              <p className="text-xs text-emerald-700 font-semibold mt-1">ကွင်းခွဲအရေအတွက်: {field.subFields.length} ခု</p>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => handleStartEditField(field)} className="bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded text-xs font-bold shadow-sm">
                                Edit ✏️
                              </button>
                              <button onClick={() => handleAdminDeleteOwnerField(field.id)} className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded text-xs font-bold shadow-sm">
                                Delete 🗑️
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : currentUser.role === 'owner' && activeTab === 'owner_manage' ? (
          <div className="bg-white rounded-xl shadow p-6">
            <div className="flex justify-between items-center mb-6 border-b pb-4">
              <h2 className="text-xl font-bold text-gray-800">🏟️ Owner Dashboard & Booking Management</h2>
              <button onClick={() => setActiveTab('fields')} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold">← ကွင်းစာရင်းသို့ ပြန်ရန်</button>
            </div>

            <div className="flex flex-wrap gap-2 mb-6">
              <button 
                onClick={() => setOwnerActiveTab('pending')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${ownerActiveTab === 'pending' ? 'bg-emerald-600 text-white shadow' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                Pending Bookings ({bookings.filter(b => ownerFieldIds.includes(b.fieldId) && b.status === 'Pending').length})
              </button>
              <button 
                onClick={() => setOwnerActiveTab('history')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${ownerActiveTab === 'history' ? 'bg-emerald-600 text-white shadow' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                📋 Booking History (User + Owner Direct Bookings)
              </button>
              <button 
                onClick={() => setOwnerActiveTab('manage')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${ownerActiveTab === 'manage' ? 'bg-emerald-600 text-white shadow' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                ⚙️ Manage Fields & Sub-fields
              </button>
              <button 
                onClick={() => setOwnerActiveTab('change_password')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${ownerActiveTab === 'change_password' ? 'bg-emerald-600 text-white shadow' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                🔒 ကိုယ်ပိုင် Password ပြောင်းရန်
              </button>
            </div>

            {ownerActiveTab === 'change_password' && (
              <div className="bg-gray-50 border rounded-2xl p-6 max-w-md">
                <h3 className="text-lg font-bold mb-4 text-gray-800">Owner Password အသစ်ပြောင်းလဲရန်</h3>
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

            {ownerActiveTab === 'pending' && (
              <div>
                <h3 className="text-base font-bold mb-4 text-gray-800">အတည်ပြုရန် စောင့်ဆိုင်းနေသော Booking များ (Pending)</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-100 text-xs border-b">
                        <th className="p-3">အသုံးပြုသူ</th>
                        <th className="p-3">ကွင်း / ကွင်းခွဲ</th>
                        <th className="p-3">အချိန် / နေ့စွဲ</th>
                        <th className="p-3">ငွေပေးချေမှု / Txn</th>
                        <th className="p-3 text-center">လုပ်ဆောင်ချက်</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y text-sm">
                      {bookings.filter(b => ownerFieldIds.includes(b.fieldId) && b.status === 'Pending').length > 0 ? (
                        bookings.filter(b => ownerFieldIds.includes(b.fieldId) && b.status === 'Pending').map(item => {
                          const targetField = fields.find(f => f.id === item.fieldId);
                          return (
                            <tr key={item.id}>
                              <td className="p-3 font-bold text-gray-800">{item.userName} <br/><span className="text-xs text-gray-500 font-normal">{item.userEmail}</span></td>
                              <td className="p-3 font-bold text-emerald-700">{targetField?.name} <span className="text-blue-600 text-xs">[{item.subFieldName}]</span></td>
                              <td className="p-3 text-xs">{item.date} <br/><span className="font-bold text-gray-700">{item.timeSlot}</span></td>
                              <td className="p-3 text-xs">
                                <span className="font-bold uppercase text-gray-700">{item.paymentMethod}</span><br/>
                                <span className="font-mono text-gray-600">Txn: {item.transactionLast5}</span>
                              </td>
                              <td className="p-3 text-center space-x-2">
                                <button onClick={() => handleUpdateBookingStatus(item.id, 'Approved')} className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded text-xs font-bold">Approve</button>
                                <button onClick={() => handleUpdateBookingStatus(item.id, 'Rejected')} className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded text-xs font-bold">Reject</button>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr><td colSpan="5" className="p-6 text-center text-gray-500 text-sm">စောင့်ဆိုင်းနေသော Booking များ မရှိပါ။</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {ownerActiveTab === 'history' && (
              <div>
                <h3 className="text-base font-bold mb-4 text-gray-800">Booking History (User တင်ထားသည်များနှင့် Owner Direct Bookings)</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-100 text-xs border-b">
                        <th className="p-3">တင်သွင်းသူ (Booked By)</th>
                        <th className="p-3">ကွင်း / ကွင်းခွဲ</th>
                        <th className="p-3">အချိန် / နေ့စွဲ</th>
                        <th className="p-3">ငွေပေးချေမှု / Txn</th>
                        <th className="p-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y text-sm">
                      {bookings.filter(b => ownerFieldIds.includes(b.fieldId)).length > 0 ? (
                        bookings.filter(b => ownerFieldIds.includes(b.fieldId)).map(item => {
                          const targetField = fields.find(f => f.id === item.fieldId);
                          const isOwnerBooked = item.bookedBy === 'Owner';
                          return (
                            <tr key={item.id} className={isOwnerBooked ? 'bg-purple-50/50' : ''}>
                              <td className="p-3">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isOwnerBooked ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                  {isOwnerBooked ? 'Owner Direct' : 'User Booking'}
                                </span>
                                <p className="font-bold text-gray-900 mt-1">{item.userName}</p>
                                <p className="text-xs text-gray-500">{item.userEmail}</p>
                              </td>
                              <td className="p-3 font-bold text-emerald-700">{targetField?.name} <span className="text-blue-600 text-xs">[{item.subFieldName}]</span></td>
                              <td className="p-3 text-xs">{item.date} <br/><span className="font-bold text-gray-700">{item.timeSlot}</span></td>
                              <td className="p-3 text-xs">
                                <span className="font-bold uppercase text-gray-700">{item.paymentMethod}</span><br/>
                                <span className="font-mono text-gray-600">Txn: {item.transactionLast5}</span>
                              </td>
                              <td className="p-3 text-center">
                                <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${item.status === 'Approved' ? 'bg-green-100 text-green-700' : item.status === 'Rejected' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                  {item.status}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr><td colSpan="5" className="p-6 text-center text-gray-500 text-sm">Booking မှတ်တမ်း မရှိသေးပါ။</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {ownerActiveTab === 'manage' && (
              <div className="space-y-6">
                {fields.filter(f => f.ownerEmail === currentUser.email).map(field => (
                  <div key={field.id} className="border rounded-xl p-5 bg-white shadow-sm">
                    {editingFieldId === field.id ? (
                      <form onSubmit={handleSaveEditField} className="space-y-4">
                        <div className="flex justify-between items-center border-b pb-2">
                          <h4 className="font-bold text-emerald-700 text-sm">{field.name} - ကွင်းခွဲများ စီမံခြင်း</h4>
                          <span className="text-xs bg-amber-100 text-amber-800 px-2.5 py-1 rounded font-bold">Editing Mode</span>
                        </div>
                        <div className="border-t pt-3">
                          <label className="block text-xs font-bold text-gray-700 mb-2">⚽ ကွင်းခွဲများ (Sub-fields) ထည့်ရန်/ပြင်ရန်</label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2 mb-3 bg-gray-50 p-3 rounded-xl border">
                            <input type="text" placeholder="ကွင်းခွဲနာမည် အသစ်" value={editSubName} onChange={(e) => setEditSubName(e.target.value)} className="border rounded p-2 text-xs bg-white" />
                            <input type="number" placeholder="ဈေးနှုန်း (Ks)" value={editSubPrice} onChange={(e) => setEditSubPrice(e.target.value)} className="border rounded p-2 text-xs bg-white" />
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-gray-500">ဖွင့်:</span>
                              <input type="number" min="0" max="23" value={editSubOpenHour} onChange={(e) => setEditSubOpenHour(e.target.value)} className="w-full border rounded p-2 text-xs bg-white" />
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-gray-500">ပိတ်:</span>
                              <input type="number" min="1" max="24" value={editSubCloseHour} onChange={(e) => setEditSubCloseHour(e.target.value)} className="w-full border rounded p-2 text-xs bg-white" />
                            </div>
                            <div className="flex gap-1">
                              <select value={editSubStatus} onChange={(e) => setEditSubStatus(e.target.value)} className="w-full border rounded p-2 text-xs bg-white">
                                <option value="Active">Active</option>
                                <option value="Inactive">Inactive</option>
                              </select>
                              <button type="button" onClick={handleAddEditSubField} className="bg-emerald-600 text-white px-3 py-1 rounded text-xs font-bold whitespace-nowrap">ထည့်</button>
                            </div>
                          </div>
                          <div className="flex flex-col gap-2 mb-3">
                            {editSubFields.map((sf) => (
                              <div key={sf.id} className="bg-gray-50 border p-3 rounded-xl flex flex-col sm:flex-row justify-between items-center gap-2">
                                <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 w-full">
                                  <input type="text" value={sf.name} onChange={(e) => handleUpdateEditSubFieldProperty(sf.id, 'name', e.target.value)} className="border rounded p-1.5 text-xs bg-white font-bold" />
                                  <input type="number" value={sf.price} onChange={(e) => handleUpdateEditSubFieldProperty(sf.id, 'price', parseFloat(e.target.value) || 0)} className="border rounded p-1.5 text-xs bg-white" />
                                  <div className="flex items-center gap-1">
                                    <span className="text-[10px] text-gray-500">ဖွင့်:</span>
                                    <input type="number" min="0" max="23" value={sf.openHour ?? 6} onChange={(e) => handleUpdateEditSubFieldProperty(sf.id, 'openHour', parseInt(e.target.value) || 6)} className="w-full border rounded p-1.5 text-xs bg-white" />
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <span className="text-[10px] text-gray-500">ပိတ်:</span>
                                    <input type="number" min="1" max="24" value={sf.closeHour ?? 23} onChange={(e) => handleUpdateEditSubFieldProperty(sf.id, 'closeHour', parseInt(e.target.value) || 23)} className="w-full border rounded p-1.5 text-xs bg-white" />
                                  </div>
                                  <select value={sf.status || 'Active'} onChange={(e) => handleUpdateEditSubFieldProperty(sf.id, 'status', e.target.value)} className={`border rounded p-1.5 text-xs font-bold ${sf.status === 'Inactive' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                                    <option value="Active">Active</option>
                                    <option value="Inactive">Inactive</option>
                                  </select>
                                </div>
                                <button type="button" onClick={() => handleRemoveEditSubField(sf.id)} className="bg-red-500 text-white px-3 py-1.5 rounded text-xs font-bold">ဖယ်မည်</button>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="flex gap-2 pt-2">
                          <button type="submit" className="bg-emerald-600 text-white px-4 py-2 rounded text-xs font-bold">Update သိမ်းမည်</button>
                          <button type="button" onClick={() => setEditingFieldId(null)} className="bg-gray-400 text-white px-4 py-2 rounded text-xs font-bold">မလုပ်တော့ပါ</button>
                        </div>
                      </form>
                    ) : (
                      <div>
                        <div className="flex justify-between items-center border-b pb-3 mb-3">
                          <div>
                            <h4 className="font-bold text-base text-gray-900">{field.name}</h4>
                            <p className="text-xs text-gray-600">📍 လိပ်စာ: {field.address || field.location}</p>
                            <p className="text-xs text-emerald-700 font-semibold mt-0.5">📞 ဖုန်း: {field.phone}</p>
                          </div>
                          <button onClick={() => handleStartEditField(field)} className="bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded text-xs font-bold shadow-sm">
                            Manage Sub-fields
                          </button>
                        </div>
                        <div className="space-y-2 mt-4">
                          <p className="text-xs font-bold text-gray-700">⚽ ကွင်းခွဲများ (Sub-fields):</p>
                          <div className="flex flex-col gap-2">
                            {field.subFields.map(sf => {
                              const isInactive = sf.status === 'Inactive';
                              return (
                                <div key={sf.id} className={`border text-xs px-4 py-2.5 rounded-lg flex justify-between items-center ${isInactive ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
                                  <div>
                                    <span className="font-bold text-gray-800">⚽ {sf.name}</span>
                                    <span className="text-emerald-700 font-bold ml-3">{sf.price.toLocaleString()} Ks / hr</span>
                                    <span className="text-blue-700 font-medium ml-3">⏰ ဖွင့်ချိန်: {format12Hour(sf.openHour ?? field.openHour ?? 6)} - {format12Hour(sf.closeHour ?? field.closeHour ?? 23)}</span>
                                  </div>
                                  <span className={`px-2.5 py-1 rounded font-bold text-[10px] ${isInactive ? 'bg-red-200 text-red-800' : 'bg-green-100 text-green-700'}`}>
                                    {sf.status || 'Active'}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div>
            {activeTab === 'history' ? (
              <div>
                <button onClick={() => setActiveTab('fields')} className="mb-4 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold">← ကွင်းများသို့ ပြန်ရန်</button>
                <div className="bg-white rounded-xl shadow p-6">
                  <h2 className="text-xl font-bold mb-4">သင်၏ Booking History များ</h2>
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-100 text-xs border-b">
                        <th className="p-3">ကွင်း / ကွင်းခွဲ</th>
                        <th className="p-3">အချိန်</th>
                        <th className="p-3">ငွေပေးချေမှု / Txn</th>
                        <th className="p-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y text-sm">
                      {bookings.filter(b => b.userEmail === currentUser.email).length > 0 ? (
                        bookings.filter(b => b.userEmail === currentUser.email).map(item => {
                          const targetField = fields.find(f => f.id === item.fieldId);
                          return (
                            <tr key={item.id}>
                              <td className="p-3 font-bold text-emerald-700">{targetField?.name} <span className="text-blue-600 text-xs">[{item.subFieldName}]</span></td>
                              <td className="p-3">{item.date} <br/><span className="text-xs text-gray-500">{item.timeSlot}</span></td>
                              <td className="p-3 text-xs">
                                <span className="font-bold text-gray-700 uppercase">{item.paymentMethod}</span> <br/>
                                <span className="font-mono text-gray-500">Txn: {item.transactionLast5}</span>
                              </td>
                              <td className="p-3 text-center">
                                <span className={`text-xs px-2 py-1 rounded font-bold ${item.status === 'Approved' ? 'bg-green-100 text-green-700' : item.status === 'Rejected' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                  {item.status}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr><td colSpan="4" className="p-6 text-center text-gray-500 text-sm">Booking မှတ်တမ်း မရှိသေးပါ။</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : userSelectedField ? (
              <div>
                <button onClick={() => { setUserSelectedField(null); setSelectedSubField(null); }} className="mb-4 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold">← ကွင်းစာရင်းသို့ ပြန်ရန်</button>
                
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2 bg-white rounded-xl shadow p-6">
                    <h3 className="text-xl font-bold text-gray-800 mb-1">{userSelectedField.name}</h3>
                    <p className="text-xs text-gray-600 mb-1">📍 {userSelectedField.address || userSelectedField.location}</p>
                    <p className="text-xs text-emerald-700 font-bold mb-1">📞 ဖုန်းနံပါတ်: {userSelectedField.phone || 'မပါရှိပါ'}</p>
                    <p className="text-xs text-blue-700 font-bold mb-4">⏰ အထွေထွေ ဖွင့်ချိန်: {format12Hour(userSelectedField.openHour ?? 6)} - {format12Hour(userSelectedField.closeHour ?? 23)}</p>
                    
                    {!selectedSubField ? (
                      <div className="mb-6">
                        <label className="block text-xs font-bold text-gray-800 mb-2">⚽ ကွင်းခွဲ (Sub-field) တစ်ခုကို ရွေးချယ်ပါ:</label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {userSelectedField.subFields.map(sf => {
                            const isInactive = sf.status === 'Inactive';
                            return (
                              <div
                                key={sf.id}
                                onClick={() => {
                                  if (isInactive) {
                                    alert('ဤကွင်းခွဲမှာ လက်ရှိ ပိတ်ထားပါသည် (Inactive)။');
                                    return;
                                  }
                                  setSelectedSubField(sf);
                                }}
                                className={`p-3.5 rounded-xl border transition-all shadow-sm flex justify-between items-center ${
                                  isInactive ? 'bg-gray-100 border-gray-300 opacity-60 cursor-not-allowed' : 'bg-gray-50 border-gray-200 cursor-pointer hover:bg-emerald-50 hover:border-emerald-300'
                                }`}
                              >
                                <div>
                                  <p className="font-bold text-sm text-gray-800">⚽ {sf.name}</p>
                                  <p className="text-xs mt-1 text-emerald-700 font-bold">{sf.price.toLocaleString()} Ks/hr</p>
                                  <p className="text-[10px] text-blue-600 mt-0.5">⏰ ဖွင့်ချိန်: {format12Hour(sf.openHour ?? userSelectedField.openHour ?? 6)} - {format12Hour(sf.closeHour ?? userSelectedField.closeHour ?? 23)}</p>
                                </div>
                                <span className={`text-[10px] px-2 py-1 rounded font-bold ${isInactive ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                  {sf.status || 'Active'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="mb-4 flex items-center justify-between bg-emerald-50 p-3 rounded-xl border border-emerald-200">
                          <div>
                            <span className="text-xs text-emerald-800 font-bold">ရွေးချယ်ထားသော ကွင်းခွဲ:</span>
                            <p className="text-sm font-bold text-emerald-900">⚽ {selectedSubField.name} ({selectedSubField.price.toLocaleString()} Ks/hr)</p>
                            <p className="text-xs text-blue-800 mt-0.5">⏰ အချိန်: {format12Hour(selectedSubField.openHour ?? userSelectedField.openHour ?? 6)} - {format12Hour(selectedSubField.closeHour ?? userSelectedField.closeHour ?? 23)}</p>
                          </div>
                          <button onClick={() => { setSelectedSubField(null); setSelectedStartSlot(''); setSelectedEndSlot(''); }} className="text-xs bg-white border border-emerald-300 text-emerald-700 px-3 py-1.5 rounded-lg font-bold hover:bg-emerald-100">
                            🔄 ကွင်းခွဲပြောင်းမည်
                          </button>
                        </div>

                        <div className="mb-4 flex items-center justify-between border-t pt-4">
                          <h4 className="font-bold text-emerald-800 text-sm">အချိန်ဇယား ({selectedSubField.name})</h4>
                          <input type="date" value={userCheckDate} onChange={(e) => setUserCheckDate(e.target.value)} className="border rounded px-2 py-1 text-sm bg-white" />
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {generateTimeSlotsForField(selectedSubField.openHour ?? userSelectedField.openHour ?? 6, selectedSubField.closeHour ?? userSelectedField.closeHour ?? 23).map((slot, index) => {
                            const isExp = checkIsExpired(slot.hour);
                            const slotLabelCheck = `${format12Hour(slot.hour)} - ${format12Hour(slot.hour + 1)}`;
                            const bookingFound = bookings.find(b => b.subFieldId === selectedSubField.id && b.date === userCheckDate && b.timeSlot === slotLabelCheck && b.status === 'Approved');

                            return (
                              <div key={index} className={`border rounded-xl p-3 text-center ${isExp ? 'bg-gray-100' : bookingFound ? 'bg-red-50' : 'bg-green-50'}`}>
                                <p className="font-bold text-sm">{slot.label}</p>
                                <span className={`text-xs font-medium ${isExp ? 'text-gray-500' : bookingFound ? 'text-red-600' : 'text-green-600'}`}>
                                  {isExp ? 'Expired' : bookingFound ? 'Booked' : 'Available'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="bg-white rounded-xl shadow p-6 h-fit">
                    <h3 className="font-bold text-base mb-3 text-gray-800">{currentUser.role === 'owner' ? 'Manual Booking တင်ရန် (Owner)' : 'Booking တင်ရန်'}</h3>
                    {selectedSubField ? (
                      <form onSubmit={handleBookingSubmit} className="space-y-3">
                        <p className="text-xs bg-emerald-50 p-2 rounded text-emerald-800 font-bold">ရွေးထားသည်: {selectedSubField.name}</p>
                        
                        {currentUser.role === 'owner' && (
                          <div className="space-y-2 bg-blue-50 p-3 rounded-lg border border-blue-200">
                            <div>
                              <label className="block text-[10px] font-bold text-blue-900 mb-1">ဖောက်သည် အမည်</label>
                              <input type="text" placeholder="ဖောက်သည်နာမည်" value={ownerCustomerName} onChange={(e) => setOwnerCustomerName(e.target.value)} className="w-full border rounded p-2 text-xs bg-white" required />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-blue-900 mb-1">ဖောက်သည် ဖုန်းနံပါတ်</label>
                              <input type="text" placeholder="09-xxxxxxxxx" value={ownerCustomerPhone} onChange={(e) => setOwnerCustomerPhone(e.target.value)} className="w-full border rounded p-2 text-xs bg-white" required />
                            </div>
                          </div>
                        )}

                        <div>
                          <label className="block text-xs font-medium mb-1">စတင်ချိန် (Start Time)</label>
                          <select value={selectedStartSlot} onChange={(e) => { setSelectedStartSlot(e.target.value); setSelectedEndSlot(''); }} className="w-full border rounded p-2 text-sm bg-white" required>
                            <option value="">စတင်ချိန်ရွေးပါ</option>
                            {generateTimeSlotsForField(selectedSubField.openHour ?? userSelectedField.openHour ?? 6, selectedSubField.closeHour ?? userSelectedField.closeHour ?? 23).map(slot => {
                              const unavailable = isSlotUnavailable(slot.hour);
                              return (
                                <option key={slot.hour} value={slot.hour} disabled={unavailable}>
                                  {slot.label} {unavailable ? '(မရရှိနိုင်ပါ)' : ''}
                                </option>
                              );
                            })}
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-medium mb-1">ပြီးဆုံးချိန် (End Time)</label>
                          <select value={selectedEndSlot} onChange={(e) => setSelectedEndSlot(e.target.value)} className="w-full border rounded p-2 text-sm bg-white" required disabled={!selectedStartSlot}>
                            <option value="">ပြီးဆုံးချိန်ရွေးပါ</option>
                            {selectedStartSlot !== '' && (() => {
                              const slots = [];
                              const startH = parseInt(selectedStartSlot);
                              const maxClose = selectedSubField.closeHour ?? userSelectedField.closeHour ?? 23;
                              for (let h = startH + 1; h <= maxClose; h++) {
                                let hasUnavailableInBetween = false;
                                for (let checkH = startH; checkH < h; checkH++) {
                                  if (isSlotUnavailable(checkH)) { hasUnavailableInBetween = true; break; }
                                }
                                slots.push(
                                  <option key={h} value={h} disabled={hasUnavailableInBetween}>
                                    {format12Hour(h)} {hasUnavailableInBetween ? '(မရရှိနိုင်သော အချိန်ပါဝင်နေသည်)' : ''}
                                  </option>
                                );
                              }
                              return slots;
                            })()}
                          </select>
                        </div>

                        <div className="text-xs font-bold text-emerald-700 bg-emerald-50 p-2 rounded">
                          စုစုပေါင်းကျသင့်ငွေ: {calculatedTotalPrice.toLocaleString()} ကျပ် ({calculatedDuration > 0 ? `${calculatedDuration} နာရီ` : ''})
                        </div>
                        
                        <div className="border-t pt-2">
                          <label className="block text-xs font-bold mb-1">ငွေပေးချေရန် (Payment Method)</label>
                          <div className="grid grid-cols-3 gap-1 mb-2">
                            <button type="button" onClick={() => setSelectedPaymentMethod('kpay')} className={`py-2 px-2 rounded-lg border text-xs font-bold ${selectedPaymentMethod === 'kpay' ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-50 text-gray-700'}`}>KPay</button>
                            <button type="button" onClick={() => setSelectedPaymentMethod('wave')} className={`py-2 px-2 rounded-lg border text-xs font-bold ${selectedPaymentMethod === 'wave' ? 'bg-amber-500 text-white border-amber-500' : 'bg-gray-50 text-gray-700'}`}>Wave</button>
                            <button type="button" onClick={() => setSelectedPaymentMethod('cash')} className={`py-2 px-2 rounded-lg border text-xs font-bold ${selectedPaymentMethod === 'cash' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-gray-50 text-gray-700'}`}>Cash</button>
                          </div>
                        </div>

                        {currentUser.role !== 'owner' && (
                          <>
                            <div>
                              <label className="block text-xs font-bold mb-1">ငွေလွှဲ Screenshot တင်ရန် (SS)</label>
                              <input type="file" accept="image/*" onChange={(e) => setPaymentScreenshot(e.target.files[0])} className="w-full text-xs border rounded-lg p-1" required />
                            </div>
                            <div>
                              <label className="block text-xs font-bold mb-1">ငွေလွှဲနံပါတ် (နောက်ဆုံး ၅ လုံး)</label>
                              <input type="text" maxLength="5" value={transactionLast5} onChange={(e) => setTransactionLast5(e.target.value)} className="w-full border rounded p-2 text-sm font-mono" required placeholder="ဥပမာ - 12345" />
                            </div>
                          </>
                        )}

                        <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-lg text-sm font-bold shadow cursor-pointer">
                          {currentUser.role === 'owner' ? 'Confirm Manual Booking (Lock Slots)' : 'Confirm Booking'}
                        </button>
                      </form>
                    ) : (
                      <p className="text-xs text-red-500">ကျေးဇူးပြု၍ ကွင်းခွဲတစ်ခုကို အရင်ရွေးချယ်ပါ။</p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div>
                {/* မြို့နယ်အလိုက် စာရိုက်၍ ရှာဖွေနိုင်သော Searchable Dropdown (Datalist ဖြင့် ပြင်ဆင်ထားသည်) */}
                <div className="mb-6 bg-white p-4 rounded-xl shadow-sm flex flex-col sm:flex-row justify-between items-center gap-4">
                  <h2 className="text-xl font-bold text-gray-800">Available Fields</h2>
                  
                  <div className="w-full sm:w-auto flex items-center gap-2">
                    <label htmlFor="townshipSearchInput" className="text-xs font-bold text-gray-700 whitespace-nowrap">မြို့နယ် ရှာရန်:</label>
                    <div className="relative">
                      <input 
                        id="townshipSearchInput"
                        list="townshipOptionsList"
                        value={selectedTownship}
                        onChange={(e) => setSelectedTownship(e.target.value)}
                        placeholder="ဥပမာ - လှိုင် ဟုရိုက်ပါ"
                        className="border rounded-lg px-3 py-2 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:border-emerald-600 font-medium w-60"
                      />
                      <datalist id="townshipOptionsList">
                        {Array.from(new Set(baseFieldsList.map(f => f.location))).filter(Boolean).map((township, idx) => (
                          <option key={idx} value={township} />
                        ))}
                      </datalist>
                    </div>
                    {selectedTownship && (
                      <button 
                        onClick={() => setSelectedTownship('')} 
                        className="text-xs bg-gray-200 hover:bg-gray-300 px-2.5 py-2 rounded-lg font-bold text-gray-700"
                        title="ဖျက်ရန်"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {displayedFields.length > 0 ? (
                    displayedFields.map(field => (
                      <div key={field.id} onClick={() => { setUserSelectedField(field); setSelectedSubField(null); }} className="bg-white border rounded-2xl shadow-sm p-5 cursor-pointer hover:shadow-md transition-shadow">
                        <h3 className="font-bold text-xl text-gray-900 mb-1">{field.name}</h3>
                        <p className="text-xs text-gray-600 mb-1">📍 {field.address || field.location}</p>
                        <p className="text-xs text-emerald-700 font-bold mb-1">📞 {field.phone || 'ဖုန်းနံပါတ်မရှိပါ'}</p>
                        <p className="text-xs text-blue-700 font-bold mb-3">⏰ ဖွင့်ချိန်: {format12Hour(field.openHour ?? 6)} - {format12Hour(field.closeHour ?? 23)}</p>
                        <div className="border-t pt-3">
                          <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1.5 rounded-lg inline-block">
                            ⚽ ကွင်းခွဲ ({field.subFields.length}) ခု ရှိပါတယ်
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="col-span-3 text-center py-12 bg-white rounded-xl shadow-sm">
                      <p className="text-gray-500 text-sm">ရွေးချယ်ထားသော မြို့နယ်နှင့် ကိုက်ညီသော ကွင်းများ မရှိသေးပါ။</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function OwnerCredentialRow({ field, onUpdate, onDelete }) {
  const [emailVal, setEmailVal] = useState(field.ownerEmail || '');
  const [passVal, setPassVal] = useState(field.ownerPassword || '');
  const [statusVal, setStatusVal] = useState(field.ownerStatus || 'Active');

  useEffect(() => {
    setEmailVal(field.ownerEmail || '');
    setPassVal(field.ownerPassword || '');
    setStatusVal(field.ownerStatus || 'Active');
  }, [field.ownerEmail, field.ownerPassword, field.ownerStatus]);

  const handleSave = (e) => {
    e.preventDefault();
    onUpdate(field.id, emailVal, passVal, statusVal);
  };

  return (
    <div className="bg-white border rounded-xl p-4 shadow-sm flex flex-col md:flex-row justify-start md:justify-between items-start md:items-center gap-4">
      <div>
        <h4 className="font-bold text-gray-900 text-sm">🏟️ {field.name}</h4>
        <p className="text-xs text-gray-500">📍 {field.location}</p>
      </div>
      <form onSubmit={handleSave} className="flex flex-col sm:flex-row items-center gap-2 w-full md:w-auto">
        <input type="text" value={emailVal} onChange={(e) => setEmailVal(e.target.value)} className="border rounded px-2.5 py-1.5 text-xs w-full" placeholder="Owner Email" />
        <input type="text" value={passVal} onChange={(e) => setPassVal(e.target.value)} className="border rounded px-2.5 py-1.5 text-xs font-mono w-full bg-yellow-50 font-bold" placeholder="Owner Password (Admin View)" title="Owner ၏ လက်ရှိ Password" />
        <select value={statusVal} onChange={(e) => setStatusVal(e.target.value)} className={`border rounded px-2.5 py-1.5 text-xs font-bold w-full ${statusVal === 'Disabled' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
          <option value="Active">Active</option>
          <option value="Disabled">Disabled</option>
        </select>
        <div className="flex gap-1 self-end mt-2 sm:mt-0 whitespace-nowrap">
          <button type="submit" className="bg-emerald-600 text-white px-3 py-1.5 rounded text-xs font-bold">Save</button>
          <button type="button" onClick={() => onDelete(field.id)} className="bg-red-500 text-white px-3 py-1.5 rounded text-xs font-bold">Delete</button>
        </div>
      </form>
    </div>
  );
}