const path = require('path');

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

class ReportTracker {
    constructor(api, dbPath, sqlite3) {
        this.api = api;
        this.dbPath = dbPath;
        this.PLUGIN_PREFIX = this.api.getPrefix();
        this.database = new ReportDatabase(dbPath, sqlite3);

        this.database.initialize().catch(err => {
            console.error('Failed to initialize report database:', err);
        });
    }

    registerHandlers() {
        this.api.on('player_info', this.onPlayerListUpdate.bind(this));
    }

    registerCommands() {
        this.api.commands((registry) => {
            registry.command('report')
                .description('Report a player.')
                .argument('<player>', 'Player to report')
                .handler(async (ctx) => {
                    const playerName = ctx.args.player;
                    const player = this.api.getPlayerByName(playerName);
                    const uuid = player ? player.uuid : null;
                    try {
                        const added = await this.database.addReport(playerName, uuid);
                        if (added) {
                            ctx.send(`${this.PLUGIN_PREFIX} Reported ${playerName}.`);
                        } else {
                            ctx.send(`${this.PLUGIN_PREFIX} ${playerName} is already reported.`);
                        }
                    } catch (err) {
                        ctx.send(`${this.PLUGIN_PREFIX} Error reporting ${playerName}: ${err.message}`);
                    }
                });

            registry.command('unreport')
                .description('Remove a player from the report list.')
                .argument('<player>', 'Player to unreport')
                .handler(async (ctx) => {
                    const playerName = ctx.args.player;
                    try {
                        const removed = await this.database.removeReport(playerName);
                        if (removed) {
                            ctx.send(`${this.PLUGIN_PREFIX} Removed ${playerName} from reports.`);
                        } else {
                            ctx.send(`${this.PLUGIN_PREFIX} ${playerName} was not reported.`);
                        }
                    } catch (err) {
                        ctx.send(`${this.PLUGIN_PREFIX} Error un-reporting ${playerName}: ${err.message}`);
                    }
                });

            registry.command('checkreport')
                .description('Check if a player is on the report list.')
                .argument('<player>', 'Player to check')
                .handler(async (ctx) => {
                    const playerName = ctx.args.player;
                    try {
                        const report = await this.database.getReport(playerName);
                        if (report) {
                            const date = new Date(report.reported_on).toLocaleString();
                            ctx.send(`${this.PLUGIN_PREFIX} ${playerName} was reported on ${date}.`);
                        } else {
                            ctx.send(`${this.PLUGIN_PREFIX} ${playerName} is not on the report list.`);
                        }
                    } catch (err) {
                        ctx.send(`${this.PLUGIN_PREFIX} Error checking report for ${playerName}: ${err.message}`);
                    }
                });

            registry.command('listreports')
                .description('List all reported players.')
                .handler(async (ctx) => {
                    try {
                        const reports = await this.database.getAllReports();
                        if (reports.length === 0) {
                            ctx.send(`${this.PLUGIN_PREFIX} No players have been reported.`);
                            return;
                        }

                        let message = `${this.PLUGIN_PREFIX} Reported players:\n`;
                        reports.forEach((report, index) => {
                            const date = new Date(report.reported_on).toLocaleString();
                            message += `§7${index + 1}. §c${report.username} §7- ${date}\n`;
                        });
                        ctx.send(message.trim());
                    } catch (err) {
                        ctx.send(`${this.PLUGIN_PREFIX} Error listing reports: ${err.message}`);
                    }
                });
        });
    }

    async onPlayerListUpdate(event) {
        if (event.action !== 0) return;

        for (const playerData of event.players) {
            if (playerData.name) {
                const report = await this.database.getReport(playerData.name);
                if (report) {
                    this.api.chat(`${this.PLUGIN_PREFIX} §cReported player ${playerData.name} has joined your game.`);
                    this.api.sound('note.pling');
                }
            }
        }
    }
}

module.exports = (api) => {
    api.metadata({
        name: 'report-tracker',
        displayName: 'Report Tracker',
        prefix: '§cRT',
        version: '1.0.0',
        author: 'Gemini',
        description: 'Tracks reported players and notifies you when they are in your game.',
    });

    if (!api.proxy) {
        return;
    }

    const sqlite3 = api.sqlite3.verbose();

    const { getPluginDataDir } = require('../src/utils/paths');
    const dbPath = path.join(getPluginDataDir(), 'report-tracker.db');

    const reportTracker = new ReportTracker(api, dbPath, sqlite3);
    reportTracker.registerHandlers();
    reportTracker.registerCommands();

    return reportTracker;
};
