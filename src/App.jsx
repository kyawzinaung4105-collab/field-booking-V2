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
  
  // ကစားမည့်ရက်စွဲကို အမြဲတမ်း လက်ရှိရက်စွဲ (Current Date) ဖြစ်စေရန် ပြင်ဆင်ထားသည်
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

  // (Optional) အကယ်၍ userCheckDate ကို session တွင် မသိမ်းလိုတော့ပါက ဤ useEffect ကိုလည်း ဖြုတ်နိုင်ပါသည်
  useEffect(() => {
    sessionStorage.setItem('userCheckDate', userCheckDate);
  }, [userCheckDate]);

  // ... (ကျန်ရှိသော code အားလုံးသည် မူလအတိုင်း ဆက်လက် တည်ရှိပါသည်)