const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// In-memory storage
let users = {};
let transactions = [];

// PACKAGES
const PACKAGES = {
  basic: { amount: 10, dailyROI: 0.10, dailyCap: 10 },
  silver: { amount: 25, dailyROI: 0.25, dailyCap: 25 },
  gold: { amount: 100, dailyROI: 1.00, dailyCap: 100 },
  platinum: { amount: 250, dailyROI: 2.50, dailyCap: 250 },
  diamond: { amount: 500, dailyROI: 5.00, dailyCap: 500 },
  crown: { amount: 1000, dailyROI: 10.00, dailyCap: 1000 }
};

// 1. Register User
app.post('/api/register', (req, res) => {
  try {
    const { telegramId, username, firstName, lastName, referrerId } = req.body;
    
    if (!users[telegramId]) {
      users[telegramId] = {
        telegramId,
        username: username || '',
        firstName: firstName || '',
        lastName: lastName || '',
        joinDate: new Date(),
        package: { name: null, amount: 0 },
        earnings: {
          totalROI: 0,
          totalBinary: 0,
          totalReferral: 0,
          totalWithdrawn: 0,
          availableBalance: 0
        },
        referrals: { direct: [] },
        withdrawal: { lastWithdrawal: null, dailyLimit: 0 }
      };
      
      // Handle referral
      if (referrerId && users[referrerId]) {
        users[referrerId].referrals.direct.push(telegramId);
      }
    }
    
    res.json({ success: true, user: users[telegramId] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Invest
app.post('/api/invest', (req, res) => {
  try {
    const { telegramId, packageType } = req.body;
    const user = users[telegramId];
    
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    const packageData = PACKAGES[packageType];
    if (!packageData) return res.status(400).json({ error: 'Invalid package' });
    
    // Update user package
    user.package = {
      name: packageType,
      amount: packageData.amount,
      dailyROI: packageData.dailyROI,
      dailyCap: packageData.dailyCap,
      purchaseDate: new Date()
    };
    
    user.withdrawal.dailyLimit = packageData.dailyCap;
    
    // Record transaction
    transactions.push({
      id: uuidv4(),
      userId: telegramId,
      type: 'investment',
      amount: packageData.amount,
      status: 'completed',
      timestamp: new Date(),
      details: { package: packageType }
    });
    
    res.json({ success: true, message: 'Investment successful' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Get Dashboard
app.get('/api/dashboard/:telegramId', (req, res) => {
  try {
    const user = users[req.params.telegramId];
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    const userTransactions = transactions
      .filter(tx => tx.userId === req.params.telegramId)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 10);
    
    res.json({
      user,
      transactions: userTransactions,
      packages: PACKAGES
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Withdraw
app.post('/api/withdraw', (req, res) => {
  try {
    const { telegramId, amount, walletAddress } = req.body;
    const user = users[telegramId];
    
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    // Simple validation
    if (amount > user.earnings.availableBalance) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }
    
    // Update user
    user.earnings.availableBalance -= parseFloat(amount);
    user.earnings.totalWithdrawn += parseFloat(amount);
    user.withdrawal.lastWithdrawal = new Date();
    
    // Record transaction
    transactions.push({
      id: uuidv4(),
      userId: telegramId,
      type: 'withdrawal',
      amount: parseFloat(amount),
      status: 'pending',
      timestamp: new Date(),
      details: { walletAddress, method: 'USDT_TRC20' }
    });
    
    res.json({ 
      success: true, 
      message: 'Withdrawal request submitted',
      newBalance: user.earnings.availableBalance 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    users: Object.keys(users).length,
    version: '1.0.0'
  });
});

// 6. Serve frontend
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

module.exports = app;
