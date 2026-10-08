import { describe, it, expect } from 'vitest';
import {
    normalizeKeywordList,
    mergeKeywordLists,
    findKeywordMatches,
    testKeywordFilter,
} from '../keyword-filter';

describe('normalizeKeywordList', () => {
    it('trims, drops empty entries and de-duplicates', () => {
        expect(normalizeKeywordList([' spam ', 'spam', '', '   ', 'ads']))
            .toEqual(['spam', 'ads']);
    });

    it('ignores non-array / non-string input', () => {
        expect(normalizeKeywordList(null)).toEqual([]);
        expect(normalizeKeywordList('spam')).toEqual([]);
        expect(normalizeKeywordList([null, 1, {}, 'ok'])).toEqual(['ok']);
    });

    it('keeps case variants because the worker matches case-sensitively', () => {
        expect(normalizeKeywordList(['SPAM', 'spam'])).toEqual(['SPAM', 'spam']);
    });
});

describe('mergeKeywordLists', () => {
    it('merges the three legacy lists into one unified list', () => {
        expect(mergeKeywordLists(['a', 'b'], ['b', 'c'], ['c', 'd']))
            .toEqual(['a', 'b', 'c', 'd']);
    });

    it('tolerates missing lists', () => {
        expect(mergeKeywordLists(undefined, ['x'], null)).toEqual(['x']);
        expect(mergeKeywordLists()).toEqual([]);
    });
});

describe('findKeywordMatches / testKeywordFilter', () => {
    it('reports no match against an empty keyword list', () => {
        expect(findKeywordMatches([], 'spammer@example.com')).toEqual([]);
        expect(testKeywordFilter([], 'spammer@example.com').passed).toBe(true);
    });

    it('matches case-insensitively on address and subject text', () => {
        expect(findKeywordMatches(['spam'], 'SpamBot@example.com')).toEqual(['spam']);
        expect(findKeywordMatches(['newsletter'], 'Weekly Newsletter #42'))
            .toEqual(['newsletter']);
    });

    it('reports every matching keyword, in list order', () => {
        expect(findKeywordMatches(['spam', 'ads', 'bot'], 'spam-bot ads'))
            .toEqual(['spam', 'ads', 'bot']);
    });

    it('returns a failing result only when at least one keyword hits', () => {
        expect(testKeywordFilter(['spam'], 'hello@world.com'))
            .toEqual({ passed: true, matched: [] });
        expect(testKeywordFilter(['spam'], 'spam@world.com'))
            .toEqual({ passed: false, matched: ['spam'] });
    });

    it('ignores blank test input', () => {
        expect(findKeywordMatches(['spam'], '   ')).toEqual([]);
        expect(findKeywordMatches(['spam'], undefined)).toEqual([]);
    });
});
