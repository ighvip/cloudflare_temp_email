// 问题7: 后台「全局邮件设置」把三个旧关键词列表
// (blockList 建址屏蔽 / sendBlockList 发信屏蔽 / fromBlockList 来信来源屏蔽)
// 合并成一个「关键词过滤」列表，这里给出与 Vue / 网络无关的纯函数：
// 合并、去重、以及测试器使用的命中判断。

// 去掉空白项与重复项（保留大小写差异，后端是大小写敏感的子串匹配）
export const normalizeKeywordList = (list) => {
    if (!Array.isArray(list)) return []
    const seen = new Set()
    const result = []
    for (const item of list) {
        if (typeof item !== 'string') continue
        const keyword = item.trim()
        if (!keyword || seen.has(keyword)) continue
        seen.add(keyword)
        result.push(keyword)
    }
    return result
}

// 合并任意多个旧列表为一个去重后的统一列表
export const mergeKeywordLists = (...lists) => normalizeKeywordList(lists.flat())

// 测试器：返回 text 中命中的关键词（大小写不敏感，比后端更保守，
// 只会多报命中，不会漏报）
export const findKeywordMatches = (keywords, text) => {
    const list = normalizeKeywordList(keywords)
    if (typeof text !== 'string' || !text.trim()) return []
    const haystack = text.toLowerCase()
    return list.filter((keyword) => haystack.includes(keyword.toLowerCase()))
}

// 测试器结果：passed 为 true 表示这段文本通过关键词过滤
export const testKeywordFilter = (keywords, text) => {
    const matched = findKeywordMatches(keywords, text)
    return { passed: matched.length === 0, matched }
}
