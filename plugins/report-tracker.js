
const path = require('path');

class ReportDatabase {
    constructor(dbPath) {
        this.dbPath = dbPath;
        this.db = null;
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;

        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('Error opening report database:', err.message);
                    reject(err);
                    return;
                }

                this.db.run(`
                    CREATE TABLE IF NOT EXISTS reports (
                        username TEXT PRIMARY KEY,
                        uuid TEXT,
                        reported_on INTEGER NOT NULL
                    )
                `, (err) => {
                    if (err) {
                        console.error('Error creating reports table:', err.message);
                        reject(err);
                        return;
                    }
                    this.initialized = true;
                    console.log('Report database initialized at:', this.dbPath);
                    resolve();
                });
            });
        });
    }

    async close() {
        if (this.db) {
            return new Promise((resolve) => {
                this.db.close((err) => {
                    if (err) {
                        console.error('Error closing report database:', err.message);
                    }
                    this.db = null;
                    this.initialized = false;
                    resolve();
                });
            });
        }
    }

    async addReport(username, uuid = null) {
        if (!this.initialized) await this.initialize();

        console.log(`Adding report for ${username}`);

        return new Promise((resolve, reject) => {
            const now = Date.now();
            this.db.run(`
                INSERT INTO reports (username, uuid, reported_on)
                VALUES (?, ?, ?)
                ON CONFLICT(username) DO UPDATE SET
                    uuid = COALESCE(excluded.uuid, uuid),
                    reported_on = excluded.reported_on
            `, [username, uuid, now], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes > 0);
                }
            });
        });
    }

    async removeReport(username) {
        if (!this.initialized) await this.initialize();

        return new Promise((resolve, reject) => {
            this.db.run('DELETE FROM reports WHERE username = ?', [username], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes > 0);
                }
            });
        });
    }

    async getReport(username) {
        if (!this.initialized) await this.initialize();

        return new Promise((resolve, reject) => {
            this.db.get('SELECT * FROM reports WHERE username = ?', [username], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row || null);
                }
            });
        });
    }

    async getAllReports(limit = 50) {
        if (!this.initialized) await this.initialize();

        return new Promise((resolve, reject) => {
            this.db.all('SELECT * FROM reports ORDER BY reported_on DESC LIMIT ?', [limit], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }
}

module.exports = (api) => {
    const sqlite3 = api.sqlite3.verbose();
    const path = require('path');
    api.metadata({
        name: 'report-tracker',
        displayName: 'Report Tracker',
        prefix: '§cRT',
        version: '1.0.0',
        author: 'Gemini',
        description: 'Tracks reported players and notifies you when they are in your game.',
    });

    const { getPluginDataDir } = require('../src/utils/paths');
    const dbPath = path.join(getPluginDataDir(), 'report-tracker.db');

    const reportTracker = new ReportTracker(api, dbPath, sqlite3);
    reportTracker.registerHandlers();
    reportTracker.registerCommands();

    return reportTracker;
};

class ReportDatabase {
    constructor(dbPath, sqlite3) {
        this.dbPath = dbPath;
        this.db = null;
        this.initialized = false;
        this.sqlite3 = sqlite3;
    }

    async initialize() {
        if (this.initialized) return;

        return new Promise((resolve, reject) => {
            this.db = new this.sqlite3.Database(this.dbPath, (err) => {
