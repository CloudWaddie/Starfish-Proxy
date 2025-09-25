const THEME = require('./theme');

function sendAliasHelp(ctx) {
    const chat = ctx.createChat();
    chat.text('--- Command Alias Help ---', THEME.primary).newline();
    chat.text('/proxy alias <subcommand>', THEME.accent).newline();
    chat.text('Manages command aliases.', THEME.secondary).newline().newline();

    chat.text('Subcommands:', THEME.primary).newline();

    // Add
    chat.text('  add <alias> <command> [--passthrough]', THEME.accent).newline();
    chat.text('    Creates a new alias.', THEME.secondary).newline();
    chat.text('    - ', THEME.muted).text('<alias>', THEME.info).text(': The shorthand you want to type (e.g., "de").', THEME.secondary).newline();
    chat.text('    - ', THEME.muted).text('<command>', THEME.info).text(': The full command to execute (e.g., "/denicker").', THEME.secondary).newline();
    chat.text('    - ', THEME.muted).text('[--passthrough]', THEME.info).text(': (Optional) Sends the original alias to the server as well.', THEME.secondary).newline().newline();

    // Remove
    chat.text('  remove <alias>', THEME.accent).newline();
    chat.text('    Removes an existing alias.', THEME.secondary).newline();
    chat.text('    - ', THEME.muted).text('<alias>', THEME.info).text(': The alias to remove.', THEME.secondary).newline().newline();

    // List
    chat.text('  list', THEME.accent).newline();
    chat.text('    Shows all configured aliases.', THEME.secondary).newline();

    chat.send();
}

function handleAliasCommand(ctx) {
    const subcommand = ctx.args.subcommand;

    switch (subcommand) {
        case 'add':
            addAlias(ctx);
            break;
        case 'remove':
            removeAlias(ctx);
            break;
        case 'list':
            listAliases(ctx);
            break;
        default:
            sendAliasHelp(ctx);
            break;
    }
}

function addAlias(ctx) {
    const { alias } = ctx.args;
    let { command } = ctx.args;
    const passthrough = ctx.options.passthrough || false;

    if (Array.isArray(command)) {
        command = command.join(' ');
    }

    if (!alias || !command) {
        return ctx.sendError("Usage: /proxy alias add <alias> <command> [--passthrough]");
    }

    const normalizedAlias = alias.toLowerCase();
    if (normalizedAlias.startsWith('/')) {
        return ctx.sendError("Alias should not start with a forward slash '/'.");
    }

    const proxy = ctx.proxy;
    proxy.config.aliases = proxy.config.aliases || {};
    proxy.config.aliases[normalizedAlias] = {
        command: command,
        passthrough: passthrough
    };

    proxy.storage.saveConfig(proxy.config);
    ctx.sendSuccess(`Alias '${normalizedAlias}' created for '${command}'. Passthrough: ${passthrough}`);
}

function removeAlias(ctx) {
    const { alias } = ctx.args;
    if (!alias) {
        return ctx.sendError("Usage: /proxy alias remove <alias>");
    }

    const normalizedAlias = alias.toLowerCase();
    const proxy = ctx.proxy;

    if (proxy.config.aliases && proxy.config.aliases[normalizedAlias]) {
        delete proxy.config.aliases[normalizedAlias];
        proxy.storage.saveConfig(proxy.config);
        ctx.sendSuccess(`Alias '${normalizedAlias}' removed.`);
    } else {
        ctx.sendError(`Alias '${normalizedAlias}' not found.`);
    }
}

function listAliases(ctx) {
    const proxy = ctx.proxy;
    const aliases = proxy.config.aliases || {};
    const aliasEntries = Object.entries(aliases);

    if (aliasEntries.length === 0) {
        return ctx.send(`${THEME.info}No aliases configured.`);
    }

    const chat = ctx.createChat();
    chat.text('--- Configured Aliases ---', THEME.primary).newline();

    aliasEntries.forEach(([alias, config]) => {
        const passthroughText = config.passthrough ? ' (passthrough)' : '';
        chat.text(`/${alias}`, THEME.accent)
            .text(' -> ', THEME.muted)
            .text(config.command, THEME.secondary)
            .text(passthroughText, THEME.info)
            .newline();
    });

    chat.send();
}

module.exports = { handleAliasCommand };
