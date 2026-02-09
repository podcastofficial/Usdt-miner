const { v4: uuidv4 } = require('uuid');
const storage = require('./storage');

// PACKAGES CONFIGURATION
const PACKAGES = {
  basic: { amount: 10, dailyROI: 0.10, dailyCap: 10, name: 'Basic' },
  silver: { amount: 25, dailyROI: 0.25, dailyCap: 25, name: 'Silver' },
  gold: { amount: 100, dailyROI: 1.00, dailyCap: 100, name: 'Gold' },
  platinum: { amount: 250, dailyROI: 2.50, dailyCap: 250, name: 'Platinum' },
  diamond: { amount: 500, dailyROI: 5.00, dailyCap: 500, name: 'Diamond' },
  crown: { amount: 1000, dailyROI: 10.00, dailyCap: 1000, name: 'Crown' }
};

class UserManager {
  // Register new user
  registerUser(telegramId, userData) {
    const existingUser = storage.getUser(telegramId);
    
    if (existingUser) {
      return existingUser;
    }
    
    const user = {
      telegramId,
      username: userData.username || '',
      firstName: userData.firstName || '',
      lastName: userData.lastName || '',
      joinDate: new Date(),
      package: {
        name: null,
        amount: 0,
        dailyROI: 0,
        dailyCap: 0,
        purchaseDate: null,
        roiEarned: 0,
        roiPercentage: 0,
        roiDays: 250
      },
      binaryPosition: {
        parentId: userData.referrerId || null,
        side: null,
        leftVolume: 0,
        rightVolume: 0,
        leftCount: 0,
        rightCount: 0
      },
      earnings: {
        totalROI: 0,
        totalBinary: 0,
        totalReferral: 0,
        totalWithdrawn: 0,
        availableBalance: 0,
        referralBalance: 0
      },
      booster: {
        active: false,
        eligible: false,
        directReferrals: [],
        completedDate: null,
        daysLeft: 7
      },
      referrals: {
        direct: [],
        level1: [],
        level2: [],
        level3: [],
        level4: [],
        level5: [],
        level6: [],
        level7: [],
        level8: []
      },
      withdrawal: {
        lastWithdrawal: null,
        dailyLimit: 0,
        walletAddress: ''
      },
      settings: {
        notifications: true,
        autoReinvest: false
      },
      lastActive: new Date(),
      isActive: true
    };
    
    // Handle referral if exists
    if (userData.referrerId && userData.referrerId !== telegramId) {
      this.addReferral(userData.referrerId, telegramId);
    }
    
    return storage.createUser(user);
  }
  
  // Add referral to upline
  addReferral(referrerId, newUserId) {
    const referrer = storage.getUser(referrerId);
    if (referrer) {
      // Add to direct referrals
      if (!referrer.referrals.direct.includes(newUserId)) {
        referrer.referrals.direct.push(newUserId);
      }
      
      // Update binary position (assign to smaller side)
      const newUser = storage.getUser(newUserId);
      if (newUser) {
        if (referrer.binaryPosition.leftCount <= referrer.binaryPosition.rightCount) {
          newUser.binaryPosition.side = 'left';
          referrer.binaryPosition.leftCount += 1;
        } else {
          newUser.binaryPosition.side = 'right';
          referrer.binaryPosition.rightCount += 1;
        }
        
        storage.updateUser(newUserId, newUser);
      }
      
      storage.updateUser(referrerId, referrer);
      
      // Award referral commission (8%)
      if (newUser?.package?.amount) {
        const commission = newUser.package.amount * 0.08;
        referrer.earnings.referralBalance += commission;
        referrer.earnings.availableBalance += commission;
        referrer.earnings.totalReferral += commission;
        
        storage.addTransaction({
          userId: referrerId,
          type: 'referral',
          amount: commission,
          status: 'completed',
          timestamp: new Date(),
          details: { level: 0, referredUser: newUserId }
        });
        
        storage.updateUser(referrerId, referrer);
      }
    }
  }
  
  // Invest in package
  invest(telegramId, packageType) {
    const packageData = PACKAGES[packageType];
    if (!packageData) {
      throw new Error('Invalid package');
    }
    
    const user = storage.getUser(telegramId);
    if (!user) {
      throw new Error('User not found');
    }
    
    // Update user package
    user.package = {
      name: packageType,
      amount: packageData.amount,
      dailyROI: packageData.dailyROI,
      dailyCap: packageData.dailyCap,
      purchaseDate: new Date(),
      roiEarned: 0,
      roiPercentage: 0,
      roiDays: 250
    };
    
    user.withdrawal.dailyLimit = packageData.dailyCap;
    user.booster.daysLeft = 7;
    user.lastActive = new Date();
    
    // Record transaction
    storage.addTransaction({
      userId: telegramId,
      type: 'investment',
      amount: packageData.amount,
      status: 'completed',
      timestamp: new Date(),
      details: { package: packageType }
    });
    
    // Update binary volumes for upline
    this.updateUplineVolumes(user, packageData.amount);
    
    storage.updateUser(telegramId, user);
    
    return { success: true, package: packageData };
  }
  
  // Update upline binary volumes
  updateUplineVolumes(user, amount) {
    let currentUser = user;
    let side = user.binaryPosition.side;
    
    while (currentUser.binaryPosition.parentId) {
      const parent = storage.getUser(currentUser.binaryPosition.parentId);
      if (!parent) break;
      
      if (side === 'left') {
        parent.binaryPosition.leftVolume += amount;
      } else if (side === 'right') {
        parent.binaryPosition.rightVolume += amount;
      }
      
      storage.updateUser(parent.telegramId, parent);
      
      // Move up the tree
      currentUser = parent;
      side = currentUser.binaryPosition.side;
    }
  }
  
  // Calculate daily ROI for user
  calculateDailyROI(user) {
    if (!user.package.amount || user.package.amount <= 0) {
      return 0;
    }
    
    // Check if ROI cap reached (250%)
    const maxROI = user.package.amount * 2.5;
    if (user.package.roiEarned >= maxROI) {
      return 0;
    }
    
    let dailyROI = user.package.dailyROI;
    
    // Apply booster if active
    if (user.booster.active) {
      dailyROI *= 2;
    }
    
    // Ensure we don't exceed 250%
    const remainingROI = maxROI - user.package.roiEarned;
    return Math.min(dailyROI, remainingROI);
  }
  
  // Calculate binary income
  calculateBinaryIncome(user) {
    const leftVolume = user.binaryPosition.leftVolume || 0;
    const rightVolume = user.binaryPosition.rightVolume || 0;
    const matchingVolume = Math.min(leftVolume, rightVolume);
    const binaryIncome = matchingVolume * 0.1; // 10%
    
    // Apply daily capping
    const dailyCap = user.package.dailyCap || 0;
    return Math.min(binaryIncome, dailyCap);
  }
  
  // Process withdrawal
  withdraw(telegramId, amount, walletAddress) {
    const user = storage.getUser(telegramId);
    if (!user) {
      throw new Error('User not found');
    }
    
    // Check 24-hour cooldown
    if (user.withdrawal.lastWithdrawal) {
      const lastWithdrawal = new Date(user.withdrawal.lastWithdrawal);
      const now = new Date();
      const hoursDiff = (now - lastWithdrawal) / (1000 * 60 * 60);
      
      if (hoursDiff < 24) {
        throw new Error('Withdrawal allowed once every 24 hours');
      }
    }
    
    // Check daily limit
    const dailyLimit = user.withdrawal.dailyLimit || user.package.dailyCap;
    if (amount > dailyLimit) {
      throw new Error(`Maximum withdrawal: $${dailyLimit}`);
    }
    
    // Check available balance
    if (amount > user.earnings.availableBalance) {
      throw new Error('Insufficient balance');
    }
    
    // Update balances
    user.earnings.availableBalance -= amount;
    user.earnings.totalWithdrawn += amount;
    user.withdrawal.lastWithdrawal = new Date();
    user.withdrawal.walletAddress = walletAddress;
    user.lastActive = new Date();
    
    // Record transaction
    const transaction = storage.addTransaction({
      userId: telegramId,
      type: 'withdrawal',
      amount: amount,
      status: 'pending',
      timestamp: new Date(),
      details: {
        walletAddress: walletAddress,
        method: 'USDT_TRC20'
      }
    });
    
    storage.updateUser(telegramId, user);
    
    return {
      success: true,
      transactionId: transaction.id,
      newBalance: user.earnings.availableBalance
    };
  }
  
  // Get user dashboard data
  getDashboard(telegramId) {
    const user = storage.getUser(telegramId);
    if (!user) {
      throw new Error('User not found');
    }
    
    const transactions = storage.getUserTransactions(telegramId).slice(0, 10);
    const todayROI = this.calculateDailyROI(user);
    const binaryIncome = this.calculateBinaryIncome(user);
    
    // Check booster eligibility
    const boosterEligible = this.checkBoosterEligibility(user);
    
    return {
      user,
      transactions,
      todayROI,
      binaryIncome,
      packages: PACKAGES,
      boosterEligible,
      stats: storage.getStats()
    };
  }
  
  // Check booster eligibility
  checkBoosterEligibility(user) {
    if (user.booster.active) {
      return { eligible: false, active: true, message: 'Booster active (2x ROI)' };
    }
    
    if (user.booster.daysLeft <= 0) {
      return { eligible: false, message: 'Booster period expired' };
    }
    
    const directCount = user.referrals.direct.length;
    const needed = 2 - directCount;
    
    if (directCount >= 2) {
      return { eligible: true, message: 'Eligible for booster activation' };
    }
    
    return {
      eligible: false,
      needed,
      daysLeft: user.booster.daysLeft,
      message: `Need ${needed} more direct referrals`
    };
  }
  
  // Activate booster
  activateBooster(telegramId) {
    const user = storage.getUser(telegramId);
    if (!user) {
      throw new Error('User not found');
    }
    
    if (user.booster.active) {
      throw new Error('Booster already active');
    }
    
    if (user.referrals.direct.length < 2) {
      throw new Error('Need 2 direct referrals to activate booster');
    }
    
    if (user.booster.daysLeft <= 0) {
      throw new Error('Booster activation period expired');
    }
    
    user.booster.active = true;
    user.booster.eligible = false;
    user.booster.completedDate = new Date();
    user.lastActive = new Date();
    
    storage.updateUser(telegramId, user);
    
    return { success: true, message: 'Booster activated! Daily ROI is now 2x.' };
  }
  
  // Get binary tree data
  getBinaryTree(telegramId, depth = 3) {
    const user = storage.getUser(telegramId);
    if (!user) {
      throw new Error('User not found');
    }
    
    const leftTeam = this.getTeamTree(telegramId, 'left', depth);
    const rightTeam = this.getTeamTree(telegramId, 'right', depth);
    
    return {
      leftTeam,
      rightTeam,
      leftVolume: user.binaryPosition.leftVolume || 0,
      rightVolume: user.binaryPosition.rightVolume || 0,
      matchingVolume: Math.min(user.binaryPosition.leftVolume || 0, user.binaryPosition.rightVolume || 0),
      binaryIncome: (Math.min(user.binaryPosition.leftVolume || 0, user.binaryPosition.rightVolume || 0) * 0.1).toFixed(2)
    };
  }
  
  // Get team tree recursively
  getTeamTree(parentId, side, depth, currentDepth = 0) {
    if (currentDepth >= depth) return [];
    
    const teamMembers = storage.getTeamMembers(parentId)
      .filter(member => member.binaryPosition.side === side);
    
    const result = [];
    
    for (const member of teamMembers) {
      const children = this.getTeamTree(member.telegramId, side, depth, currentDepth + 1);
      result.push({
        telegramId: member.telegramId,
        username: member.username || member.firstName || 'User',
        packageAmount: member.package?.amount || 0,
        children
      });
    }
    
    return result;
  }
  
  // Get referral data
  getReferralData(telegramId) {
    const user = storage.getUser(telegramId);
    if (!user) {
      throw new Error('User not found');
    }
    
    const directReferrals = user.referrals.direct.map(id => {
      const refUser = storage.getUser(id);
      return refUser ? {
        telegramId: refUser.telegramId,
        username: refUser.username || refUser.firstName || 'User',
        packageAmount: refUser.package?.amount || 0,
        joinDate: refUser.joinDate
      } : null;
    }).filter(Boolean);
    
    const referralLink = `https://t.me/${process.env.BOT_USERNAME || 'your_bot'}?start=${telegramId}`;
    
    return {
      direct: directReferrals,
      totalDirect: directReferrals.length,
      referralLink,
      earnings: {
        direct: user.earnings.totalReferral,
        total: user.earnings.totalReferral // Simplified for now
      }
    };
  }
}

module.exports = new UserManager();
