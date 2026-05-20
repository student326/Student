// Payment Configuration
// Update this file to change course price and bank details

export const paymentConfig = {
  // Course Information
  course: {
    name: 'Premium Course Access',
    description: 'Get unlimited access to all course content including videos, notes, and materials',
    price: 5000, // Price in rupees - change this to update the course price
    currency: 'RS'
  },
  
  // Bank Account Details
  bank: {
    accountName: 'Syed Hassan Imam Rizvi',
    accountNumber: '10870981007050014',
    bankName: 'Bank Alhabib',
  },
  
  // Mobile Payments Details
  Easypaisa: {
    id: '03272496268'
  },

  // WhatsApp Configuration
  whatsapp: {
    number: '923272496268', // Formatted with 92 country code for WhatsApp links
    displayNumber: '03272496268', // Local format for display
    message: 'Hello, I have made the payment for the course. Please find my payment receipt attached.'
  }
};
