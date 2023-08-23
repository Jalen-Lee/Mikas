module.exports = {
    arrowParens: "always",
    bracketSpacing: true, // 对象大括号直接是否有空格，默认为 true，效果：{ a: 1 }
    endOfLine: "lf",
    htmlWhitespaceSensitivity: "css",
    insertPragma: false,
    bracketSameLine: false,
    jsxSingleQuote: false,
    printWidth: 180, //一行的字符数，如果超过会进行换行，默认为80
    proseWrap: "preserve",
    quoteProps: "as-needed",
    requirePragma: false,
    semi: true, // 行尾是否使用分号，默认为true
    singleQuote: false, // 字符串是否使用单引号，默认为 false，使用双引号
    tabWidth: 2, // 一个 tab 代表几个空格数，默认为 2 个
    trailingComma: "es5", // 是否使用尾逗号
    useTabs: false, //是否使用 tab 进行缩进，默认为false，表示用空格进行缩减
    vueIndentScriptAndStyle: false,
};