// Bedwars Utilities
// Auto /who & more in the future

module.exports = (api) => {
    api.metadata({
        name: 'bedwarsutilities',
        displayName: 'Bedwars Utilities',
        prefix: '§eBW',
        version: '0.1.2',
        author: 'Hexze',
        description: 'Various utilities for the Bedwars gamemode',
    });

    const bedwarsWho = new BedwarsWho(api);
    
    const configSchema = [
        {
            label: 'Auto Who Settings',
            description: 'Configure when to automatically run /who command.',
            defaults: { 
                enabled: true,
                delay: 0
            },
            settings: [
                {
                    type: 'toggle',
                    key: 'enabled',
                    text: ['OFF', 'ON'],
                    description: 'Enable or disable automatic /who command on Bedwars game start.'
                },
                {
                    type: 'cycle',
                    key: 'delay',
                    description: 'Delay in milliseconds before running /who command.',
                    displayLabel: 'Delay',
                    values: [
                        { text: '0ms', value: 0 },
                        { text: '500ms', value: 500 },
                        { text: '1000ms', value: 1000 }
                    ]
                }
            ]
        }
    ];

    api.initializeConfig(configSchema);

    api.commands((registry) => {
    });
    
    bedwarsWho.registerHandlers();
    return bedwarsWho;
};

class BedwarsWho {
    constructor(api) {
        this.api = api;
        this.PLUGIN_PREFIX = this.api.getPrefix();
        this.gameStarted = false;
    }

    registerHandlers() {
        this.api.on('chat', this.onChat.bind(this));
        this.api.on('respawn', this.onWorldChange.bind(this));
    }

    onWorldChange(event) {
        if (this.gameStarted) {
            this.gameStarted = false;
            this.api.emit('bedwars_game_end', {});
            this.api.debugLog(`${this.PLUGIN_PREFIX} Bedwars game ended.`);
        }
    }

    onChat(event) {
        if (!this.api.config.get('enabled')) {
            return;
        }

        const message = event.message;

        if (this.isBedwarsStartMessage(message)) {
            this.handleGameStart();
        } else if (this.isBedwarsEndMessage(message)) {
            this.handleGameEnd();
        }
    }

    isBedwarsStartMessage(message) {
        const cleanMessage = message.replace(/§[0-9a-fk-or]/g, '').trim();
        const startText = 'Protect your bed and destroy the enemy beds.';
        return cleanMessage.includes(startText);
    }

    isBedwarsEndMessage(message) {
        const cleanMessage = message.replace(/§[0-9a-fk-or]/g, '').trim();
        // Common Bedwars end messages
        return cleanMessage.includes('WINNER!') || cleanMessage.includes('has been eliminated!');
    }

    handleGameEnd() {
        if (this.gameStarted) {
            this.gameStarted = false;
            this.api.emit('bedwars_game_end', {});
            this.api.debugLog(`${this.PLUGIN_PREFIX} Bedwars game ended.`);
        }
    }

    handleGameStart() {
        if (this.gameStarted) {
            return;
        }

        this.gameStarted = true;
        this.api.emit('bedwars_game_start', {});
        this.api.debugLog(`${this.PLUGIN_PREFIX} Bedwars game started.`);

        const delay = this.api.config.get('delay');

        setTimeout(() => {
            this.runWhoCommand();
        }, delay);
    }

    runWhoCommand() {
        this.api.sendChatToServer('/who');
    }
}
