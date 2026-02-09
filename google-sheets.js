const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

// Google Sheets setup
const SHEET_ID = 'YOUR_GOOGLE_SHEET_ID';
const SERVICE_ACCOUNT_EMAIL = 'your-service-account@project.iam.gserviceaccount.com';
const PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY;

class GoogleSheetsDB {
  constructor() {
    this.doc = null;
    this.usersSheet = null;
    this.transactionsSheet = null;
  }

  async init() {
    const auth = new JWT({
      email: SERVICE_ACCOUNT_EMAIL,
      key: PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    this.doc = new GoogleSpreadsheet(SHEET_ID, auth);
    await this.doc.loadInfo();
    
    // Get or create sheets
    this.usersSheet = this.doc.sheetsByTitle['Users'] || await this.doc.addSheet({ title: 'Users' });
    this.transactionsSheet = this.doc.sheetsByTitle['Transactions'] || await this.doc.addSheet({ title: 'Transactions' });
    
    // Set headers if new sheet
    if (this.usersSheet.rowCount === 0) {
      await this.usersSheet.setHeaderRow([
        'telegramId', 'username', 'firstName', 'lastName', 'joinDate',
        'package', 'binaryPosition', 'earnings', 'booster', 'referrals',
        'withdrawal', 'lastActive'
      ]);
    }
    
    if (this.transactionsSheet.rowCount === 0) {
      await this.transactionsSheet.setHeaderRow([
        'id', 'userId', 'type', 'amount', 'status', 'timestamp', 'details'
      ]);
    }
  }

  async getUser(telegramId) {
    await this.init();
    const rows = await this.usersSheet.getRows();
    const row = rows.find(r => r.get('telegramId') === telegramId);
    return row ? JSON.parse(row.get('data')) : null;
  }

  async saveUser(user) {
    await this.init();
    const rows = await this.usersSheet.getRows();
    const existingRow = rows.find(r => r.get('telegramId') === user.telegramId);
    
    if (existingRow) {
      existingRow.set('data', JSON.stringify(user));
      await existingRow.save();
    } else {
      await this.usersSheet.addRow({
        telegramId: user.telegramId,
        data: JSON.stringify(user)
      });
    }
  }

  async addTransaction(transaction) {
    await this.init();
    await this.transactionsSheet.addRow({
      id: transaction.id,
      userId: transaction.userId,
      type: transaction.type,
      amount: transaction.amount,
      status: transaction.status,
      timestamp: transaction.timestamp,
      details: JSON.stringify(transaction.details || {})
    });
  }
}

module.exports = new GoogleSheetsDB();
