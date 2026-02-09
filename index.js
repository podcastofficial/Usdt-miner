const express = require('express');
const cors = require('cors');
const path = require('path');
const userManager = require('./users');
const storage = require('./storage');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    storage: 'in-memory',
    users: storage.getAllUsers().length
  });
});

// 1. Register/Login User
app.post('/api/register', (req, res) => {
  try {
    const { telegramId, username, firstName, lastName, referrerId } = req.body;
    
    if (!telegramId) {
      return res.status(400).json({ error: 'Telegram ID required' });
    }
    
    const user = userManager.registerUser(telegramId, {
      username,
      firstName,
      lastName,
      referrerId
    });
    
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Get Dashboard Data
app.get('/api/dashboard/:telegramId', (req, res) => {
  try {
    const dashboard = userManager.getDashboard(req.params.telegramId);
    res.json(dashboard);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

// 3. Invest in Package
app.post('/api/invest', (req, res) => {
  try {
    const { telegramId, packageType } = req.body;
    
    if (!telegramId || !packageType) {
      return res.status(400).json({ error: 'Telegram ID and package type required' });
    }
    
    const result = userManager.invest(telegramId, packageType);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 4. Withdraw Funds
app.post('/api/withdraw', (req, res) => {
  try {
    const { telegramId, amount, walletAddress } = req.body;
    
    if (!telegramId || !amount || !walletAddress) {
      return res.status(400).json({ error: 'All fields required' });
    }
    
    const result = userManager.withdraw(telegramId, parseFloat(amount), walletAddress);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 5. Get Binary Tree
app.get('/api/binary/:telegramId', (req, res) => {
  try {
    const tree = userManager.getBinaryTree(req.params.telegramId);
    res.json(tree);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

// 6. Get Referral Data
app.get('/api/referrals/:telegramId', (req, res) => {
  try {
    const data = userManager.getReferralData(req.params.telegramId);
    res.json(data);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

// 7. Activate Booster
app.post('/api/booster/activate', (req, res) => {
  try {
    const { telegramId } = req.body;
    
    if (!telegramId) {
      return res.status(400).json({ error: 'Telegram ID required' });
    }
    
    const result = userManager.activateBooster(telegramId);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 8. Admin Stats (Optional)
app.get('/api/admin/stats', (req, res) => {
  // Simple protection (you can add proper auth)
  const { secret } = req.query;
  if (secret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  
  const users = storage.getAllUsers();
  const stats = storage.getStats();
  
  res.json({
    stats,
    recentUsers: users
      .sort((a, b) => new Date(b.joinDate) - new Date(a.joinDate))
      .slice(0, 10)
      .map(u => ({
        telegramId: u.telegramId,
        username: u.username,
        package: u.package.name,
        balance: u.earnings.availableBalance,
        joinDate: u.joinDate
      }))
  });
});

// 9. Daily ROI Cron Endpoint
app.get('/api/cron/daily-roi', (req, res) => {
  // Protect with secret
  const { secret } = req.query;
  if (secret !== process.env.CRON_SECRET) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  
  try {
    const users = storage.getAllUsers();
    let processed = 0;
    let totalROI = 0;
    
    users.forEach(user => {
      if (user.package.amount > 0) {
        const roi = userManager.calculateDailyROI(user);
        if (roi > 0) {
          // Update user earnings
          user.package.roiEarned += roi;
          user.package.roiPercentage = (user.package.roiEarned / user.package.amount) * 100;
          user.earnings.totalROI += roi;
          user.earnings.availableBalance += roi;
          user.lastActive = new Date();
          
          // Record transaction
          storage.addTransaction({
            userId: user.telegramId,
            type: 'roi',
            amount: roi,
            status: 'completed',
            timestamp: new Date(),
            details: { booster: user.booster.active }
          });
          
          storage.updateUser(user.telegramId, user);
          
          processed++;
          totalROI += roi;
        }
        
        // Update booster days
        if (!user.booster.active && user.booster.daysLeft > 0) {
          user.booster.daysLeft -= 1;
          storage.updateUser(user.telegramId, user);
        }
      }
    });
    
    res.json({
      success: true,
      processed,
      totalROI,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 10. Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Export for Vercel
module.exports = app;
