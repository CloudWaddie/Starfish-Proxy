
const sqlite3 = require('sqlite3').verbose();
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

    const reportTracker = new ReportTracker(api, dbPath);
    reportTracker.registerHandlers();
    reportTracker.registerCommands();

    return reportTracker;
};

class ReportTracker {
    constructor(api, dbPath) {
        this.api = api;
        this.dbPath = dbPath;
        this.PLUGIN_PREFIX = this.api.getPrefix();
        this.database = new ReportDatabase(dbPath);

        this.database.initialize().catch(err => {
            console.error('Failed to initialize report database:', err);
        });
    }

    registerHandlers() {
        this.api.on('client_chat', this.onChat.bind(this));
        this.api.on('player_join', this.onPlayerJoin.bind(this));
    }

    registerCommands() {
        this.api.commands((registry) => {
            registry.command('list')
                .description('List all reported players.')
                .handler((ctx) => this.showReportListGUI(ctx.proxy.currentPlayer));

            registry.command('add')
                .description('Add a player to the report list.')
                .argument('<player>', 'Player to add')
                .handler(async (ctx) => {
                    const player = ctx.args.player;
                    await this.database.addReport(player);
                    ctx.send(`${this.PLUGIN_PREFIX} Added ${player} to the report list.`);
                });

            registry.command('remove')
                .description('Remove a player from the report list.')
                .argument('<player>', 'Player to remove')
                .handler(async (ctx) => {
                    const player = ctx.args.player;
                    const removed = await this.database.removeReport(player);
                    if (removed) {
                        ctx.send(`${this.PLUGIN_PREFIX} Removed ${player} from the report list.`);
                    } else {
                        ctx.send(`${this.PLUGIN_PREFIX} ${player} is not in the report list.`);
                    }
                });
        });
    }

    async onChat(event) {
        const message = event.message;
        if (message.startsWith('/wdr ')) {
            const args = message.split(' ');
            if (args.length >= 2) {
                const reportedPlayer = args[1];
                await this.database.addReport(reportedPlayer);
                this.api.chat(`${this.PLUGIN_PREFIX} Added ${reportedPlayer} to the report list.`);
            }
        }
    }

    async onPlayerJoin(event) {
        const player = event.player;
        const report = await this.database.getReport(player.name);
        if (report) {
            this.api.chat(`${this.PLUGIN_PREFIX} §c${player.name} is in your game and has been reported by you.`);
        }
    }

    async showReportListGUI(player) {
        const reports = await this.database.getAllReports();
        const gui = this.api.createGUI('Reported Players', 54);

        for (let i = 0; i < reports.length; i++) {
            const report = reports[i];
            const reportedOn = new Date(report.reported_on).toLocaleString();
            const item = {
                blockId: 397, // Player Head
                itemDamage: 3,
                itemCount: 1,
                displayName: `§c${report.username}`,
                lore: [
                    `§7Reported on: §f${reportedOn}`,
                    '§8Click to remove this report.'
                ],
                nbtData: {
                    type: 'compound',
                    name: '',
                    value: {
                        display: {
                            type: 'compound',
                            value: {
                                Name: { type: 'string', value: `§c${report.username}` },
                                Lore: {
                                    type: 'list',
                                    value: {
                                        type: 'string',
                                        value: [
                                            `§7Reported on: §f${reportedOn}`,
                                            '§8Click to remove this report.'
                                        ]
                                    }
                                }
                            }
                        },
                        SkullOwner: {
                            type: 'compound',
                            value: {
                                Name: { type: 'string', value: report.username }
                            }
                        }
                    }
                }
            };

            gui.setItem(i, item);
            gui.onClick(i, () => {
                console.log(`Removing report for ${report.username}`);
                this.database.removeReport(report.username);
                this.api.chat(`${this.PLUGIN_PREFIX} Removed ${report.username} from the report list.`);
                gui.close();
            });
        }

        gui.show(player);
    }
}
