class GUI {
    constructor(manager, title, size) {
        this.manager = manager;
        this.title = title;
        this.size = size;
        this.items = new Map();
        this.clickHandlers = new Map();
    }

    setItem(slot, item) {
        this.items.set(slot, item);
        return this;
    }

    onClick(slot, handler) {
        console.log(`onClick: ${slot}`);
        this.clickHandlers.set(slot, handler);
        return this;
    }

    show(player) {
        this.manager.show(player, this);
    }

    close() {
        this.manager.close(this);
    }
}

class GUIManager {
    constructor(api, events) {
        this.api = api;
        this.events = events;
        this.playerGuis = new Map(); // Map<player.uuid, {gui, windowId}>

        this.events.registerPacketInterceptor('client', ['window_click'], (event) => {
            const playerData = this.playerGuis.get(event.player.uuid);
            if (playerData) {
                const { gui, windowId } = playerData;
                if (event.windowId !== windowId) return;

                event.cancelled = true;
                this.api.sendTransaction(windowId, event.action, true);

                const clickHandler = gui.clickHandlers.get(event.slot);
                if (clickHandler) {
                    clickHandler(event.player);
                }
            }
        });
    }

    create(title, size) {
        const gui = new GUI(this, title, size);
        return gui;
    }

    show(player, gui) {
        const windowId = this.api.createChest(gui.title, gui.size);
        if (windowId) {
            this.playerGuis.set(player.uuid, { gui, windowId });
            this.render(player, gui, windowId);
        }
    }

    render(player, gui, windowId) {
        const items = new Array(gui.size).fill({ blockId: -1 });

        for (const [slot, item] of gui.items.entries()) {
            items[slot] = item;
        }

        this.api.setWindowItems(windowId, items);
    }

    close(gui) {
        for (const [uuid, playerData] of this.playerGuis.entries()) {
            if (playerData.gui === gui) {
                this.api.closeWindow(playerData.windowId);
                this.playerGuis.delete(uuid);
                break;
            }
        }
    }
}

module.exports = GUIManager;