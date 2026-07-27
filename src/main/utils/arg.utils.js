class ApplicationUtils {

    static getArg(key, cd = true) {
        const arg = process.argv.find(s => s.startsWith(`--${key}${cd ? '=' : ''}`));
        if (arg) {
            const value = arg.replace(`--${key}${cd ? '=' : ''}`, '');
            return value ? value : true;
        }
        return cd ? this.getArg(key, false) : undefined;
    }
}

module.exports = {ApplicationUtils};