class GUI {
    constructor(manager, title, size) {
        this.manager = manager;
        this.title = title;
        this.size = size;
        this.items = new Map();
        this.clickHandlers = new Map();
        this.page = 0;
        this.itemsPerPage = size;
    }

    setItem(slot, item) {
        this.items.set(slot, item);
        return this;
    }

    onClick(slot, handler) {
        this.clickHandlers.set(slot, handler);
        return this;
    }

    show(player) {
        this.manager.show(player, this);
    }

    addBorder(item = { blockId: 160, itemDamage: 7, itemCount: 1, displayName: ' ' }) {
        this.borderItem = item;
        return this;
    }

    setPagination(itemsPerPage, prevPageItem, nextPageItem) {
        this.itemsPerPage = itemsPerPage;
        this.prevPageItem = prevPageItem;
        this.nextPageItem = nextPageItem;
        return this;
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

                this.api.sendTransaction(windowId, event.action, false);
                this.render(event.player, gui, windowId);

                if (gui.prevPageItem && event.slot === gui.size - 5 && gui.page > 0) {
                    gui.page--;
                    this.render(event.player, gui, windowId);
                    return;
                }

                if (gui.nextPageItem && event.slot === gui.size - 4 && (gui.page + 1) * gui.itemsPerPage < gui.items.size) {
                    gui.page++;
                    this.render(event.player, gui, windowId);
                    return;
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

        if (gui.borderItem) {
            for (let i = 0; i < gui.size; i++) {
                if (i < 9 || i >= gui.size - 9 || i % 9 === 0 || i % 9 === 8) {
                    items[i] = gui.borderItem;
                }
            }
        }

        const pageItems = Array.from(gui.items.values()).slice(gui.page * gui.itemsPerPage, (gui.page + 1) * gui.itemsPerPage);
        let contentSlot = 0;
        for (let i = 0; i < gui.size; i++) {
            if (items[i].blockId === -1) { // If not a border item
                if (contentSlot < pageItems.length) {
                    items[i] = pageItems[contentSlot];
                    contentSlot++;
                }
            }
        }

        if (gui.prevPageItem && gui.page > 0) {
            items[gui.size - 5] = gui.prevPageItem;
        } else {
            items[gui.size - 5] = gui.borderItem || { blockId: -1 };
        }

        if (gui.nextPageItem && (gui.page + 1) * gui.itemsPerPage < gui.items.size) {
            items[gui.size - 4] = gui.nextPageItem;
        } else {
            items[gui.size - 4] = gui.borderItem || { blockId: -1 };
        }


        this.api.setWindowItems(windowId, items);
    }
}

module.exports = GUIManager;