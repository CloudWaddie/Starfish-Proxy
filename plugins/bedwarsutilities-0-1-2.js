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
        },
        {
            label: 'Anticheat Integration',
            description: 'Configure integration with the Anticheat plugin.',
            defaults: {
                autoFlushAnticheatViolationsOnGameStart: false
            },
            settings: [
                {
                    type: 'toggle',
                    key: 'autoFlushAnticheatViolationsOnGameStart',
                    text: ['OFF', 'ON'],
                    description: 'Automatically flush Anticheat violations when a Bedwars game starts.'
                }
            ]
        }
    ];

    api.initializeConfig(configSchema);

    api.configSchema(configSchema);

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
        this.gameStarted = false;
    }

    onChat(event) {
        if (!this.api.config.get('enabled')) {
            return;
        }

        const message = event.message;

        if (this.isBedwarsStartMessage(message)) {
            this.handleGameStart();
        }
    }

    isBedwarsStartMessage(message) {
        const cleanMessage = message.replace(/§[0-9a-fk-or]/g, '').trim();
        const startText = 'Protect your bed and destroy the enemy beds.';

        return cleanMessage.includes(startText);
    }

    handleGameStart() {
        if (this.gameStarted) {
            return;
        }

        this.gameStarted = true;
        
        const delay = this.api.config.get('delay');
        const autoFlushAnticheat = this.api.config.get('anticheatIntegration.autoFlushAnticheatViolationsOnGameStart');
        
        setTimeout(() => {
            this.runWhoCommand();

            if (autoFlushAnticheat) {
                const anticheatPlugin = this.api.getPluginInstance('anticheat');
                if (anticheatPlugin && typeof anticheatPlugin.flushViolations === 'function') {
                    anticheatPlugin.flushViolations();
                    this.api.sendChatMessage(`${this.PLUGIN_PREFIX} §aAnticheat violations flushed.`);
                } else {
                    this.api.sendErrorMessage(`${this.PLUGIN_PREFIX} Anticheat plugin not found or flushViolations method is missing.`);
                }
            }
        }, delay);
    }

    runWhoCommand() {
        this.api.sendChatToServer('/who');
    }
}
