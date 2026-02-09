const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// In-memory storage (no MongoDB needed)
const users = {};
const transactions = [];

// Packages
const PACKAGES = {
  basic: { amount: 10, dailyROI: 0.10, dailyCap: 10 },
  silver: { amount: 25, dailyROI: 0.25, dailyCap: 25 },
  gold: { amount: 100, dailyROI: 1.00, dailyCap: 100 },
  platinum: { amount: 250, dailyROI: 2.50, dailyCap: 250 },
  diamond: { amount: 500, dailyROI: 5.00, dailyCap: 500 },
  crown: { amount: 1000, dailyROI: 10.00, dailyCap: 1000 }
};

// API Routes

// 1. Register user
app.post('/api/register', (req, res) => {
  const { telegramId, username, firstName, lastName } = req.body;
  
  if (!telegramId) {
    return res.status(400).json({ error: 'Telegram ID required' });
  }
  
  // Create user if not exists
  if (!users[telegramId]) {
    users[telegramId] = {
      telegramId,
      username: username || '',
      firstName: firstName || '',
      lastName: lastName || '',
      joinDate: new Date(),
      package: {
        name: null,
        amount: 0,
        dailyROI: 0,
        dailyCap: 0,
        purchaseDate: null
      },
      earnings: {
        totalROI: 0,
        totalBinary: 0,
        totalReferral: 0,
        totalWithdrawn: 0,
        availableBalance: 0
      },
      referrals: {
        direct: []
      },
      withdrawal: {
        lastWithdrawal: null,
        dailyLimit: 0,
        walletAddress: ''
      }
    };
  }
  
  res.json({ success: true, user: users[telegramId] });
});

// 2. Invest in package
app.post('/api/invest', (req, res) => {
  const { telegramId, packageType } = req.body;
  
  if (!users[telegramId]) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  const package = PACKAGES[packageType];
  if (!package) {
    return res.status(400).json({ error: 'Invalid package' });
  }
  
  const user = users[telegramId];
  
  // Update user package
  user.package = {
    name: packageType,
    amount: package.amount,
    dailyROI: package.dailyROI,
    dailyCap: package.dailyCap,
    purchaseDate: new Date()
  };
  
  user.withdrawal.dailyLimit = package.dailyCap;
  
  // Add transaction
  transactions.push({
    id: uuidv4(),
    userId: telegramId,
    type: 'investment',
    amount: package.amount,
    status: 'completed',
    timestamp: new Date(),
    details: { package: packageType }
  });
  
  res.json({ success: true, user });
});

// 3. Get dashboard data
app.get('/api/dashboard/:telegramId', (req, res) => {
  const user = users[req.params.telegramId];
  
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  const userTransactions = transactions
    .filter(tx => tx.userId === req.params.telegramId)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 10);
  
  // Calculate daily ROI
  const dailyROI = user.package.dailyROI || 0;
  
  res.json({
    user,
    transactions: userTransactions,
    dailyROI,
    packages: PACKAGES,
    stats: {
      totalUsers: Object.keys(users).length,
      totalInvestment: Object.values(users).reduce((sum, u) => sum + (u.package.amount || 0), 0)
    }
  });
});

// 4. Withdraw funds
app.post('/api/withdraw', (req, res) => {
  const { telegramId, amount, walletAddress } = req.body;
  
  const user = users[telegramId];
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  // Basic validation
  if (amount > user.earnings.availableBalance) {
    return res.status(400).json({ error: 'Insufficient balance' });
  }
  
  // Update user
  user.earnings.availableBalance -= parseFloat(amount);
  user.earnings.totalWithdrawn += parseFloat(amount);
  user.withdrawal.lastWithdrawal = new Date();
  user.withdrawal.walletAddress = walletAddress;
  
  // Add transaction
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
});

// 5. Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    nodeVersion: process.version,
    timestamp: new Date().toISOString(),
    usersCount: Object.keys(users).length
  });
});

// 6. Daily ROI calculation (simplified)
app.post('/api/calculate-roi', (req, res) => {
  const { telegramId } = req.body;
  const user = users[telegramId];
  
  if (!user || !user.package.amount) {
    return res.json({ roi: 0 });
  }
  
  const roi = user.package.dailyROI;
  user.earnings.totalROI += roi;
  user.earnings.availableBalance += roi;
  
  // Add transaction
  transactions.push({
    id: uuidv4(),
    userId: telegramId,
    type: 'roi',
    amount: roi,
    status: 'completed',
    timestamp: new Date(),
    details: { type: 'daily_roi' }
  });
  
  res.json({ success: true, roi, newBalance: user.earnings.availableBalance });
});

// 7. Serve frontend
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Export for Vercel
module.exports = app;
