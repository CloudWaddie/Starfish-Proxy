function handleCalcCommand(ctx) {
    const { args, send, sendError } = ctx;
    const expression = args.expression;

    if (!expression || expression.length === 0) {
        return sendError('Usage: /proxy calc <expression>');
    }

    const fullExpression = Array.isArray(expression) ? expression.join(' ') : expression;

    try {
        // Basic validation to prevent malicious code
        const sanitizedExpression = fullExpression.replace(/[^-()\d/*+.]/g, '');
        if (sanitizedExpression !== fullExpression) {
            throw new Error('Invalid characters in expression.');
        }

        const result = new Function(`return ${sanitizedExpression}`)();
        send(`§6Result: §e${result}`);
    } catch (error) {
        sendError('Invalid calculation.');
    }
}

module.exports = { handleCalcCommand };
