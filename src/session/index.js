const mc = require('minecraft-protocol');
const { exec } = require('child_process');
const path = require('path');
const GameState = require('./game-state');
const { PacketSystem } = require('../packets');

class PlayerSession {
    constructor(proxy, client) {
        this.proxy = proxy;
        this.client = client;
        this.targetClient = null;
        
        if (!proxy.packetSystem) {
            proxy.packetSystem = new PacketSystem();
            proxy.packetSystem.initialize();
        }
        
        this.packetProcessor = proxy.packetSystem.getProcessor();
        this.username = client.username;
        this.uuid = client.uuid;
        this.gameState = new GameState(proxy);
        this.connected = false;
        this.forceReauth = proxy.currentPlayer?.forceReauth || false;
        this.tickInterval = null;
        this.inAuthWorld = false;

        this.connect();
    }

    connect() {
        console.log(`Connecting ${this.username} to ${this.proxy.config.targetHost}...`);

        const authOptions = {
            host: this.proxy.config.targetHost,
            port: this.proxy.config.targetPort || 25565,
            username: this.username,
            version: '1.8.9',
            auth: 'microsoft',
            hideErrors: false,
            profilesFolder: path.join(this.proxy.getBaseDir(), 'auth_cache', this.username),
            forceRefresh: this.forceReauth || false
        };

        if (!this.connected && !this.inAuthWorld) {
            authOptions.onMsaCode = (data) => {
                this.handleMicrosoftAuth(data);
            };
        }

        this.targetClient = mc.createClient(authOptions);

        this.targetClient.on('login', (packet) => this.handleLogin(packet));
        this.targetClient.on('error', (err) => this.handleError(err));
        this.targetClient.on('end', () => this.handleDisconnect());
    }

    handleMicrosoftAuth(msaData) {
        console.log(`${this.username} requires Microsoft authentication`);
        this.createAuthWorld();
        
        const url = `${msaData.verification_uri}?otc=${msaData.user_code}`;

        const headerMessages = [
            '§6========================================',
            '       §6S§eta§fr§bfi§3sh §5P§5roxy §e- Authentication',
            '§6========================================',
            '§eMicrosoft Auth Required!',
            '§7A browser tab should open automatically.',
            '§7If not, click the link below:'
        ];
        this.proxy.sendMessage(this.client, headerMessages.join('\n'));
        
        const clickableUrl = {
            text: url,
            color: 'aqua',
            underlined: true,
            clickEvent: {
                action: 'open_url',
                value: url
            },
            hoverEvent: {
                action: 'show_text',
                value: '§eClick to open authentication page'
            }
        };
        
        this.client.write('chat', {
            message: JSON.stringify(clickableUrl),
            position: 0
        });
        
        this.proxy.sendMessage(this.client, '§6========================================');
        
        const cmd = process.platform === 'darwin' ? `open "${url}"` 
                  : process.platform === 'win32' ? `start "" "${url}"` 
                  : `xdg-open "${url}"`;
        
        try { 
            exec(cmd); 
        } catch (e) {
            console.error('Failed to open browser:', e.message);
        }
    }



    createAuthWorld() {
        if (this.client.state !== mc.states.PLAY) return;
        
        this.inAuthWorld = true;
        
        this.client.write('login', {
            entityId: 1,
            gameMode: 1,
            dimension: 0,
            difficulty: 0,
            maxPlayers: 1,
            levelType: 'flat',
            reducedDebugInfo: false
        });
        
        this.client.write('position', {
            x: 0.5,
            y: 100,
            z: 0.5,
            yaw: 0,
            pitch: 0,
            flags: 0
        });
    }

    handleLogin(packet) {
        if (this.forceReauth) {
            this.disconnect('§aRe-authentication successful! Please reconnect to the server.');
            this.forceReauth = false;
            this.proxy.currentPlayer.forceReauth = false;
            return;
        }

        if (this.inAuthWorld) {
            console.log(`${this.username} authentication complete`);
            this.inAuthWorld = false;
            this.disconnect('§aAuthentication successful! Please reconnect to join the server.');
            return;
        }
        
        if (!this.connected) {
            console.log(`${this.username} successfully connected to ${this.proxy.config.targetHost}`);
        }
        
        this.connected = true;
        this.gameState.reset();
        this.gameState.loginPacket = packet;
        
        this.client.write('login', packet);
        this.proxy.pluginAPI.emit('player_join', { 
            player: this._createCurrentPlayerObject()
        });
        
        this.setupPacketForwarding();
    }

    handleError(err) {
        console.error(`Connection error for ${this.username}:`, err.message);
        
        if (!this.connected) {
            this.createAuthWorld();
            this.proxy.sendMessage(this.client, [
                '§6========================================',
                '   §6S§eta§fr§bfi§3sh §5P§5roxy §e- Connection Failed',
                '§6========================================',
                `§cFailed to connect to ${this.proxy.config.targetHost}`,
                `§cError: ${err.message}`,
                '§7Use §b/proxy server§7 to switch servers',
                '§6========================================'
            ].join('\n'));

            this.setupLimboMode();
        }
    }

    handleDisconnect() {
        if (!this.connected) {
            this.cleanup();
            return;
        }

        if (this.client.state === mc.states.PLAY) {
            this.client.end('Server disconnected');
        }
        this.cleanup();
    }

    setupPacketForwarding() {
        this.client.removeAllListeners('packet');
        this.targetClient.removeAllListeners('packet');

        this.client.on('packet', (data, meta) => {
            this.packetProcessor.processPacket(this, 'client', data, meta);
        });

        this.targetClient.on('packet', (data, meta) => {
            this.packetProcessor.processPacket(this, 'server', data, meta);
        });

        this.tickInterval = setInterval(() => {
            if (this.connected && this.proxy.currentPlayer === this) {
                this.proxy.pluginAPI.emit('tick', {});
            }
        }, 50);
    }
    
    _createCurrentPlayerObject() {
        return {
            uuid: this.uuid,
            name: this.username,
            displayName: this.username,
            isCurrentPlayer: true
        };
    }
    
    _createEntityPlayerObject(entityPlayer, entityId) {
        return {
            name: entityPlayer.name,
            uuid: entityPlayer.uuid,
            entityId: entityId,
            displayName: entityPlayer.name,
            isCurrentPlayer: false
        };
    }
    


    setupLimboMode() {
        this.client.removeAllListeners('packet');
        
        const keepAliveInterval = setInterval(() => {
            if (this.client.state === mc.states.PLAY) {
                this.client.write('keep_alive', {
                    keepAliveId: Math.floor(Math.random() * 2147483647)
                });
            }
        }, 20000);

        this.client.on('packet', (data, meta) => {
            if (meta.name === 'chat' && data.message.startsWith('/')) {
                this.proxy.commandHandler.handleCommand(data.message, this.client);
            }
        });
        
        this.client.once('end', () => {
            clearInterval(keepAliveInterval);
            this.cleanup();
        });
    }

    disconnect(reason = 'Disconnected') {
        this.cleanup();
        
        if (this.client && this.client.state === mc.states.PLAY) {
            this.client.end(reason);
        }
        if (this.targetClient && this.targetClient.state !== mc.states.DISCONNECTED) {
            this.targetClient.end();
        }
    }

    cleanup() {
        if (this.tickInterval) {
            clearInterval(this.tickInterval);
            this.tickInterval = null;
        }
        
        if (this.connected) {
            this.proxy.pluginAPI.emit('player_leave', { 
                player: this._createCurrentPlayerObject()
            });
        }
        
        this.connected = false;
        this.proxy.clearSession();
    }
}

module.exports = { PlayerSession }; 