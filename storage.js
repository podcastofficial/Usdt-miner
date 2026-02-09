// File-based storage system for Vercel
const fs = require('fs');
const path = require('path');

// In-memory storage (primary)
let users = new Map();
let transactions = new Map();

// File storage backup
const DATA_DIR = path.join('/tmp', 'usdt-miner-data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const USERS_FILE = path.join(DATA_DIR, 'users.json');
const TRANSACTIONS_FILE = path.join(DATA_DIR, 'transactions.json');

// Initialize storage
function initStorage() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const data = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
      users = new Map(Object.entries(data));
    }
    
    if (fs.existsSync(TRANSACTIONS_FILE)) {
      const data = JSON.parse(fs.readFileSync(TRANSACTIONS_FILE, 'utf8'));
      transactions = new Map(Object.entries(data));
    }
    
    console.log('✅ Storage initialized');
  } catch (error) {
    console.log('🆕 Starting with fresh storage');
  }
}

// Save to file
function saveToFile() {
  try {
    const usersObj = Object.fromEntries(users);
    const transactionsObj = Object.fromEntries(transactions);
    
    fs.writeFileSync(USERS_FILE, JSON.stringify(usersObj, null, 2));
    fs.writeFileSync(TRANSACTIONS_FILE, JSON.stringify(transactionsObj, null, 2));
    
    console.log('💾 Data saved to file');
  } catch (error) {
    console.error('❌ Save error:', error);
  }
}

// Auto-save every 5 minutes
setInterval(saveToFile, 5 * 60 * 1000);

// User operations
const storage = {
  // User operations
  createUser(user) {
    users.set(user.telegramId, user);
    saveToFile();
    return user;
  },
  
  getUser(telegramId) {
    return users.get(telegramId);
  },
  
  updateUser(telegramId, updates) {
    const user = users.get(telegramId);
    if (user) {
      const updated = { ...user, ...updates, updatedAt: new Date() };
      users.set(telegramId, updated);
      saveToFile();
      return updated;
    }
    return null;
  },
  
  getAllUsers() {
    return Array.from(users.values());
  },
  
  // Transaction operations
  addTransaction(transaction) {
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const tx = { ...transaction, id };
    transactions.set(id, tx);
    saveToFile();
    return tx;
  },
  
  getUserTransactions(userId) {
    return Array.from(transactions.values())
      .filter(tx => tx.userId === userId)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  },
  
  // Binary tree operations
  updateBinaryVolume(telegramId, side, amount) {
    const user = users.get(telegramId);
    if (user) {
      if (side === 'left') {
        user.binaryPosition.leftVolume = (user.binaryPosition.leftVolume || 0) + amount;
      } else if (side === 'right') {
        user.binaryPosition.rightVolume = (user.binaryPosition.rightVolume || 0) + amount;
      }
      users.set(telegramId, user);
      saveToFile();
    }
  },
  
  // Get team members
  getTeamMembers(parentId) {
    return Array.from(users.values())
      .filter(user => user.binaryPosition?.parentId === parentId);
  },
  
  // Statistics
  getStats() {
    const allUsers = Array.from(users.values());
    return {
      totalUsers: allUsers.length,
      activeUsers: allUsers.filter(u => u.package?.amount > 0).length,
      totalInvestment: allUsers.reduce((sum, u) => sum + (u.package?.amount || 0), 0),
      totalWithdrawals: allUsers.reduce((sum, u) => sum + (u.earnings?.totalWithdrawn || 0), 0)
    };
  }
};

// Initialize on startup
initStorage();

module.exports = storage;
